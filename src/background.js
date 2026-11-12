/* The background side of a guide (the page side is page.js).

   The popup's "Start a guide" begins one on the tab it was opened on.
   Chrome lets the extension work on that tab because its icon was pressed
   there ("activeTab"). If you also allowed it on all sites (asked once, at
   the first guide, and optional), the guide follows whichever tab is in
   front; otherwise pressing the icon on a new tab carries it on there.

   Each click arrives twice: 'guide-shot' when the mouse button goes down
   (the picture is taken then, before the click does anything) and
   'guide-commit' when the click lands (the step is kept). Pictures are
   taken one at a time and no faster than Chrome allows (two a second).

   A STEP THAT MOVES GETS A SHORT CLIP. After a step's picture a few more
   are taken, about one every half second for two to three seconds. When
   they show the click set something moving (a menu opened, the page
   scrolled, something was dragged) they are kept with the step as its clip.
   When nothing moved, or the tab went to another page, they are thrown
   away and the step keeps its still picture. No picture is taken while a
   field has the cursor or a password field is on screen (page.js says so
   each time).

   Every step goes into the extension's own storage (store.js) the moment
   it is taken. Finish writes a plain sentence per step, opens the guide's
   page, and, if a destination is set up (destinations.js), sends it there. */
importScripts('store.js', 'format.js', 'destinations.js');

var SHOT_GAP = 550;                 // Chrome allows two captureVisibleTab calls a second
var SHOT_WIDE = 1600;               // a picture wider than this is made smaller before it is kept
var ACCENT = '#4f46e5';

var guide = null;                   // { id, tab, win, paused, side, pos } while one is being made
var ready = chrome.storage.session.get(['guide']).then(function (r) { if (!guide) guide = r.guide || null; }, function () {});
function keep() { chrome.storage.session.set({ guide: guide }).catch(function () {}); }
function quiet(p) { if (p && p.catch) p.catch(function () {}); }
function toTab(tabId, msg) {
  try { chrome.tabs.sendMessage(tabId, msg, function () { void chrome.runtime.lastError; }); } catch (e) {}
}
function badge(tabId, text) {
  try {
    quiet(chrome.action.setBadgeText({ tabId: tabId, text: text }));
    quiet(chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: ACCENT }));
  } catch (e) {}
}

/* what the panel shows */
function state(note) {
  if (!guide) return Promise.resolve({ on: false });
  return Store.steps(guide.id).then(function (rows) {
    return {
      on: true, paused: !!guide.paused, side: guide.side || 'right', pos: guide.pos || null, count: rows.length, note: note || '',
      steps: rows.map(function (r, i) {
        var m = r.meta || {}, rc = m.rect || {}, vp = m.viewport || {};
        return { n: i + 1, label: m.label || '',
                 x: vp.w ? 100 * (rc.x + rc.w / 2) / vp.w : 50, y: vp.h ? 100 * (rc.y + rc.h / 2) / vp.h : 50 };
      })
    };
  });
}
function tell(note) {
  if (!guide) return Promise.resolve(null);
  var tab = guide.tab;
  return state(note).then(function (s) {
    badge(tab, String(s.count));
    toTab(tab, { type: 'guide-state', state: s });
    return s;
  });
}
function inject(tabId) {
  return chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['src/page.js'] });
}

