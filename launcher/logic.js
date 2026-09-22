(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OdysseusLauncherLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalize(url) {
    var value = String(url || '').trim().replace(/\/+$/, '');
    if (!value) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
      return '';
    }
    if (!/^https?:\/\//i.test(value)) value = 'http://' + value;
    var parsed;
    try {
      parsed = new URL(value);
    } catch (_) {
      return '';
    }
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) return '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  function destination(serverUrl, strictChat) {
    var normalized = normalize(serverUrl);
    if (!normalized) return '';
    var parsed = new URL(normalized);
    if (strictChat) parsed.searchParams.set('strict_chat', '1');
    else parsed.searchParams.delete('strict_chat');
    return parsed.toString().replace(/\/$/, '');
  }

  return {
    normalize: normalize,
    destination: destination,
  };
});
