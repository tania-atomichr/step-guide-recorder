/* One guide: read it, fix its words, take out a step, download it, send it. */
(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function chip(icon, text, cls) {
    var c = el('span', 'chip' + (cls ? ' ' + cls : ''));
    c.innerHTML = Icons.svg(icon);
    c.appendChild(el('span', '', text));
    return c;
  }
  var id = new URLSearchParams(location.search).get('id') || '';
  var g = null, rows = [], urls = [];

  // a text box as tall as its words, so a long title or step wraps on a phone
  function fit(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  document.addEventListener('input', function (e) { if (e.target.tagName === 'TEXTAREA') fit(e.target); });
  addEventListener('resize', function () { document.querySelectorAll('textarea').forEach(fit); });
  // Enter finishes the edit rather than starting a new line
  document.addEventListener('keydown', function (e) { if (e.target.tagName === 'TEXTAREA' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

  function when(t) { return t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function host(url) { try { return new URL(url).host; } catch (e) { return ''; } }

  function sendNote(settings) {
    var dest = Destinations[settings.destination], s = g.send || {}, n = $('sendnote');
    $('send').hidden = !dest.send;
    $('send').querySelector('span').textContent = s.state === 'sent' ? 'Send again' : 'Send';
    n.className = 'note'; n.textContent = '';
    function say(icon, text) { n.innerHTML = Icons.svg(icon); var p = el('p', '', text); n.appendChild(p); return p; }
    if (!dest.send) {
      n.hidden = false;
      var p = say('laptop', 'Kept in this browser only. ');
      var a = el('a', '', 'Choose where guides go'); a.href = 'options.html'; p.appendChild(a);
      p.appendChild(document.createTextNode(' to send them to another system.'));
      return;
    }
    n.hidden = !s.state;
    if (s.state === 'sent') {
      n.className = 'note good';
      var q = say('check', 'Sent ' + when(s.at) + '.');
      if (s.url) { q.appendChild(document.createTextNode(' ')); var o = el('a', '', 'Open it there'); o.href = s.url; o.target = '_blank'; o.rel = 'noopener'; q.appendChild(o); }
    } else if (s.state === 'sending') {
      say('send', 'Sending…');
    } else if (s.state === 'waiting') {
      n.className = 'note bad';
      say('alert', 'Not sent yet: ' + s.error + ' It will be tried again by itself around ' + when(s.next) + '.');
    } else if (s.state === 'failed') {
      n.className = 'note bad';
      say('alert', 'Not sent: ' + s.error + ' Press Send to try again.');
    }
  }

  function facts() {
    var f = $('facts'), s = g.send || {};
    f.textContent = '';
    f.appendChild(chip('steps', rows.length + (rows.length === 1 ? ' step' : ' steps'), 'accent'));
    f.appendChild(chip('clock', g.finishedAt ? when(g.finishedAt) : 'Still being made'));
    if (s.state === 'sent') f.appendChild(chip('check', 'Sent', 'good'));
    else if (s.state === 'waiting' || s.state === 'failed') f.appendChild(chip('alert', 'Not sent', 'bad'));
  }

  function draw() {
    document.title = g.title || 'Guide';
    $('title').value = g.title || ''; fit($('title'));
    facts();
    urls.forEach(URL.revokeObjectURL); urls = [];
    var list = $('steps');
    list.textContent = '';
    rows.forEach(function (r, i) {
      var li = el('li', 'card step'), head = el('div', 'head');
      head.appendChild(el('span', 'num', String(i + 1)));
      var say = el('textarea', 'say'); say.rows = 1; say.value = r.sentence || Format.sentence(r.meta); say.setAttribute('aria-label', 'Step ' + (i + 1));
      say.addEventListener('change', function () {
        var text = say.value.trim() || Format.sentence(r.meta);
        say.value = text; r.sentence = text;
        Store.changeStep(r.pk, function (row) { row.sentence = text; });
      });
      head.appendChild(say);
      requestAnimationFrame(function () { fit(say); });
      var del = el('button', 'out'); del.type = 'button'; del.title = 'Take this step out';
      del.innerHTML = Icons.svg('trash'); del.appendChild(el('span', '', 'Take out'));
      del.addEventListener('click', function () { del.disabled = true; Store.dropStep(r.pk).then(load); });
      head.appendChild(del);
      li.appendChild(head);
      if (r.image) {
        var pic = el('div', 'pic');
        // a step that moved plays its clip; the first of its pictures keeps the box's size
        var shots = r.clip && r.clip.length > 1 ? r.clip : [r.image];
        shots.forEach(function (bytes, k) {
          var img = el('img', 'f' + (k ? ' over' : ''));
          var u = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })); urls.push(u);
          img.src = u; img.alt = k ? '' : 'The page at step ' + (i + 1);
          pic.appendChild(img);
        });
        if (shots.length > 1) { pic.dataset.clip = '1'; pic.appendChild(el('span', 'tag', 'Moving')); }
        var h = Format.highlight(r.meta);
        if (h) {
          var ring = el('span', 'ring');
          ring.style.left = h.x + '%'; ring.style.top = h.y + '%'; ring.style.width = h.w + '%'; ring.style.height = h.h + '%';
          pic.appendChild(ring);
        }
        li.appendChild(pic);
      }
      var m = r.meta || {};
      if (m.url) {
        var w = chip('globe', (m.title ? m.title + ' · ' : '') + host(m.url));
        w.classList.add('where'); w.title = m.url;
        li.appendChild(w);
      }
      list.appendChild(li);
    });
    playClips(list);
  }

  function load() {
    return Promise.all([Store.guide(id), Store.steps(id), Settings.read()]).then(function (r) {
      g = r[0]; rows = r[1];
      if (!g) { $('page').hidden = true; $('missing').hidden = false; return; }
      $('page').hidden = false;
      draw();
      sendNote(r[2]);
    });
  }
  function portable() { return Store.guide(id).then(function (now) { return Format.portable(now, rows); }); }

  $('title').addEventListener('change', function () {
    var t = $('title').value.trim() || Format.title(rows);
    $('title').value = t; document.title = t; fit($('title'));
    Store.change(id, function (row) { row.title = t; });
  });
  $('html').addEventListener('click', function () { portable().then(Export.downloadHtml); });
  $('json').addEventListener('click', function () { portable().then(Export.downloadJson); });
  $('send').addEventListener('click', function () {
    $('send').disabled = true;
    g.send = { state: 'sending' }; Settings.read().then(sendNote);
    chrome.runtime.sendMessage({ type: 'guide-send', id: id }, function () {
      void chrome.runtime.lastError;
      $('send').disabled = false;
      load();
    });
  });
  $('del').addEventListener('click', function () {
    if (!confirm('Delete this guide and its pictures from this browser? This cannot be undone.')) return;
    Store.forget(id).then(function () { location.href = 'library.html'; });
  });
  // a send that finishes in the background shows here without a reload
  chrome.storage.onChanged.addListener(function () { load(); });
  setInterval(function () { if (g && g.send && (g.send.state === 'sending' || g.send.state === 'waiting')) load(); }, 5000);
  load();
})();
