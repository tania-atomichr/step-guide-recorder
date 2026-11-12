/* Line icons for the extension's pages, drawn on a 24px grid. */
var Icons = (function () {
  var P = {
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/>',
    send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    steps: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5"/><path d="M12 16h.01"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19h19"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    cursor: '<path d="m5 3 14 7-6 2-2 6z"/>',
    plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }
  // fills every <i data-icon="name"> on the page
  function paint(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (n) { if (!n.firstChild) n.innerHTML = svg(n.dataset.icon); });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { paint(); }); else paint();
  }
  return { svg: svg, paint: paint };
})();
