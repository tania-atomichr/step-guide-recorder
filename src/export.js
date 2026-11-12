/* Downloads of a guide: the portable JSON (format.js), and a single HTML
   page with the pictures inside it that opens anywhere, with no extension
   and no server. */
var Export = (function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slug(s) {
    return String(s || 'guide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'guide';
  }
  function host(url) { try { return new URL(url).host; } catch (e) { return ''; } }
  function html(g) {
    var steps = g.steps.map(function (s) {
      var h = s.highlight;
      var ring = h ? '<span class="ring" style="left:' + h.x + '%;top:' + h.y + '%;width:' + h.w + '%;height:' + h.h + '%"></span>' : '';
      var pic = '';
      if (s.clip) {
        // the first frame keeps the box's size; the others lie on top of it
        pic = '<div class="pic" data-clip="1">' + s.clip.frames.map(function (f, k) {
          return '<img class="f' + (k ? ' over' : '') + '" alt="' + (k ? '' : 'The page at step ' + s.n) + '" src="data:' + esc(s.clip.type) + ';base64,' + f + '">';
        }).join('') + ring + '<span class="tag">Moving</span></div>';
      } else if (s.image) {
        pic = '<div class="pic"><img alt="The page at step ' + s.n + '" src="data:' + esc(s.image.type) + ';base64,' + s.image.data + '">' + ring + '</div>';
      }
      var where = s.page && s.page.url ? '<p class="where">' + esc((s.page.title ? s.page.title + ' · ' : '') + host(s.page.url)) + '</p>' : '';
      return '<li><div class="head"><i>' + s.n + '</i><p>' + esc(s.sentence) + '</p></div>' + pic + where + '</li>';
    }).join('\n');
    var made = g.finishedAt ? new Date(g.finishedAt).toLocaleDateString([], { dateStyle: 'medium' }) : '';
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(g.title) + '</title><style>' +
      ':root{--accent:#4f46e5;--ink:#0f172a;--soft:#5b6474;--line:#e5e7eb;--bg:#f6f6fa}' +
      '*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}' +
      '.w{max-width:880px;margin:0 auto;padding:40px 16px 64px}h1{font-size:30px;line-height:1.2;letter-spacing:-.01em;margin:0 0 10px}' +
      '.intro{color:var(--soft);margin:0 0 28px}.chip{display:inline-block;background:#eef0ff;color:#3730a3;border-radius:999px;padding:4px 10px;font-size:13px;font-weight:600;margin-right:6px}' +
      'ol{list-style:none;margin:0;padding:0;display:grid;gap:18px}li{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.05),0 4px 16px rgba(15,23,42,.05)}' +
      '.head{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}' +
      '.head i{font-style:normal;flex:none;width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:15px}' +
      '.head p{margin:5px 0 0;font-weight:600}.pic{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden}' +
      '.pic img{display:block;width:100%;height:auto}.ring{position:absolute;border:3px solid var(--accent);border-radius:8px;box-shadow:0 0 0 5px rgba(79,70,229,.22)}' +
      '.where{margin:10px 0 0;font-size:13px;color:var(--soft)}' +
      '.pic img.over{position:absolute;inset:0;width:100%;height:100%}.pic img.f{transition:opacity .25s}.ring{transition:opacity .25s}' +
      '.tag{position:absolute;left:10px;bottom:10px;background:rgba(15,23,42,.78);color:#fff;font-size:12px;font-weight:600;border-radius:999px;padding:3px 9px}' +
      '</style></head><body><div class="w"><h1>' + esc(g.title) + '</h1>' +
      '<div class="intro">' + (g.intro ? esc(g.intro) + ' ' : '') + '<span class="chip">' + g.steps.length + (g.steps.length === 1 ? ' step' : ' steps') + '</span>' +
      (made ? '<span class="chip">' + esc(made) + '</span>' : '') + '</div>' +
      '<ol>' + steps + '</ol></div>' +
      (g.steps.some(function (s) { return s.clip; }) ? '<script>' + playClips.toString() + '\nplayClips();</script>' : '') +
      '</body></html>\n';
  }
  function download(name, type, text) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  return {
    html: html,
    downloadHtml: function (g) { download(slug(g.title) + '.html', 'text/html', html(g)); },
    downloadJson: function (g) { download(slug(g.title) + '.json', 'application/json', JSON.stringify(g, null, 2)); }
  };
})();