/* ---- pictures, one at a time ------------------------------------------- */
var shotChain = Promise.resolve(), shotLast = 0, pending = {}, early = {};
function bytesOf(dataUrl) {
  var bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function smaller(bytes) {
  // a picture from a sharp screen is twice as wide as anyone reads it
  return createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })).then(function (bmp) {
    if (bmp.width <= SHOT_WIDE) return bytes;
    var k = SHOT_WIDE / bmp.width, c = new OffscreenCanvas(SHOT_WIDE, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.82 }).then(function (b) { return b.arrayBuffer(); })
      .then(function (buf) { return new Uint8Array(buf); });
  }).catch(function () { return bytes; });
}
function shot(only) {                 // only: asked again just before the picture; false and it is not taken
  var mine = guide;
  var run = function () {
    if (!mine || !guide || guide.id !== mine.id) return null;
    if (only && !only()) return null;
    var wait = Math.max(0, shotLast + SHOT_GAP - Date.now());
    return new Promise(function (ok) { setTimeout(ok, wait); }).then(function () {
      if (only && !only()) return null;
      return chrome.tabs.get(mine.tab);
    }).then(function (tab) {
      if (!tab || !tab.active) return null;            // another tab is in front: its picture is not ours to take
      shotLast = Date.now();
      return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
    }).then(function (url) { return url ? smaller(bytesOf(url)) : null; });
  };
  var p = shotChain.then(run, run).catch(function () { return null; });
  shotChain = p;
  return p;
}
/* ---- a step that moves: the pictures after the click ------------------- */
var CLIP_AFTER = 5;                  // pictures after the click: about two and a half seconds
var CLIP_MOVED = 0.03;               // this much of the page changed: something moved
var CLIP_SAME = 0.004;               // less than this between two pictures: nothing more happened
var burstNo = 0;                     // goes up to stop the pictures being taken now (a new click, Pause, Finish)
var clips = Promise.resolve();       // every clip still being taken or kept: Finish waits for it
function ask(tab) {                  // may a picture be taken now, and where is the panel
  return new Promise(function (ok) {
    try { chrome.tabs.sendMessage(tab, { type: 'guide-frame' }, function (r) { void chrome.runtime.lastError; ok(r || null); }); }
    catch (e) { ok(null); }
  });
}
function bmp(bytes) { return createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })); }
/* The panel is on the page in these pictures (hiding it for two seconds
   would make it flicker): where it sits, the page as it was before the
   click is painted in, so the clip never shows it. */
function patch(bytes, before, at) {
  return Promise.all([bmp(bytes), bmp(before)]).then(function (b) {
    var now = b[0], was = b[1], pn = at.panel;
    if (now.width !== was.width || now.height !== was.height) return null;     // the window changed size
    if (!pn || !pn.w || !pn.h || !at.vw) return bytes;
    var k = now.width / at.vw, c = new OffscreenCanvas(now.width, now.height), g = c.getContext('2d');
    g.drawImage(now, 0, 0);
    // its shadow reaches further than its box
    var x = Math.max(0, Math.floor((pn.x - 40) * k)), y = Math.max(0, Math.floor((pn.y - 24) * k));
    var w = Math.min(now.width - x, Math.ceil((pn.w + 80) * k)), h = Math.min(now.height - y, Math.ceil((pn.h + 80) * k));
    if (w > 0 && h > 0) g.drawImage(was, x, y, w, h, x, y, w, h);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then(function (o) { return o.arrayBuffer(); })
      .then(function (buf) { return new Uint8Array(buf); });
  });
}
function tiny(bytes) {               // a picture as 64 by 40 shades of grey: enough to see what changed
  return bmp(bytes).then(function (b) {
    var c = new OffscreenCanvas(64, 40), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(b, 0, 0, 64, 40);
    var px = g.getImageData(0, 0, 64, 40).data, out = new Uint8Array(64 * 40);
    for (var i = 0; i < out.length; i++) out[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
    return out;
  });
}
function differ(a, b) {              // how much of the page is different, 0 to 1
  var n = 0;
  for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 18) n++;
  return n / a.length;
}
/* Nobody picks: the pictures are a clip when the page changed after the
   click. The ones at the end that show nothing new are left out. null:
   nothing moved, the step keeps its still picture. */
