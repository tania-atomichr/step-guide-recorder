/* WHERE A FINISHED GUIDE GOES. This file is the only place the extension
   talks to anything outside the browser, so connecting it to another system
   means adding one entry here and nothing else.

   A destination is:

     {
       label:   shown in Settings,
       fields:  the settings it needs, [{ key, label, type, placeholder, help }],
       origin:  function (config) -> the web origin it will call, so Chrome
                can be asked for permission to reach it (null for none),
       send:    function (guide, config) -> Promise of { url? }
                guide is the portable shape in format.js. Resolve when the
                other system has it; reject with an Error to have it tried
                again later (the guide stays in the browser either way).
     }

   "none" keeps guides in the browser only: they can still be downloaded as
   an HTML page or as JSON from the guide's page. */
var Destinations = {
  none: {
    label: 'Nowhere: keep guides in this browser only',
    fields: [],
    origin: function () { return null; },
    send: null
  },

  /* One POST of the whole guide as JSON. The other side answers 2xx; if its
     JSON answer has a "url", the guide's page links to it. */
  webhook: {
    label: 'A web address (webhook)',
    fields: [
      { key: 'url', label: 'Address', type: 'url', placeholder: 'https://example.com/guides',
        help: 'The whole guide is sent here as JSON in one POST when you finish it.' },
      { key: 'token', label: 'Secret (optional)', type: 'password', placeholder: '',
        help: 'Sent as "Authorization: Bearer <secret>". Kept in this browser\'s extension storage.' }
    ],
    origin: function (config) {
      try { var u = new URL(config.url); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch (e) { return null; }
    },
    send: function (guide, config) {
      var headers = { 'Content-Type': 'application/json' };
      if (config.token) headers.Authorization = 'Bearer ' + config.token;
      return fetch(config.url, { method: 'POST', headers: headers, body: JSON.stringify(guide) }).then(function (r) {
        if (!r.ok) throw new Error('The address answered ' + r.status + '.');
        return r.json().catch(function () { return {}; });
      }).then(function (j) {
        var url = j && typeof j.url === 'string' && /^https?:\/\//.test(j.url) ? j.url : '';
        return { url: url };
      });
    }
  }
};

/* Settings, as saved by the options page. */
var Settings = {
  read: function () {
    return chrome.storage.local.get(['destination', 'config', 'autoSend']).then(function (s) {
      var kind = Destinations[s.destination] ? s.destination : 'none';
      return { destination: kind, config: (s.config && s.config[kind]) || {}, all: s.config || {}, autoSend: s.autoSend !== false };
    });
  }
};
