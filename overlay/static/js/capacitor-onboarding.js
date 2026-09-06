// static/js/capacitor-onboarding.js
// Blocking "connect to your server" sheet for the native app.
//
// Shown automatically on boot when running in Capacitor AND no server URL is
// stored yet. Exposes window.__odysseusShowServerSetup() so Settings can offer
// a "Change server" row later. In plain browsers this module is inert.
import { getServerUrl, setServerUrl, testServerUrl } from './capacitor-server.js';

var OVERLAY_ID = 'ody-cap-server-overlay';
var shown = false;

function isNative() {
  return !!window.__odysseusCapacitorNative;
}

function css() {
  return (
    '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(10,12,16,.72);backdrop-filter:blur(6px);padding:20px;box-sizing:border-box}' +
    '#' + OVERLAY_ID + ' .ody-cap-card{width:100%;max-width:420px;background:var(--panel,#2b303b);color:var(--fg,#e6e6e6);' +
    'border:1px solid var(--border,#3d434f);border-radius:14px;padding:22px;box-sizing:border-box;' +
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.5)}' +
    '#' + OVERLAY_ID + ' h2{margin:0 0 6px;font-size:18px}' +
    '#' + OVERLAY_ID + ' p{margin:0 0 14px;font-size:13px;opacity:.8;line-height:1.5}' +
    '#' + OVERLAY_ID + ' input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;font-size:15px;' +
    'background:var(--input-bg,#1f232c);color:var(--fg,#e6e6e6);border:1px solid var(--input-border,#3d434f);outline:none}' +
    '#' + OVERLAY_ID + ' input:focus{border-color:var(--accent-primary,#e06c75)}' +
    '#' + OVERLAY_ID + ' .ody-cap-err{min-height:20px;font-size:12.5px;color:#ff8f8f;margin:8px 0 4px}' +
    '#' + OVERLAY_ID + ' .ody-cap-row{display:flex;gap:10px;margin-top:10px}' +
    '#' + OVERLAY_ID + ' button{flex:1;padding:11px;border-radius:9px;border:0;font-size:14.5px;font-weight:600;cursor:pointer}' +
    '#' + OVERLAY_ID + ' .ody-cap-test{background:transparent;color:var(--fg,#e6e6e6);border:1px solid var(--border,#3d434f)}' +
    '#' + OVERLAY_ID + ' .ody-cap-save{background:var(--send-btn-bg,#e06c75);color:#fff}' +
    '#' + OVERLAY_ID + ' button:disabled{opacity:.55;cursor:wait}' +
    '#' + OVERLAY_ID + ' .ody-cap-hint{margin-top:12px;font-size:12px;opacity:.65;line-height:1.5}'
  );
}

function ensureStyle() {
  if (document.getElementById('ody-cap-server-style')) return;
  var s = document.createElement('style');
  s.id = 'ody-cap-server-style';
  s.textContent = css();
  document.head.appendChild(s);
}

function dismiss() {
  var el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
  shown = false;
}

export function showServerSetup(opts) {
  opts = opts || {};
  if (!isNative() && !opts.force) return false;
  if (shown) return true;
  shown = true;
  ensureStyle();
  dismiss();
  shown = true;

  var overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML =
    '<div class="ody-cap-card" role="dialog" aria-modal="true" aria-label="Connect to your Odysseus server">' +
    '<h2>Connect to your server</h2>' +
    '<p>Odysseus runs on <b>your</b> hardware. Enter where it is reachable — ' +
    'e.g. <code>http://192.168.1.20:7000</code> on your LAN or <code>https://ai.example.com</code> remotely.</p>' +
    '<input id="ody-cap-url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
    'placeholder="http://192.168.1.20:7000" />' +
    '<div class="ody-cap-err" id="ody-cap-err"></div>' +
    '<div class="ody-cap-row">' +
    '<button class="ody-cap-test" id="ody-cap-test" type="button">Test</button>' +
    '<button class="ody-cap-save" id="ody-cap-save" type="button">Save &amp; connect</button>' +
    '</div>' +
    '<div class="ody-cap-hint">UI, themes and editors stay cached on-device; only chats &amp; data load from the server. ' +
    'Use HTTP for LAN IPs, HTTPS for public hosts.</div>' +
    '</div>';

  // Non-blocking when the user explicitly re-opens it from Settings.
  if (opts.dismissable) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismiss();
    });
  }
  document.body.appendChild(overlay);

  var input = overlay.querySelector('#ody-cap-url');
  var err = overlay.querySelector('#ody-cap-err');
  var btnTest = overlay.querySelector('#ody-cap-test');
  var btnSave = overlay.querySelector('#ody-cap-save');
  var current = getServerUrl();
  if (current) input.value = current;
  setTimeout(function () {
    try {
      input.focus();
    } catch (_) {}
  }, 60);

  function setBusy(busy, msg) {
    btnTest.disabled = busy;
    btnSave.disabled = busy;
    if (msg !== undefined) err.textContent = msg;
  }

  btnTest.addEventListener('click', async function () {
    setBusy(true, 'Testing…');
    try {
      var r = await testServerUrl(input.value);
      var who = (r.status && (r.status.username || r.status.user)) || '';
      setBusy(false, who ? 'Reachable — signed in as ' + who + '. Tap Save & connect.' : 'Reachable. Tap Save & connect.');
    } catch (e) {
      setBusy(false, (e && e.message) || 'Unreachable.');
    }
  });

  btnSave.addEventListener('click', async function () {
    setBusy(true, 'Connecting…');
    try {
      var r = await testServerUrl(input.value);
      setServerUrl(r.base);
      // Persisted + fetch patch picks it up immediately; reload so every
      // module boots against the right backend on first pass.
      window.location.reload();
    } catch (e) {
      setBusy(false, (e && e.message) || 'Unreachable.');
    }
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSave.click();
    }
  });
  return true;
}

/** Auto-show on native boot when no server is configured yet. */
export function maybeShowOnBoot() {
  if (!isNative()) return false;
  if (getServerUrl()) return false;
  function ready() {
    if (document.body) showServerSetup({});
    else setTimeout(ready, 100);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      showServerSetup({});
    });
  } else {
    ready();
  }
  return true;
}

try {
  window.__odysseusShowServerSetup = function () {
    return showServerSetup({ dismissable: true, force: true });
  };
} catch (_) {}
