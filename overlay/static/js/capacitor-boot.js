/* static/js/capacitor-boot.js
 * Classic (non-module) script. Loads BEFORE all ES modules from index.html /
 * login.html so it can patch fetch/XHR and set global flags first.
 *
 * What it does:
 *  1. Detects Capacitor native (`window.Capacitor.isNativePlatform()`).
 *  2. Resolves the remote API base (native only): the self-hosted server URL
 *     the user entered in onboarding, persisted in localStorage under
 *     `odysseus-server-url`. Browser mode: empty = same-origin (unchanged).
 *  3. Patches fetch + XHR: relative `/api/*` (and bare `/login`) requests are
 *     rewritten to the remote base. `/static/*` is NEVER rewritten — those
 *     files are bundled in the APK (webDir='static') and must load from disk
 *     for the instant-start / caching win.
 *  4. Stale-while-revalidate micro-cache for the two hot startup endpoints
 *     (GET /api/auth/settings, GET /api/tools): successful responses are
 *     snapshotted to localStorage so a cold start can paint from cache while
 *     the network revalidates. Exposed via window.__odysseusCachedApi.
 *  5. Disables service-worker registration in native (the bundle IS the
 *     cache; SW adds a second stale layer + file:// headaches).
 *
 * No dependency on @capacitor/* npm packages — safe to ship to plain browsers
 * as a no-op (non-native => everything below is skipped).
 */