function movedFrames(frames) {
  if (frames.length < 2) return Promise.resolve(null);
  return Promise.all(frames.map(tiny)).then(function (t) {
    var moved = false;
    for (var i = 1; i < t.length; i++) if (differ(t[0], t[i]) >= CLIP_MOVED) moved = true;
    if (!moved) return null;
    var keep = frames.length;
    while (keep > 2 && differ(t[keep - 2], t[keep - 1]) < CLIP_SAME) keep--;
    return frames.slice(0, keep);
  }).catch(function () { return null; });
}
function burst(mine, before, page) {
  var no = ++burstNo, frames = [before], tab = mine.tab;
  function on() { return no === burstNo && guide && guide.id === mine.id && !guide.paused && guide.tab === tab; }
  // the same page as the click was on, still willing: not another page, not a field being typed in, no password in sight
  function fine(r) { return r && r.ok && r.inst === page.inst && r.where === page.where; }
  var tries = 0;
  function more() {
    if (frames.length > CLIP_AFTER || !on()) return Promise.resolve();
    return ask(tab).then(function (a) {
      // the page is still putting its panel back after the step's own picture: a moment
      if (a && a.busy && tries++ < 8) return new Promise(function (ok) { setTimeout(ok, 80); }).then(more);
      if (!fine(a) || !on()) return;
      return shot(on).then(function (bytes) {
        if (!bytes) return;
        return ask(tab).then(function (b) {               // asked again: what the picture caught was still fine
          if (!fine(b)) return;
          return patch(bytes, before, b).then(function (done) {
            if (!done) return;
            frames.push(done);
            return more();
          });
        });
      });
    });
  }
  return more().catch(function () {}).then(function () { return movedFrames(frames); });
}
function keepClip(id, key, frames) {                     // beside its step
  return Store.steps(id).then(function (rows) {
    var row = rows.filter(function (r) { return r.key === key; })[0];
    if (row) return Store.changeStep(row.pk, function (r) { r.clip = frames; });
  });
}

function save(p, step, id) {
  if (p.saved) return;
  // a picture that could not be taken (the page was already on its way out) is tried once more:
  // a step with a picture of what came next is worth more than a step lost
  p.saved = p.shot.then(function (bytes) { return bytes || shot(); }).then(function (bytes) {
    if (!bytes) return false;
    return Store.addStep({ guide: id, key: step.key, meta: step, image: bytes, clip: null, sentence: '' }).then(function () { return true; });
  }).then(function (kept) {
    delete pending[step.key];
    // what the click set moving follows its step once the last of its pictures is taken
    if (kept && p.clip) {
      var kc = p.clip.then(function (frames) { return frames ? keepClip(id, step.key, frames) : null; }).catch(function () {});
      clips = clips.then(function () { return kc; });
    }
    if (kept && guide && guide.id === id) tell();
  });
}
// a step as the page described it, with nothing in it the page did not mean to send
function clean(step) {
  step = step || {};
  var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : 0; };
  var r = step.rect || {}, v = step.viewport || {};
  return { key: String(step.key || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40),
           label: String(step.label || '').slice(0, 80), role: String(step.role || '').slice(0, 40), field: !!step.field,
           rect: { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) }, viewport: { w: num(v.w), h: num(v.h) },
           dpr: num(step.dpr) || 1, title: String(step.title || '').slice(0, 200), url: String(step.url || '').slice(0, 500) };
}

/* ---- sending ------------------------------------------------------------ */
var MAX_TRIES = 8;
var sending = {};
/* Sends one finished guide to the destination in Settings. The guide stays
   in the browser whatever happens; a failed send is tried again later with
   a growing wait (1, 2, 4 ... minutes), and "Send again" on its page always
   works. */
