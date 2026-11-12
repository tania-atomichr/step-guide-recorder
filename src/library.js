/* Every guide kept in this browser, newest first. */
(function () {
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function chip(icon, text, cls) {
    var c = el('span', 'chip' + (cls ? ' ' + cls : ''));
    c.innerHTML = Icons.svg(icon); c.appendChild(el('span', '', text));
    return c;
  }
  Store.guides().then(function (gs) {
    document.getElementById('empty').hidden = gs.length > 0;
    document.getElementById('n').textContent = gs.length ? gs.length + (gs.length === 1 ? ' guide' : ' guides') : '';
    var list = document.getElementById('list');
    return gs.reduce(function (p, g) {
      return p.then(function () { return Store.steps(g.id); }).then(function (rows) {
        var li = el('li'), a = el('a', 'card');
        a.href = 'guide.html?id=' + encodeURIComponent(g.id);
        var thumb = el('div', 'thumb');
        if (rows[0] && rows[0].image) {
          var img = el('img'); img.alt = '';
          img.src = URL.createObjectURL(new Blob([rows[0].image], { type: 'image/jpeg' }));
          thumb.appendChild(img);
        } else thumb.innerHTML = Icons.svg('steps');
        a.appendChild(thumb);
        var body = el('div', 'body');
        body.appendChild(el('b', '', g.title || (g.ended ? Format.title(rows) : 'Being made now')));
        var facts = el('div', 'bar');
        facts.appendChild(chip('steps', rows.length + (rows.length === 1 ? ' step' : ' steps'), 'accent'));
        facts.appendChild(chip('clock', new Date(g.finishedAt || g.began).toLocaleDateString([], { dateStyle: 'medium' })));
        var s = g.send && g.send.state;
        if (s === 'sent') facts.appendChild(chip('check', 'Sent', 'good'));
        else if (s === 'waiting' || s === 'failed') facts.appendChild(chip('alert', 'Not sent', 'bad'));
        body.appendChild(facts);
        a.appendChild(body);
        li.appendChild(a);
        list.appendChild(li);
      });
    }, Promise.resolve());
  });
})();