(function () {
  'use strict';

  var SERVER_KEY = 'odysseus-server-url';

  function isNative() {
    try {
      return !!(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
      );
    } catch (_) {
      return false;
    }
  }

  var NATIVE = isNative();
  window.__odysseusCapacitorNative = NATIVE;
  try {
    if (NATIVE) document.documentElement.classList.add('ody-capacitor-native');
  } catch (_) {}

  function normalizeBase(url) {
    if (!url) return '';
    url = String(url).trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url;
  }

  function getServerUrl() {
    // Build-time override wins (useful for branded/internal builds).
    try {
      if (window.__ODYSSEUS_SERVER_URL) return normalizeBase(window.__ODYSSEUS_SERVER_URL);
    } catch (_) {}
    // Native: persisted onboarding choice.
    if (NATIVE) {
      try {
        return normalizeBase(window.localStorage.getItem(SERVER_KEY) || '');
      } catch (_) {
        return '';
      }
    }
    return '';
  }

  var SERVER_URL = getServerUrl();
  window.__odysseusServerUrl = SERVER_URL;
  window.__odysseusGetServerUrl = function () {
    SERVER_URL = getServerUrl();
    window.__odysseusServerUrl = SERVER_URL;
    return SERVER_URL;
  };

  /** Resolve an app path to a fetchable URL: remote in native, as-is in web. */
  window.__odysseusApiUrl = function (path) {
    path = String(path || '');
    var base = window.__odysseusGetServerUrl();
    if (!base) return path;
    if (/^https?:\/\//i.test(path)) return path; // already absolute
    if (path.charAt(0) !== '/') path = '/' + path;
    return base + path;
  };

  window.__odysseusSetServerUrl = function (url) {
    var clean = normalizeBase(url);
    try {
      if (clean) window.localStorage.setItem(SERVER_KEY, clean);
      else window.localStorage.removeItem(SERVER_KEY);
    } catch (_) {}
    SERVER_URL = clean;
    window.__odysseusServerUrl = clean;
    // Warm the connection + let CSS/theme follow the new backend fast.
    try {
      if (clean) {
        var l = document.createElement('link');
        l.rel = 'preconnect';
        l.href = clean;
        document.head.appendChild(l);
      }
    } catch (_) {}
    return clean;
  };

  // ---- tiny stale-while-revalidate snapshot cache (startup endpoints) ----
  var SNAP_KEYS = {
    '/api/auth/settings': 'odysseus-cap-cache-settings',
    '/api/tools': 'odysseus-cap-cache-tools',
  };
  function snapshotKey(path) {
    try {
      var u = new URL(path, 'http://x');
      return SNAP_KEYS[u.pathname] || null;
    } catch (_) {
      return null;
    }
  }
  function snapshotStore(path, obj) {
    var k = snapshotKey(path);
    if (!k) return;
    try {
      window.localStorage.setItem(k, JSON.stringify({ t: Date.now(), v: obj }));
    } catch (_) {}
  }
  window.__odysseusCachedApi = function (apiPath) {
    var k = snapshotKey(apiPath);
    if (!k) return null;
    try {
      var raw = window.localStorage.getItem(k);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.v !== undefined ? parsed.v : null;
    } catch (_) {
      return null;
    }
  };

  function shouldRewrite(url) {
    if (!NATIVE || !window.__odysseusGetServerUrl()) return false;
    if (typeof url !== 'string') return false;
    if (/^https?:\/\//i.test(url)) {
      // Absolute same-origin URL (API_BASE = location.origin pattern):
      // rewrite only when it points at the local WebView host.
      try {
        var u = new URL(url);
        var loc = window.location;
        var isLocalHost =
          u.host === loc.host &&
          (u.protocol === 'capacitor:' ||
            u.protocol === 'ionic:' ||
            u.hostname === 'localhost' ||
            u.hostname === loc.hostname);
        if (!isLocalHost) return false;
        return u.pathname.indexOf('/api/') === 0 || u.pathname === '/login';
      } catch (_) {
        return false;
      }
    }
    return url.indexOf('/api/') === 0 || url === '/login';
  }

  function rewriteUrl(url) {
    var base = window.__odysseusGetServerUrl();
    if (/^https?:\/\//i.test(url)) {
      try {
        var u = new URL(url);
        return base + u.pathname + u.search + u.hash;
      } catch (_) {
        return url;
      }
    }
    return base + url;
  }

  // ---- fetch patch ----
  try {
    var origFetch = window.fetch.bind(window);
    window.__odysseusOrigFetch = origFetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      var method = 'GET';
      try {
        if (init && init.method) method = String(init.method).toUpperCase();
        else if (input && input.method) method = String(input.method).toUpperCase();
      } catch (_) {}
      if (url && shouldRewrite(url)) {
        var newUrl = rewriteUrl(url);
        if (typeof input === 'string') {
          var nextInit = init ? Object.assign({}, init) : {};
          // Cross-origin to the home server: cookies still work via the
          // Capacitor WebView as long as credentials are included.
          if (!nextInit.credentials) nextInit.credentials = 'include';
          var p = origFetch(newUrl, nextInit);
          // Snapshot hot GET endpoints for instant next cold start.
          if (method === 'GET') {
            p.then(function (res) {
              try {
                if (res && res.ok) {
                  res
                    .clone()
                    .json()
                    .then(function (j) {
                      snapshotStore(url, j);
                    })
                    .catch(function () {});
                }
              } catch (_) {}
            }).catch(function () {});
          }
          return p;
        }
        // Request object: rebuild with the remote URL.
        try {
          var reqInit = {
            method: input.method,
            headers: input.headers,
            body: input.body,
            mode: 'cors',
            credentials: 'include',
            cache: input.cache,
            redirect: input.redirect,
            referrer: input.referrer,
            integrity: input.integrity,
          };
          return origFetch(new Request(newUrl, reqInit));
        } catch (_) {
          return origFetch(newUrl, init);
        }
      }
      return origFetch(input, init);
    };
  } catch (_) {}

  // ---- XHR patch (covers libs that bypass fetch) ----
  try {
    var origOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      if (typeof url === 'string' && shouldRewrite(url)) {
        arguments[1] = rewriteUrl(url);
      }
      return origOpen.apply(this, arguments);
    };
  } catch (_) {}

  // ---- service worker: no-op in native (bundle is the cache) ----
  if (NATIVE) {
    try {
      if ('serviceWorker' in navigator) {
        var sw = navigator.serviceWorker;
        if (sw && sw.register) {
          var noop = function () {
            return Promise.resolve({ unregister: function () { return Promise.resolve(true); } });
          };
          try {
            sw.register = noop;
          } catch (_) {}
        }
        // Drop any SW that was registered by a previous remote-load version.
        if (sw && sw.getRegistrations) {
          sw.getRegistrations()
            .then(function (regs) {
              (regs || []).forEach(function (r) {
                try {
                  r.unregister();
                } catch (_) {}
              });
            })
            .catch(function () {});
        }
      }
    } catch (_) {}
  }

  // ---- preconnect to the known server ASAP (faster first API round-trip) ----
  try {
    if (NATIVE && SERVER_URL) {
      var pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = SERVER_URL;
      pre.crossOrigin = 'use-credentials';
      document.head.appendChild(pre);
    }
  } catch (_) {}
})();