function send(id, byHand) {
  if (sending[id]) return sending[id];
  var run = Promise.all([Store.guide(id), Settings.read()]).then(function (r) {
    var g = r[0], s = r[1], dest = Destinations[s.destination];
    if (!g || !g.ended) return { skipped: true };
    if (!dest.send) return { skipped: true, none: true };
    if (!byHand && !s.autoSend) return { skipped: true };
    return Store.change(id, function (row) { row.send = Object.assign({}, row.send, { state: 'sending', to: s.destination }); })
      .then(function () { return Store.steps(id); })
      .then(function (rows) { return dest.send(Format.portable(g, rows), s.config); })
      .then(function (out) {
        return Store.change(id, function (row) {
          row.send = { state: 'sent', to: s.destination, at: Date.now(), url: (out && out.url) || '', tries: 0 };
        });
      }, function (err) {
        return Store.change(id, function (row) {
          var tries = ((row.send && row.send.tries) || 0) + 1;
          row.send = { state: tries >= MAX_TRIES ? 'failed' : 'waiting', to: s.destination, tries: tries,
                       error: String((err && err.message) || err || 'Not sent.').slice(0, 300), next: 0 };
          if (row.send.state === 'waiting') {
            var mins = Math.min(60, Math.pow(2, tries - 1));
            row.send.next = Date.now() + mins * 60000;
            chrome.alarms.create('send-' + id, { delayInMinutes: mins });
          }
        });
      });
  });
  sending[id] = run;
  var clear = function () { delete sending[id]; };
  run.then(clear, clear);
  return run;
}
function sendWaiting() {
  return Store.guides().then(function (rows) {
    rows.forEach(function (g) {
      if (g.ended && g.send && (g.send.state === 'waiting' || g.send.state === 'sending')) send(g.id).catch(function () {});
    });
  });
}
chrome.alarms.onAlarm.addListener(function (a) {
  if (a.name.indexOf('send-') === 0) send(a.name.slice(5)).catch(function () {});
});

// A browser that closed mid-guide: what was clicked so far becomes the guide.
chrome.runtime.onStartup.addListener(function () {
  Store.guides().then(function (rows) {
    return Promise.all(rows.filter(function (g) { return !g.ended; }).map(function (g) { return close(g.id); }));
  }).then(sendWaiting);
});

/* ---- start, carry on, finish -------------------------------------------- */
function start(tabId, reply) {
  ready.then(function () {
    if (guide) return reply({ ok: false, error: 'A guide is already being made. Finish it first.' });
    if (typeof tabId !== 'number') return reply({ ok: false, error: 'Open the page you want to explain, then try again.' });
    chrome.tabs.get(tabId, function (tab) {
      if (chrome.runtime.lastError || !tab) return reply({ ok: false, error: 'Open the page you want to explain, then try again.' });
      var id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      guide = { id: id, tab: tabId, win: tab.windowId, paused: false, side: 'right' };
      Store.putGuide({ id: id, title: '', intro: '', began: Date.now(), ended: false })
        .then(function () { return inject(tabId); })
        .then(function () { keep(); tell(); reply({ ok: true }); },
              function () {
                guide = null; keep();
                Store.forget(id);
                reply({ ok: false, error: 'Chrome does not let extensions work on this page. Open the page you want to explain, then try again.' });
              });
    });
  });
}
/* A guide with steps is closed: each step gets its plain sentence and the
   guide a title. One with no steps is dropped. Resolves true when kept. */
function close(id) {
  return Store.steps(id).then(function (rows) {
    if (!rows.length) return Store.forget(id).then(function () { return false; });
    return Promise.all(rows.map(function (r) {
      return r.sentence ? null : Store.changeStep(r.pk, function (row) { row.sentence = Format.sentence(row.meta); });
    })).then(function () {
      return Store.change(id, function (g) {
        g.ended = true; g.finishedAt = g.finishedAt || Date.now();
        if (!g.title) g.title = Format.title(rows);
      });
    }).then(function () { return true; });
  });
}
function finish(reply) {
  ready.then(function () {
    if (!guide) return reply({ on: false, gone: true });
    var mine = guide, tab = mine.tab;
    guide = null; keep();
    burstNo++;                                         // no more pictures for a clip: what it has is the clip
    badge(tab, '');
    // a click whose picture is still being taken is part of the guide
    var last = Object.keys(pending).map(function (k) { return pending[k].saved || pending[k].shot; });
    Promise.all(last).catch(function () {}).then(function () { return shotChain; }).catch(function () {}).then(function () {
      return clips;
    }).catch(function () {}).then(function () {
      return close(mine.id);
    }).then(function (kept) {
      if (!kept) return reply({ on: false, gone: true, note: 'No steps were recorded, so there is no guide.' });
      chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') + '?id=' + encodeURIComponent(mine.id) });
      reply({ on: false, gone: true });
      send(mine.id).catch(function () {});
    }, function () {
      reply({ on: false, gone: true, note: 'The guide could not be saved. Its steps are still in this browser.' });
    });
  });
}

