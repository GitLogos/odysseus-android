/* launcher/launcher.js — server picker for the Odysseus Android app.
 * Plain classic script, zero dependencies. Runs on the LOCAL launcher origin
 * (capacitor https://localhost) before navigating to the user's server.
 *
 * Connectivity probing is CORS-aware on purpose: the launcher origin differs
 * from the server origin, so a readable fetch needs CORS headers — but those
 * are NOT required for the app itself (once navigated, page and API share the
 * server origin). Strategy:
 *   1. Try a normal CORS fetch of /api/auth/status -> can even show the username.
 *   2. On TypeError (blocked/unreadable), fall back to a `no-cors` probe: an
 *      opaque-but-resolved response proves reachability without needing headers.
 * Either success means "safe to connect". Auth happens on the server page.
 */
(function () {
  'use strict';

  var SERVER_KEY = 'odysseus-server-url';
  var TIMEOUT_MS = 10000;

  var $ = function (id) { return document.getElementById(id); };
  var input = $('url'), errEl = $('err'), okEl = $('ok');
  var btnTest = $('test'), btnSave = $('save');
  var form = $('form'), reconnect = $('reconnect');

  function normalize(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url;
  }

  function stored() {
    try { return normalize(window.localStorage.getItem(SERVER_KEY) || ''); }
    catch (_) { return ''; }
  }

  function persist(url) {
    try {
      if (url) window.localStorage.setItem(SERVER_KEY, url);
      else window.localStorage.removeItem(SERVER_KEY);
    } catch (_) {}
  }

  function setBusy(busy) {
    btnTest.disabled = busy;
    btnSave.disabled = busy;
  }

  function sayErr(m) { errEl.textContent = m || ''; if (m) okEl.textContent = ''; }
  function sayOk(m) { okEl.textContent = m || ''; if (m) errEl.textContent = ''; }

  function fetchTimeout(url, opts) {
    var ctrl = null, timer = null;
    try {
      ctrl = new AbortController();
      timer = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, TIMEOUT_MS);
      opts = opts || {};
      opts.signal = ctrl.signal;
      return window.fetch(url, opts).then(
        function (res) { if (timer) clearTimeout(timer); return res; },
        function (e) { if (timer) clearTimeout(timer); throw e; }
      );
    } catch (e) {
      if (timer) clearTimeout(timer);
      return Promise.reject(e);
    }
  }

  /** Resolve { state: 'cors'|'opaque', username } or reject with a message. */
  function probe(base) {
    var clean = normalize(base);
    if (!clean) return Promise.reject(new Error('Enter your server URL first.'));
    return fetchTimeout(clean + '/api/auth/status', { credentials: 'include' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error('Server answered HTTP ' + res.status + '.');
          return { state: 'cors', base: clean, username: data && (data.username || data.user) || '' };
        });
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') throw new Error('Timed out — check host, port, and HTTP/HTTPS.');
        if (e && e.message && e.message.indexOf('HTTP ') === 0) throw e;
        // Blocked/unreadable (very likely just missing CORS headers on an old
        // server — irrelevant once the app itself runs on that origin).
        // A no-cors probe distinguishes "reachable" from "unreachable".
        return fetchTimeout(clean + '/api/auth/status', { mode: 'no-cors' }).then(
          function () { return { state: 'opaque', base: clean, username: '' }; },
          function () { throw new Error('Unreachable. Check the URL and that the server is running.'); }
        );
      });
  }

  function go(base) {
    window.location.assign(base);
  }

  btnTest.addEventListener('click', function () {
    setBusy(true); sayErr(''); sayOk('Testing…');
    probe(input.value).then(function (r) {
      setBusy(false);
      if (r.state === 'cors') {
        sayOk(r.username
          ? 'Reachable — signed in as ' + r.username + '. Tap Save & connect.'
          : 'Reachable. Tap Save & connect.');
      } else {
        sayOk('Reachable (loads in-app — no extra server setup needed). Tap Save & connect.');
      }
    }).catch(function (e) {
      setBusy(false);
      sayErr((e && e.message) || 'Unreachable.');
    });
  });

  btnSave.addEventListener('click', function () {
    setBusy(true); sayErr(''); sayOk('Connecting…');
    probe(input.value).then(function (r) {
      persist(r.base);
      go(r.base);
    }).catch(function (e) {
      setBusy(false);
      sayErr((e && e.message) || 'Unreachable.');
    });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); btnSave.click(); }
  });

  // Returning user: offer one-tap reconnect (auto-goods after a beat unless
  // they hit Change). Hash #setup forces the form (e.g. after clearing data
  // or when the saved host moved).
  var current = stored();
  if (current && window.location.hash !== '#setup') {
    form.classList.add('hidden');
    reconnect.classList.remove('hidden');
    $('title').textContent = 'Odysseus';
    $('blurb').textContent = '';
    $('reconnect-text').textContent = 'Saved server: ' + current;
    var timer = setTimeout(function () { go(current); }, 1500);
    $('change').addEventListener('click', function () {
      clearTimeout(timer);
      reconnect.classList.add('hidden');
      form.classList.remove('hidden');
      $('title').textContent = 'Connect to your server';
      input.value = current;
      try { input.focus(); } catch (_) {}
    });
    $('go').addEventListener('click', function () {
      clearTimeout(timer);
      go(current);
    });
  } else if (current) {
    input.value = current;
  }
})();
