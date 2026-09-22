/* launcher/launcher.js — local connection and device settings UI.
 *
 * The remote Odysseus page remains untouched. Every branch gets normal
 * top-level navigation; optional URL/native hooks are guarded so older
 * servers behave like an ordinary WebView.
 */
(function () {
  'use strict';

  var SERVER_KEY = 'odysseus-server-url';
  var SETTINGS_KEY = 'odysseus-app-settings-v1';
  var TIMEOUT_MS = 10000;
  var logic = window.OdysseusLauncherLogic;
  var nativeShell;
  var reconnectTimer;

  var defaults = {
    keepSignedIn: true,
    strictChat: false,
    keepAwake: false,
  };

  var $ = function (id) { return document.getElementById(id); };
  var input = $('url');
  var errEl = $('err');
  var okEl = $('ok');
  var btnTest = $('test');
  var btnSave = $('save');
  var form = $('form');
  var reconnect = $('reconnect');
  var settingsPanel = $('settings');
  var settingsStatus = $('settings-status');

  function getNativeShell() {
    if (nativeShell !== undefined) return nativeShell;
    try {
      nativeShell = window.Capacitor && typeof window.Capacitor.registerPlugin === 'function'
        ? window.Capacitor.registerPlugin('OdysseusShell')
        : null;
    } catch (_) {
      nativeShell = null;
    }
    return nativeShell;
  }

  function loadSettings() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        keepSignedIn: parsed.keepSignedIn !== false,
        strictChat: parsed.strictChat === true,
        keepAwake: parsed.keepAwake === true,
      };
    } catch (_) {
      return Object.assign({}, defaults);
    }
  }

  function saveSettings(settings) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function storedServer() {
    try {
      return logic.normalize(window.localStorage.getItem(SERVER_KEY) || '');
    } catch (_) {
      return '';
    }
  }

  function persistServer(url) {
    if (url) window.localStorage.setItem(SERVER_KEY, url);
    else window.localStorage.removeItem(SERVER_KEY);
  }

  function setBusy(busy) {
    btnTest.disabled = busy;
    btnSave.disabled = busy;
  }

  function sayErr(message) {
    errEl.textContent = message || '';
    if (message) okEl.textContent = '';
  }

  function sayOk(message) {
    okEl.textContent = message || '';
    if (message) errEl.textContent = '';
  }

  function setSettingsStatus(message, error) {
    settingsStatus.textContent = message || '';
    settingsStatus.classList.toggle('error', !!error);
  }

  function fetchTimeout(url, opts) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    opts = opts || {};
    opts.signal = ctrl.signal;
    return window.fetch(url, opts).then(
      function (res) { clearTimeout(timer); return res; },
      function (error) { clearTimeout(timer); throw error; }
    );
  }

  function probe(base) {
    var clean = logic.normalize(base);
    if (!clean) return Promise.reject(new Error('Enter a valid HTTP or HTTPS server URL.'));
    return fetchTimeout(clean + '/api/auth/status', { credentials: 'include' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error('Server answered HTTP ' + res.status + '.');
          return {
            state: 'cors',
            base: clean,
            username: data && (data.username || data.user) || '',
          };
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('Timed out — check host, port, and HTTP/HTTPS.');
        }
        if (error && error.message && error.message.indexOf('HTTP ') === 0) throw error;
        return fetchTimeout(clean + '/api/auth/status', { mode: 'no-cors' }).then(
          function () { return { state: 'opaque', base: clean, username: '' }; },
          function () {
            throw new Error('Unreachable. Check the URL and that the server is running.');
          }
        );
      });
  }

  async function prepareNative(settings) {
    var shell = getNativeShell();
    if (!shell) {
      if (!settings.keepSignedIn) {
        throw new Error('Session cleanup is unavailable in this build; connection cancelled.');
      }
      return;
    }
    if (!settings.keepSignedIn) await shell.clearWebData();
    await shell.setKeepAwake({ enabled: settings.keepAwake });
  }

  async function connect(base) {
    var clean = logic.normalize(base);
    if (!clean) throw new Error('The saved server URL is invalid.');
    var settings = loadSettings();
    await prepareNative(settings);
    window.location.replace(logic.destination(clean, settings.strictChat));
  }

  function cancelReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function showConnectForm(server) {
    cancelReconnect();
    reconnect.classList.add('hidden');
    settingsPanel.classList.add('hidden');
    form.classList.remove('hidden');
    $('title').textContent = 'Connect to your server';
    $('blurb').textContent = 'Enter the address of your Odysseus server.';
    input.value = server || '';
    try { input.focus(); } catch (_) {}
  }

  function syncSettingsControls() {
    var settings = loadSettings();
    $('keep-signed-in').checked = settings.keepSignedIn;
    $('strict-chat').checked = settings.strictChat;
    $('keep-awake').checked = settings.keepAwake;
  }

  function showSettings() {
    cancelReconnect();
    form.classList.add('hidden');
    reconnect.classList.add('hidden');
    settingsPanel.classList.remove('hidden');
    $('title').textContent = 'App settings';
    $('blurb').textContent = 'These controls are stored on this device and do not modify the server.';
    syncSettingsControls();
    setSettingsStatus('', false);
    refreshMicrophoneStatus();
  }

  function showReconnect(server) {
    form.classList.add('hidden');
    settingsPanel.classList.add('hidden');
    reconnect.classList.remove('hidden');
    $('title').textContent = 'Odysseus';
    $('blurb').textContent = '';
    $('reconnect-text').textContent = 'Saved server: ' + server;
    $('reconnect-error').textContent = '';
    reconnectTimer = setTimeout(function () {
      connect(server).catch(function (error) {
        $('reconnect-error').textContent = error.message || 'Unable to connect.';
      });
    }, 2000);
  }

  async function refreshMicrophoneStatus() {
    var shell = getNativeShell();
    var status = $('mic-status');
    var button = $('grant-mic');
    if (!shell) {
      status.textContent = 'Unavailable outside the Android app';
      button.disabled = true;
      return;
    }
    try {
      var result = await shell.getMicrophoneStatus();
      status.textContent = result.granted
        ? 'Granted — browser voice recording is available'
        : result.state === 'denied'
          ? 'Denied — enable Microphone in Android app settings'
          : 'Not granted';
      button.disabled = !!result.granted || result.state === 'denied';
    } catch (error) {
      status.textContent = 'Could not read microphone permission';
      button.disabled = true;
      setSettingsStatus(error.message || 'Microphone check failed.', true);
    }
  }

  btnTest.addEventListener('click', function () {
    setBusy(true);
    sayErr('');
    sayOk('Testing…');
    probe(input.value).then(function (result) {
      setBusy(false);
      sayOk(result.username
        ? 'Reachable — signed in as ' + result.username + '.'
        : 'Reachable. Tap Save & connect.');
    }).catch(function (error) {
      setBusy(false);
      sayErr(error.message || 'Unreachable.');
    });
  });

  btnSave.addEventListener('click', function () {
    setBusy(true);
    sayErr('');
    sayOk('Connecting…');
    probe(input.value).then(async function (result) {
      persistServer(result.base);
      await connect(result.base);
    }).catch(function (error) {
      setBusy(false);
      sayErr(error.message || 'Unable to connect.');
    });
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      btnSave.click();
    }
  });

  $('change').addEventListener('click', function () {
    showConnectForm(storedServer());
  });
  $('settings-open').addEventListener('click', showSettings);
  $('go').addEventListener('click', function () {
    cancelReconnect();
    $('reconnect-error').textContent = 'Connecting…';
    connect(storedServer()).catch(function (error) {
      $('reconnect-error').textContent = error.message || 'Unable to connect.';
    });
  });
  $('settings-close').addEventListener('click', function () {
    var server = storedServer();
    if (server) showReconnect(server);
    else showConnectForm('');
  });
  $('settings-change-server').addEventListener('click', function () {
    showConnectForm(storedServer());
  });

  ['keep-signed-in', 'strict-chat', 'keep-awake'].forEach(function (id) {
    $(id).addEventListener('change', async function () {
      var settings = loadSettings();
      settings.keepSignedIn = $('keep-signed-in').checked;
      settings.strictChat = $('strict-chat').checked;
      settings.keepAwake = $('keep-awake').checked;
      saveSettings(settings);
      if (id === 'keep-awake') {
        var shell = getNativeShell();
        if (shell) {
          try {
            await shell.setKeepAwake({ enabled: settings.keepAwake });
          } catch (error) {
            setSettingsStatus(error.message || 'Could not update screen wake.', true);
          }
        }
      }
    });
  });

  $('grant-mic').addEventListener('click', async function () {
    var shell = getNativeShell();
    if (!shell) return;
    $('grant-mic').disabled = true;
    setSettingsStatus('Requesting microphone permission…', false);
    try {
      var result = await shell.requestMicrophone();
      if (!result.granted) {
        setSettingsStatus(
          result.state === 'denied'
            ? 'Permission denied. Enable Microphone in Android app settings.'
            : 'Microphone permission was not granted.',
          true
        );
        await refreshMicrophoneStatus();
        return;
      }
      if (result.restartRequired) {
        setSettingsStatus('Permission granted. Restarting the app to initialize audio…', false);
        setTimeout(function () {
          shell.restartApp().catch(function (error) {
            setSettingsStatus(error.message || 'Automatic restart failed.', true);
          });
        }, 600);
      } else {
        setSettingsStatus('Microphone permission is already granted.', false);
        await refreshMicrophoneStatus();
      }
    } catch (error) {
      setSettingsStatus(error.message || 'Microphone permission request failed.', true);
      await refreshMicrophoneStatus();
    }
  });

  async function clearWebData(message) {
    var shell = getNativeShell();
    if (!shell) {
      setSettingsStatus('Web data controls are unavailable in this build.', true);
      return;
    }
    setSettingsStatus('Clearing cookies and WebView cache…', false);
    try {
      await shell.clearWebData();
      setSettingsStatus(message, false);
    } catch (error) {
      setSettingsStatus(error.message || 'Could not clear web data.', true);
    }
  }

  $('logout').addEventListener('click', function () {
    clearWebData('Signed out. Server and app settings were kept.');
  });
  $('clear-web-data').addEventListener('click', function () {
    clearWebData('Cookies and WebView cache cleared. App settings were kept.');
  });

  var current = storedServer();
  if (window.location.hash === '#settings') showSettings();
  else if (window.location.hash === '#setup') showConnectForm(current);
  else if (current) showReconnect(current);
  else showConnectForm('');
})();
