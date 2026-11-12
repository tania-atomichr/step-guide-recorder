/* The one shape a finished guide has outside this extension. The JSON
   download and every destination get exactly this, so whatever you connect
   later reads one documented format (see README, "The guide format").

     {
       "format": "step-guide/1",
       "id": "g...", "title": "...", "intro": "...",
       "createdAt": "2026-01-01T10:00:00.000Z", "finishedAt": "...",
       "steps": [{
         "n": 1, "key": "...", "sentence": "Click \"Save\".",
         "label": "Save", "role": "button",
         "page": { "title": "...", "url": "https://example.com/path" },
         "highlight": { "x": 12.5, "y": 40, "w": 10, "h": 4 },   // % of the image
         "image": { "type": "image/jpeg", "data": "<base64>" },
         "clip": null   // or { "type": "image/jpeg", "frames": ["<base64>", ...] }
       }]
     }

   Loaded by the background script and by the extension's pages. */
var Format = (function () {
  var FIELDS = ['textbox', 'searchbox', 'combobox', 'spinbutton'];
  var TICKS = ['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'];

  /* What a step says before anyone edits it: Click "Save". */
  function sentence(meta) {
    var label = String((meta && meta.label) || '').trim(), role = String((meta && meta.role) || '').trim().toLowerCase();
    if (FIELDS.indexOf(role) > -1 || (meta && meta.field)) return label ? 'Click the "' + label + '" field.' : 'Click the field shown.';
    if (TICKS.indexOf(role) > -1) return label ? 'Tick "' + label + '".' : 'Tick the box shown.';
    if (role === 'tab') return label ? 'Open the "' + label + '" tab.' : 'Open the tab shown.';
    if (role === 'drag') return label ? 'Drag "' + label + '".' : 'Drag the item shown.';
    if (role === 'option' || role === 'menuitem') return label ? 'Choose "' + label + '".' : 'Choose the item shown.';
    return label ? 'Click "' + label + '".' : 'Click here.';
  }

  function title(steps) {
    for (var i = 0; i < steps.length; i++) {
      var t = steps[i].meta && steps[i].meta.title;
      if (t) return ('How to: ' + t).slice(0, 200);
    }
    return 'Untitled guide';
  }

  /* The clicked box as percentages of the picture, clipped to it. The
     picture is the visible part of the tab, so the viewport is its size. */
  function highlight(meta) {
    var r = (meta && meta.rect) || {}, v = (meta && meta.viewport) || {};
    if (!(v.w > 0 && v.h > 0 && r.w > 0 && r.h > 0)) return null;
    var left = Math.max(0, r.x), top = Math.max(0, r.y);
    var right = Math.min(v.w, r.x + r.w), bottom = Math.min(v.h, r.y + r.h);
    if (right <= left || bottom <= top) return null;
    var pc = function (n, of) { return Math.round(10000 * n / of) / 100; };
    return { x: pc(left, v.w), y: pc(top, v.h), w: pc(right - left, v.w), h: pc(bottom - top, v.h) };
  }

  function b64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
  function bytes(v) { return v instanceof Uint8Array ? v : new Uint8Array(v); }
  function iso(t) { return t ? new Date(t).toISOString() : null; }

  function portable(g, rows) {
    return {
      format: 'step-guide/1',
      id: g.id, title: g.title || title(rows), intro: g.intro || '',
      createdAt: iso(g.began), finishedAt: iso(g.finishedAt),
      steps: rows.map(function (r, i) {
        var m = r.meta || {};
        return {
          n: i + 1, key: m.key || '', sentence: r.sentence || sentence(m),
          label: m.label || '', role: m.role || '',
          page: { title: m.title || '', url: m.url || '' },
          highlight: highlight(m),
          image: r.image ? { type: 'image/jpeg', data: b64(bytes(r.image)) } : null,
          clip: r.clip && r.clip.length > 1 ? { type: 'image/jpeg', frames: r.clip.map(function (f) { return b64(bytes(f)); }) } : null
        };
      })
    };
  }

  return { sentence: sentence, title: title, highlight: highlight, portable: portable };
})();
