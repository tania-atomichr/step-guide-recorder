/* Settings: which destination (destinations.js) and what it needs. Saving
   asks Chrome for permission to reach the destination's address, so the
   extension never holds access to a site it does not send to. */
(function () {
  function $(id) { return document.getElementById(id); }
  var all = {};
  var sel = $('dest');
  Object.keys(Destinations).forEach(function (k) {
    var o = document.createElement('option'); o.value = k; o.textContent = Destinations[k].label; sel.appendChild(o);
  });
  function fields() {
    var d = Destinations[sel.value], box = $('fields'), cfg = all[sel.value] || {};
    box.textContent = '';
    d.fields.forEach(function (f) {
      var wrap = document.createElement('div'); wrap.className = 'field';
      var lab = document.createElement('label'); lab.htmlFor = 'f-' + f.key; lab.textContent = f.label;
      var inp = document.createElement('input'); inp.id = 'f-' + f.key; inp.type = f.type || 'text'; inp.placeholder = f.placeholder || '';
      inp.value = cfg[f.key] || ''; inp.dataset.key = f.key; inp.autocomplete = 'off';
      wrap.appendChild(lab); wrap.appendChild(inp);
      if (f.help) { var h = document.createElement('small'); h.textContent = f.help; wrap.appendChild(h); }
      box.appendChild(wrap);
    });
    $('autoRow').hidden = !d.send;
  }
  chrome.storage.local.get(['destination', 'config', 'autoSend'], function (s) {
    all = s.config || {};
    sel.value = Destinations[s.destination] ? s.destination : 'none';
    $('auto').checked = s.autoSend !== false;
    fields();
  });
  sel.addEventListener('change', fields);

  function say(text, bad) { var n = $('saved'); n.textContent = text; n.className = 'note ' + (bad ? 'bad' : 'good'); n.hidden = false; }
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var kind = sel.value, d = Destinations[kind], cfg = {};
    document.querySelectorAll('#fields input').forEach(function (i) { cfg[i.dataset.key] = i.value.trim(); });
    var origin = d.origin(cfg);
    if (d.send && !origin) return say('Enter a full web address starting with https://.', true);
    function store() {
      all[kind] = cfg;
      chrome.storage.local.set({ destination: kind, config: all, autoSend: $('auto').checked }, function () {
        say(d.send ? 'Saved. Finished guides go to ' + origin + '.' : 'Saved. Guides stay in this browser.');
      });
    }
    if (!origin) return store();
    // must run inside the click: Chrome refuses the question a moment later
    chrome.permissions.request({ origins: [new URL(origin).protocol + '//' + new URL(origin).hostname + '/*'] }, function (yes) {
      if (chrome.runtime.lastError || !yes) return say('Chrome was not allowed to reach ' + origin + ', so nothing was saved.', true);
      store();
    });
  });
})();
