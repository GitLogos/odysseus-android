// static/js/capacitor-server.js
// ES-module companion to capacitor-boot.js (which runs first as a classic
// script and owns the fetch/XHR patch + localStorage persistence).
//
// Import this from app modules that need the remote base explicitly
// (onboarding UI, connection tests, "change server" settings row).
// Hot-path API calls do NOT need to import this: the boot patch already
// rewrites relative `/api/*` fetches automatically.

export function isNative() {
  return !!window.__odysseusCapacitorNative;
}

/** Currently configured remote server base ('' = same-origin web mode). */
export function getServerUrl() {
  try {
    if (typeof window.__odysseusGetServerUrl === 'function') {
      return window.__odysseusGetServerUrl() || '';
    }
  } catch (_) {}
  try {
    return window.localStorage.getItem('odysseus-server-url') || '';
  } catch (_) {
    return '';
  }
}

/** Persist + activate a new server URL. Returns the normalized base. */
export function setServerUrl(url) {
  if (typeof window.__odysseusSetServerUrl === 'function') {
    return window.__odysseusSetServerUrl(url);
  }
  var clean = String(url || '').trim().replace(/\/+$/, '');
  if (clean && !/^https?:\/\//i.test(clean)) clean = 'http://' + clean;
  try {
    if (clean) window.localStorage.setItem('odysseus-server-url', clean);
    else window.localStorage.removeItem('odysseus-server-url');
  } catch (_) {}
  window.__odysseusServerUrl = clean;
  return clean;
}

export function clearServerUrl() {
  return setServerUrl('');
}

/** Absolute URL for an app path (remote in native, untouched in web). */
export function apiUrl(path) {
  if (typeof window.__odysseusApiUrl === 'function') return window.__odysseusApiUrl(path);
  return path;
}

/**
 * Probe a server base: GET <base>/api/auth/status with a timeout.
 * Resolves { ok, status, username } or rejects with an Error message.
 */
export async function testServerUrl(base, timeoutMs) {
  var clean = String(base || '').trim().replace(/\/+$/, '');
  if (!clean) throw new Error('Enter your server URL first.');
  if (!/^https?:\/\//i.test(clean)) clean = 'http://' + clean;
  var ctrl = null;
  var timer = null;
  try {
    ctrl = new AbortController();
    timer = setTimeout(function () {
      try {
        ctrl.abort();
      } catch (_) {}
    }, timeoutMs || 10000);
    // Bypass the boot rewrite (absolute URL to a third-party host is left
    // alone by shouldRewrite) so a not-yet-saved candidate can be probed.
    var doFetch = window.__odysseusOrigFetch || fetch;
    var res = await doFetch(clean + '/api/auth/status', {
      credentials: 'include',
      signal: ctrl.signal,
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error('Server answered HTTP ' + res.status + '.');
    return { ok: true, base: clean, status: data };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Timed out — check host, port, and HTTP/HTTPS.');
    throw new Error(
      (e && e.message) || 'Unreachable. Check the URL, reverse proxy, and ALLOWED_ORIGINS on the server.'
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
