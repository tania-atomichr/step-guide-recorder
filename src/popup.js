/* The toolbar popup: start a guide on this tab, or, while one is being
   made, see its count and finish it. Pressing the icon is what lets the
   extension work on this tab (activeTab), so no site permission is needed
   just to make a guide. */
(function () {
  function $(id) { return document.getElementById(id); }
  function tell(text) { $('tell').textContent = text; $('tell').hidden = !text; }
  function thisTab(then) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { then(tabs && tabs[0]); });
  }
  function live(g) {
    var on = !!(g && g.on);
    $('idle').hidden = on; $('live').hidden = !on;
    if (!on) return;
    $('count').textContent = String(g.count);
    $('countword').textContent = g.count === 1 ? 'step so far' : 'steps so far';
    $('say').textContent = !g.here ? 'It is being made in another tab.'
      : g.capturing ? (g.paused ? 'It is paused. Press Resume on the panel to carry on.' : 'Each click on this page adds a step.')
      : 'Chrome does not let extensions work on this page. Go back to the page you were explaining, or finish the guide.';
    $('show').hidden = !!g.here;
  }
  thisTab(function (tab) {
    chrome.runtime.sendMessage({ type: 'guide-status', tab: tab ? tab.id : null }, function (g) {
      void chrome.runtime.lastError;
      // the icon pressed on another tab: the guide carries on here (the press is Chrome's pass for this tab)
      if (g && g.on && !g.here && tab) {
        return chrome.runtime.sendMessage({ type: 'guide-here', tab: tab.id }, function (r) {
          void chrome.runtime.lastError;
          if (r && r.ok) return window.close();
          live(g);
        });
      }
      live(g);
    });
  });

  /* May the guide follow you to other tabs? Chrome asks once ("read and
     change all your data on all websites"). No is fine: pressing the icon
     on a new tab carries the guide on there. Chrome only allows the
     question inside the press itself, so what is known is read up front. */
  var allSites = false, asked = false;
  chrome.permissions.contains({ origins: ['<all_urls>'] }, function (yes) { void chrome.runtime.lastError; allSites = !!yes; });
  chrome.storage.local.get('followAsked', function (a) { void chrome.runtime.lastError; asked = !!(a && a.followAsked); });

  $('start').addEventListener('click', function () {
    var b = $('start'), asking = false, started = false;
    b.disabled = true;
    function done() { if (started && !asking) window.close(); }
    if (!allSites && !asked) {
      asking = true;
      chrome.permissions.request({ origins: ['<all_urls>'] }, function () {
        if (!chrome.runtime.lastError) chrome.storage.local.set({ followAsked: true });
        asking = false; done();
      });
    }
    thisTab(function (tab) {
      chrome.runtime.sendMessage({ type: 'guide-start', tab: tab ? tab.id : null }, function (r) {
        void chrome.runtime.lastError;
        b.disabled = false;
        if (r && r.ok) { started = true; return done(); }
        tell((r && r.error) || 'The guide did not start. Try again.');
      });
    });
  });
  $('show').addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'guide-show' }, function () { void chrome.runtime.lastError; window.close(); });
  });
  $('finish').addEventListener('click', function () {
    var b = $('finish');
    b.disabled = true; b.textContent = 'Saving…';
    chrome.runtime.sendMessage({ type: 'guide-finish' }, function (r) {
      void chrome.runtime.lastError;
      if (r && r.note) { b.hidden = true; $('show').hidden = true; $('say').textContent = r.note; return; }
      window.close();
    });
  });
})();