/* THE GUIDE FOLLOWS YOU ACROSS TABS. The tab in front is the guide's tab:
   its panel shows there, its clicks are steps, and the tab left behind
   loses its panel. */
function follow(tabId) {
  if (!guide || typeof tabId !== 'number') return Promise.resolve(false);
  if (tabId === guide.tab) return inject(tabId).then(function () { return true; }, function () { return false; });
  return inject(tabId).then(function () {
    var old = guide.tab;
    return new Promise(function (ok) { chrome.tabs.get(tabId, function (t) { void chrome.runtime.lastError; ok(t); }); }).then(function (t) {
      if (!guide) return false;
      guide.tab = tabId; if (t) guide.win = t.windowId; keep();
      badge(old, '');
      toTab(old, { type: 'guide-state', state: { on: false } });
      tell();
      return true;
    });
  }, function () { return false; });             // a page Chrome keeps extensions off (chrome://, the Web Store)
}
function allSites() {
  return chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(function () { return false; });
}
chrome.tabs.onActivated.addListener(function (info) {
  ready.then(function () {
    if (!guide || info.tabId === guide.tab) return;
    allSites().then(function (yes) { if (yes) follow(info.tabId); });
  });
});
/* After a move to another page in the same tab the page's script is gone:
   it is put back while Chrome's pass for the tab still holds. When it does
   not, the icon shows "!" and the popup, opened there, carries the guide on. */
chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (info.status !== 'complete') return;
  ready.then(function () {
    if (!guide) return;
    if (tabId !== guide.tab) {
      // a tab opened from the guide (a link that opens a new tab) and in front: the guide carries on there
      chrome.tabs.get(tabId, function (t) {
        if (chrome.runtime.lastError || !t || !t.active || t.windowId !== guide.win) return;
        allSites().then(function (yes) { if (yes) follow(tabId); });
      });
      return;
    }
    inject(tabId).then(function () { tell(); }, function () { badge(tabId, '!'); });
  });
});
// the guide's tab was closed: what was clicked so far becomes the guide
chrome.tabs.onRemoved.addListener(function (tabId) {
  ready.then(function () { if (guide && guide.tab === tabId) finish(function () {}); });
});

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (!msg || typeof msg.type !== 'string') return;
  var from = sender.tab ? sender.tab.id : null;
  var ours = sender.id === chrome.runtime.id && (!sender.tab || (sender.url || '').indexOf(chrome.runtime.getURL('')) === 0);

  // from the extension's own pages only (the popup, a guide's page)
  if (msg.type === 'guide-send' && ours) {
    send(String(msg.id || ''), true).then(function (r) { reply(r || {}); }, function (e) { reply({ error: String(e) }); });
    return true;
  }
  if (msg.type === 'guide-start' && ours) { start(msg.tab, reply); return true; }
  if (msg.type === 'guide-status' && ours) {           // the popup: is one being made, and is it this tab's
    ready.then(function () {
      if (!guide) return reply({ on: false });
      var here = msg.tab === guide.tab;
      // the popup was opened on the guide's tab: Chrome's pass is fresh, so the panel goes back if it was lost
      var back = here ? inject(guide.tab).then(function () { return true; }, function () { return false; }) : Promise.resolve(false);
      back.then(function (ok) { return state().then(function (s) { reply({ on: true, here: here, capturing: ok, count: s.count, paused: s.paused }); }); });
    });
    return true;
  }
  if (msg.type === 'guide-show' && ours) {             // the popup, opened on another tab: bring the guide's tab forward
    ready.then(function () {
      if (!guide) return;
      chrome.tabs.update(guide.tab, { active: true }, function () { void chrome.runtime.lastError; });
      chrome.windows.update(guide.win, { focused: true }, function () { void chrome.runtime.lastError; });
    });
    return false;
  }
  if (msg.type === 'guide-here' && ours) {             // the popup, opened on another tab: carry the guide on there
    ready.then(function () {
      if (!guide) return reply({ ok: false });
      follow(msg.tab).then(function (ok) { reply({ ok: ok }); });
    });
    return true;
  }
  if (msg.type === 'guide-finish') {
    if (!ours && (!guide || from !== guide.tab)) return;
    finish(reply);
    return true;
  }

  // everything below comes from the page being explained, and only from the guide's own tab
  if (from === null) return;
  if (msg.type === 'guide-hello') {
    ready.then(function () {
      if (!guide || from !== guide.tab) return reply({ on: false });
      state().then(reply);
    });
    return true;
  }
  if (msg.type === 'guide-shot') {
    ready.then(function () {
      if (!guide || from !== guide.tab || guide.paused) return reply({ ok: false });
      var step = clean(msg.step), mine = guide;
      Object.keys(pending).forEach(function (k) { if (!pending[k].saved) delete pending[k]; });   // a press that never became a click is dropped
      burstNo++;                                       // the click before this one has all the pictures it will get
      var p = pending[step.key] = { shot: shot() };
      var page = { inst: String(msg.inst || '').slice(0, 40), where: step.url };
      p.clip = p.shot.then(function (bytes) { return bytes && page.inst ? burst(mine, bytes, page) : null; }).catch(function () { return null; });
      p.shot.then(function (bytes) { reply({ ok: !!bytes }); });
      // its click landed before this message did: the step is kept as soon as the picture is taken
      if (early[step.key]) { clearTimeout(early[step.key]); delete early[step.key]; save(p, step, guide.id); }
    });
    return true;
  }
  if (msg.type === 'guide-commit') {
    ready.then(function () {
      if (!guide || from !== guide.tab || guide.paused) return;
      var step = clean(msg.step), id = guide.id, p = pending[step.key];
      if (!step.key) return;
      if (p) return save(p, step, id);
      var now = function () {                           // no picture is on its way (the worker slept, or the page left): take one now
        delete early[step.key];
        save(pending[step.key] = { shot: shot() }, step, id);
      };
      /* A quick click lands before the page has asked for its picture (it
         first hides the panel and covers passwords). Wait for that rather
         than take one too soon. */
      if (msg.coming) early[step.key] = setTimeout(now, 3000); else now();
    });
    return false;
  }
  if (msg.type === 'guide-pause') {
    ready.then(function () {
      if (!guide || from !== guide.tab) return reply({ on: false });
      guide.paused = !!msg.paused; keep();
      if (guide.paused) burstNo++;
      state().then(reply);
    });
    return true;
  }
  if (msg.type === 'guide-pos') {                       // the panel was dragged: the same spot on every tab
    ready.then(function () {
      if (!guide || from !== guide.tab) return;
      var x = +msg.x, y = +msg.y;
      guide.pos = isFinite(x) && isFinite(y) ? { x: Math.round(x), y: Math.round(y) } : null; keep();
    });
    return false;
  }
  if (msg.type === 'guide-undo') {
    ready.then(function () {
      if (!guide || from !== guide.tab) return reply({ on: false });
      Store.steps(guide.id).then(function (rows) {
        return rows.length ? Store.dropStep(rows[rows.length - 1].pk) : null;
      }).then(function () { return tell(); }).then(function (s) { reply(s || { on: false }); });
    });
    return true;
  }
});
