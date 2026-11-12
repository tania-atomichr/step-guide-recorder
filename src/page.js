/* The page side of a guide (the background side is background.js).

   Put on the tab by the background script when a guide starts or follows
   you to a new tab. From then on each click on the page is one step:

     - what was clicked: the control's name as a reader would say it (its
       label or its own words, at most 80 characters), what kind of control
       it is, where it sits, the page's title and address (no query string
       or fragment, which often carry tokens and search words);
     - a picture of the page, taken by the background script when the mouse
       button goes DOWN, so it shows the page before the click does anything.

   WHAT IS NEVER TAKEN: nothing that is typed (no key is listened to and no
   field's contents are read), and no password: password and card fields
   are painted over before each picture and put back after it.

   A STEP THAT MOVES: for two to three seconds after a click the background
   takes a few more pictures and keeps them as a short clip when the click
   set something moving (a menu opened, the page scrolled, something was
   dragged). Before and after each of them it asks this page (guide-frame)
   whether one may be taken: never while a field has the cursor (so typing
   is never in a clip) and never while a password field is on screen. A
   press that ends somewhere else is a drag: one step, and its clip shows
   the thing being dragged.

   The small panel (the count, the last steps, Pause, Undo last step,
   Finish guide) lives in a shadow root on the page, is hidden for each
   picture, and clicks on it are not steps. */
(function () {
  if (window.__stepGuide) { window.__stepGuide.hello(); return; }

  var LABEL_MAX = 80;
  var state = { on: false, paused: false, count: 0, steps: [], side: 'right', note: '' };
  var host = null, root = null, els = {};
  var pending = null;          // the step whose picture was asked for on pointerdown, until its click
  var secrets = new WeakSet(); // every field that ever was a password field, even after "show password"
  var gone = false;
  var INST = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);   // this page, this time it was opened

  function send(msg, then) {
    try {
      chrome.runtime.sendMessage(msg, function (r) { void chrome.runtime.lastError; if (then) then(r); });
    } catch (e) { if (then) then(null); }   // the extension was reloaded under this page
  }

  /* ---- what was clicked ------------------------------------------------ */
  var CLICKABLE = 'a[href],button,summary,label,select,textarea,input,[role="button"],[role="link"],[role="tab"],[role="menuitem"],' +
                  '[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],' +
                  '[role="treeitem"],[contenteditable=""],[contenteditable="true"],[onclick]';
  function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX); }
  function firstLine(text) {
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) { var t = clean(lines[i]); if (t) return t; }
    return '';
  }
  function byIds(ids) {
    return clean(String(ids || '').split(/\s+/).map(function (id) {
      var n = id && document.getElementById(id);
      return n ? n.textContent : '';
    }).join(' '));
  }
  function isField(el) {
    var tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (tag !== 'INPUT') return false;
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file', 'range', 'color'].indexOf(type) < 0;
  }
  function roleOf(el) {
    var r = (el.getAttribute('role') || '').toLowerCase();
    if (r) return r.slice(0, 40);
    var tag = el.tagName;
    if (tag === 'A') return 'link';
    if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA' || el.isContentEditable) return 'textbox';
    if (tag === 'INPUT') {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return type;
      if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image' || type === 'file') return 'button';
      return 'textbox';
    }
    return '';
  }
  /* The name a reader would use. A field is named by its label, never by
     what is in it; a button made from an <input> by the words on it (its
     value ATTRIBUTE, which is the page's own text, not something typed). */
  function nameOf(el) {
    var said = clean(el.getAttribute('aria-label')) || byIds(el.getAttribute('aria-labelledby'));
    if (said) return said;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (tag === 'INPUT' && (type === 'button' || type === 'submit' || type === 'reset')) {
        return clean(el.getAttribute('value')) || (type === 'submit' ? 'Submit' : '');
      }
      var lab = el.labels && el.labels[0] ? firstLine(el.labels[0].innerText) : '';
      return lab || clean(el.getAttribute('placeholder')) || clean(el.getAttribute('title')) || clean(el.getAttribute('alt'));
    }
    if (el.isContentEditable) return clean(el.getAttribute('title')) || clean(el.getAttribute('data-placeholder'));
    var img = !el.innerText && el.querySelector ? el.querySelector('img[alt],svg[aria-label]') : null;
    return firstLine(el.innerText) || clean(el.getAttribute('title')) ||
           (img ? clean(img.getAttribute('alt') || img.getAttribute('aria-label')) : '');
  }
  function describe(ev) {
    var at = ev.target && ev.target.nodeType === 1 ? ev.target : (ev.target && ev.target.parentElement);
    if (!at) return null;
    var el = at.closest(CLICKABLE) || at;
    // a label's click is its field's: name it once, by the label
    if (el.tagName === 'LABEL' && el.control) el = el.control;
    var box = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    var rect = { x: box.left, y: box.top, w: box.width, h: box.height };
    var whole = el === document.body || el === document.documentElement;
    // something as large as the page says nothing: ring the spot itself
    if (whole || !box.width || !box.height || (box.width > vw * 0.6 && box.height > vh * 0.6)) {
      rect = { x: ev.clientX - 22, y: ev.clientY - 22, w: 44, h: 44 };
    }
    return {
      key: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      label: whole ? '' : nameOf(el), role: whole ? '' : roleOf(el), field: !whole && isField(el),
      rect: rect, viewport: { w: vw, h: vh }, dpr: window.devicePixelRatio || 1,
      title: clean(document.title).slice(0, 200), url: location.origin + location.pathname
    };
  }

  /* ---- passwords are painted over for the picture ---------------------- */
  var SECRET = 'input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"],' +
               'input[autocomplete="one-time-code"],input[autocomplete="cc-number"],input[autocomplete="cc-csc"]';
  function secretFields() {
    var found = [], seen = 0;
    (function walk(scope) {
      scope.querySelectorAll(SECRET).forEach(function (f) { secrets.add(f); });
      scope.querySelectorAll('input').forEach(function (f) { if (secrets.has(f)) found.push(f); });
      scope.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot && seen++ < 400) walk(n.shadowRoot); });
    })(document);
    return found;
  }
  var MASK = [['color', 'transparent'], ['-webkit-text-fill-color', 'transparent'], ['caret-color', 'transparent'],
              ['text-shadow', 'none'], ['background', '#111'], ['-webkit-text-security', 'none'], ['transition', 'none']];
  var masked = new Map();      // field -> the style it had, while a picture is being taken
  function mask() {
    secretFields().forEach(function (f) {
      if (masked.has(f)) return;
      masked.set(f, f.getAttribute('style'));
      MASK.forEach(function (p) { f.style.setProperty(p[0], p[1], 'important'); });
    });
  }
  function unmask() {
    masked.forEach(function (was, f) { if (was === null) f.removeAttribute('style'); else f.setAttribute('style', was); });
    masked.clear();
  }

  /* ---- one picture: panel away, passwords covered, then ask ------------
     Two clicks close together overlap: the page stays as it is (no panel,
     passwords covered) until the last of their pictures is taken. */
  var shooting = 0;
  function shoot(step, then) {
    var done = false;
    shooting++;
    mask();
    if (host) host.style.setProperty('display', 'none', 'important');
    function back(r) {
      if (done) return;
      done = true;
      if (--shooting <= 0) {
        shooting = 0;
        unmask();
        if (host) host.style.removeProperty('display');
      }
      if (then) then(r);
    }
    var ask = function () { send({ type: 'guide-shot', step: step, inst: INST }, back); };
    /* The page has to be DRAWN without the panel and with the passwords
       covered before it is pictured: two frames, and a moment for the
       second to reach the screen (a picture asked for sooner can still be
       the frame before). */
    requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(ask, 60); }); });
    setTimeout(back, 2500);
  }

  /* ---- may a picture for a clip be taken right now ---------------------- */
  function hasCursor() {
    var a = document.activeElement, n = 0;
    while (a && a.shadowRoot && a.shadowRoot.activeElement && n++ < 20) a = a.shadowRoot.activeElement;
    // a frame inside the page may hold a field this script cannot see
    return !!a && a.nodeType === 1 && (a.tagName === 'IFRAME' || a.tagName === 'FRAME' || isField(a));
  }
  function inSight(f) {
    var b = f.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.top < window.innerHeight && b.left < window.innerWidth;
  }
  function frameNow() {
    var ok = live() && !shooting && !document.hidden && !hasCursor() && !secretFields().some(inSight);
    var box = ok && host && els.p ? els.p.getBoundingClientRect() : null;
    return { ok: ok, busy: shooting > 0, inst: INST, where: location.origin + location.pathname, vw: window.innerWidth, vh: window.innerHeight,
             panel: box && box.width ? { x: box.left, y: box.top, w: box.width, h: box.height } : null };
  }

  function mine(ev) {
    if (!host) return false;
    var path = ev.composedPath ? ev.composedPath() : [];
    return path.indexOf(host) > -1 || ev.target === host;
  }
  function live() { return state.on && !state.paused && !gone; }

  window.addEventListener('pointerdown', function (ev) {
    if (!live() || mine(ev) || ev.button !== 0 || !ev.isPrimary) return;
    var step = describe(ev);
    if (!step) return;
    var press = pending = { step: step, at: Date.now(), done: false, replay: null, x: ev.clientX, y: ev.clientY };
    shoot(step, function () { press.done = true; if (press.replay) press.replay(); });
  }, true);

  /* THE PICTURE COMES FIRST. A quick click lands before the picture of the
     page is taken (it takes about a tenth of a second), and the picture
     would then show what the click did, not the thing that was clicked. So
     a click that arrives early is held back and handed to the page, as it
     was, the moment the picture is done (at most a second and a half later). A click
     that arrives after the picture goes straight through, untouched. */
  var replaying = false;
  function holdable(ev) {
    var t = ev.target && ev.target.nodeType === 1 ? ev.target : null;
    if (!t) return false;
    if (t.closest('select,option,input[type="file"]')) return false;   // Chrome's own lists and file box open on the press itself
    return true;
  }
  function hold(ev, p) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    var target = ev.target, fired = false;
    var init = { bubbles: true, cancelable: true, composed: true, view: window, detail: ev.detail,
                 clientX: ev.clientX, clientY: ev.clientY, screenX: ev.screenX, screenY: ev.screenY, button: ev.button, buttons: ev.buttons,
                 ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey };
    p.replay = function () {
      if (fired) return;
      fired = true;
      // the page may have redrawn the thing under the mouse meanwhile
      var to = target.isConnected ? target : document.elementFromPoint(init.clientX, init.clientY);
      if (!to) return;
      replaying = true;
      try { to.dispatchEvent(new MouseEvent('click', init)); } finally { replaying = false; }
    };
    setTimeout(p.replay, 1500);
  }
  var lastStep = 0;
  /* A DRAG IS A STEP TOO. A press let go somewhere else never becomes a
     click; it is one step ("Drag ..."), and the pictures taken while it
     moved are its clip. Not a drag: marking text with the mouse. */
  function moved(ev, p) {
    if (!p || !live() || Date.now() - p.at > 30000) return false;
    if (Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) < 24) return false;
    var sel = window.getSelection ? window.getSelection() : null;
    return !(sel && !sel.isCollapsed);
  }
  function dragged(p) {
    if (pending !== p) return;
    pending = null;
    lastStep = Date.now();
    p.step.role = 'drag';
    send({ type: 'guide-commit', step: p.step, coming: !p.done });
  }
  window.addEventListener('pointerup', function (ev) {
    if (ev.isPrimary && ev.button === 0 && !mine(ev) && moved(ev, pending)) dragged(pending);
  }, true);
  window.addEventListener('dragend', function (ev) { if (!mine(ev) && moved(ev, pending)) dragged(pending); }, true);
  window.addEventListener('click', function (ev) {
    if (replaying || !live() || mine(ev) || !ev.isTrusted) return;
    var p = pending;
    pending = null;
    if (p && Date.now() - p.at < 4000) {
      lastStep = Date.now();
      // coming: the picture has been asked for but is not taken yet
      send({ type: 'guide-commit', step: p.step, coming: !p.done });
      if (!p.done && holdable(ev)) hold(ev, p);
      return;
    }
    /* A click with no press before it: Enter or Space on a button. Not the
       second click a label hands to its field, which comes right behind
       the first. */
    if (ev.detail !== 0 || Date.now() - lastStep < 500) return;
    var step = describe(ev);
    if (!step) return;
    lastStep = Date.now();
    shoot(step, function () { send({ type: 'guide-commit', step: step }); });
  }, true);

  /* ---- the panel -------------------------------------------------------- */
  var CSS = '' +
    ':host { all: initial; --accent: #4f46e5; }' +
    '* { box-sizing: border-box; }' +
    '.p { position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 308px; max-height: calc(100vh - 32px); display: grid; gap: 12px;' +
    '     grid-template-rows: auto auto minmax(0, 1fr) auto; padding: 16px; background: #fff; color: #111; border: 1px solid #e5e7eb; border-radius: 20px;' +
    '     box-shadow: 0 12px 32px rgba(17,17,17,.18); font: 15px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;' +
    '     text-align: left; letter-spacing: 0; }' +
    '.p.left { right: auto; left: 16px; }' +
    '.p { -webkit-user-select: none; user-select: none; touch-action: none; cursor: grab; }' +
    '.p.dragging { cursor: grabbing; box-shadow: 0 16px 40px rgba(17,17,17,.28); }' +
    '.p button { cursor: pointer; }' +
    '.grip { width: 14px; height: 20px; flex: none; margin-left: auto; opacity: .45; background: radial-gradient(circle, #111 1.4px, transparent 1.6px) 0 0 / 7px 7px; }' +
    '.top { display: flex; align-items: center; gap: 9px; }' +
    '.rec { width: 12px; height: 12px; flex: none; border-radius: 50%; background: var(--accent); }' +
    '.paused .rec { background: #fff; box-shadow: inset 0 0 0 2px #111; }' +
    '.top b { font-weight: 600; font-size: 17px; flex: 1; }' +
    '.count { display: flex; align-items: baseline; gap: 10px; }' +
    '.count b { color: var(--accent); font-size: 44px; font-weight: 700; line-height: 1; min-width: 26px; }' +
    '.count span { color: #555; font-size: 14.5px; }' +
    'ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; align-content: start; overflow: hidden; }' +
    'li { display: grid; grid-template-columns: 26px minmax(0, 1fr) 56px; gap: 10px; align-items: center; border: 1px solid #e5e7eb; border-radius: 14px; padding: 8px 10px; font-size: 14px; }' +
    'li.new { border-color: var(--accent); background: #f5f5ff; }' +
    'li i { font-style: normal; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 600; font-size: 13px; padding-top: 2px; }' +
    'li span.t { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }' +
    'li span.t b { font-weight: 600; }' +
    '.th { position: relative; height: 36px; border-radius: 6px; border: 1px solid #dcdcdc; background: #fff; overflow: hidden; }' +
    '.th::after { content: ""; position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; border: 2px solid var(--accent); left: var(--x); top: var(--y); }' +
    '.acts { display: grid; gap: 8px; }' +
    '.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }' +
    'button.pill { display: flex; align-items: center; justify-content: center; width: 100%; border: 0; border-radius: 999px; background: var(--accent); color: #fff;' +
    '              font: inherit; font-weight: 600; font-size: 15px; line-height: 1; padding: 13px 14px 11px; cursor: pointer; white-space: nowrap; }' +
    'button.pill:hover { background: #3730a3; }' +
    'button.pill.line { background: #fff; color: #111; box-shadow: inset 0 0 0 1px #d4d7de; }' +
    'button.pill.line:hover { background: #fff; color: #111; box-shadow: inset 0 0 0 1px #111; }' +
    'button.pill:disabled { opacity: .4; cursor: default; }' +
    'button:focus-visible { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--accent); }' +
    '.hint { margin: 0; font-size: 13px; color: #555; }' +
    '.hint.say { color: #111; }' +
    '[hidden] { display: none !important; }' +
    '@media (max-width: 520px) { .p { width: auto; left: 8px; right: 8px; top: auto; bottom: 8px; } ol { display: none; } }';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function build() {
    if (host) return;
    host = document.createElement('step-guide-panel');
    root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    // a page that forbids inline styles still gets the panel's look
    try { var sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); root.adoptedStyleSheets = [sheet]; } catch (e) { root.appendChild(style); }
    var p = els.p = el('div', 'p');
    p.setAttribute('role', 'region'); p.setAttribute('aria-label', 'Making a guide');
    var top = el('div', 'top');
    top.appendChild(el('span', 'rec')); top.appendChild(el('b', '', 'Making a guide'));
    // the panel can be dragged anywhere; the spot is kept for every tab
    var grip = el('span', 'grip'); grip.setAttribute('aria-hidden', 'true'); p.title = 'Drag to move';
    top.appendChild(grip);
    var count = els.count = el('div', 'count');
    els.n = el('b', '', '0');
    els.said = el('span');
    count.appendChild(els.n); count.appendChild(els.said);
    els.list = el('ol');
    var acts = el('div', 'acts');
    els.finish = el('button', 'pill', 'Finish guide'); els.finish.type = 'button';
    var row = el('div', 'row');
    els.pause = el('button', 'pill line', 'Pause'); els.pause.type = 'button';
    els.undo = el('button', 'pill line', 'Undo last step'); els.undo.type = 'button';
    row.appendChild(els.pause); row.appendChild(els.undo);
    els.hint = el('p', 'hint');
    acts.appendChild(els.finish); acts.appendChild(row); acts.appendChild(els.hint);
    p.appendChild(top); p.appendChild(count); p.appendChild(els.list); p.appendChild(acts);
    root.appendChild(p);
    (document.body || document.documentElement).appendChild(host);
    if (shooting) host.style.setProperty('display', 'none', 'important');

    var dx = 0, dy = 0, grabbing = null;
    p.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('button')) return;
      var r = p.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top; grabbing = e.pointerId;
      p.setPointerCapture(grabbing); p.classList.add('dragging');
      e.preventDefault();
    });
    p.addEventListener('pointermove', function (e) {
      if (e.pointerId !== grabbing) return;
      state.pos = { x: e.clientX - dx, y: e.clientY - dy };
      place();
    });
    function drop(e) {
      if (e.pointerId !== grabbing) return;
      grabbing = null; p.classList.remove('dragging');
      if (state.pos) send({ type: 'guide-pos', x: state.pos.x, y: state.pos.y });
    }
    p.addEventListener('pointerup', drop);
    p.addEventListener('pointercancel', drop);
    addEventListener('resize', place);
    els.pause.addEventListener('click', function () { send({ type: 'guide-pause', paused: !state.paused }, apply); });
    els.undo.addEventListener('click', function () { els.undo.disabled = true; send({ type: 'guide-undo' }, apply); });
    els.finish.addEventListener('click', function () {
      els.finish.disabled = els.pause.disabled = els.undo.disabled = true;
      state.note = state.count ? 'Saving the guide…' : '';
      draw();
      send({ type: 'guide-finish' }, apply);
    });
  }
  // the dragged spot, kept inside the window; a phone-wide window keeps its place at the bottom
  function place() {
    var p = els.p;
    if (!p) return;
    if (!state.pos || innerWidth <= 520) { p.style.left = p.style.top = p.style.right = ''; return; }
    var x = Math.max(8, Math.min(state.pos.x, innerWidth - p.offsetWidth - 8));
    var y = Math.max(8, Math.min(state.pos.y, innerHeight - Math.min(p.offsetHeight, innerHeight - 16) - 8));
    p.style.left = Math.round(x) + 'px'; p.style.top = Math.round(y) + 'px'; p.style.right = 'auto';
  }
  function draw() {
    if (!host) return;
    els.p.className = 'p' + (state.side === 'left' ? ' left' : '') + (state.paused ? ' paused' : '') + (els.p.classList.contains('dragging') ? ' dragging' : '');
    els.n.textContent = String(state.count);
    els.said.textContent = '';
    els.said.appendChild(document.createTextNode(state.paused ? 'Paused. Clicks are not recorded.'
      : (state.count === 1 ? 'step so far.' : 'steps so far.') + ' Each click adds one.'));
    els.list.textContent = '';
    var last = state.steps.slice(-3);
    last.forEach(function (s, i) {
      var li = el('li', i === last.length - 1 ? 'new' : '');
      li.appendChild(el('i', '', String(s.n)));
      var t = el('span', 't');
      t.appendChild(document.createTextNode(s.label ? 'Click ' : 'Click here'));
      if (s.label) t.appendChild(el('b', '', s.label));
      li.appendChild(t);
      var th = el('span', 'th');
      th.style.setProperty('--x', Math.max(8, Math.min(92, s.x)) + '%');
      th.style.setProperty('--y', Math.max(14, Math.min(86, s.y)) + '%');
      li.appendChild(th);
      els.list.appendChild(li);
    });
    els.pause.textContent = state.paused ? 'Resume' : 'Pause';
    els.undo.disabled = !state.count || !state.on;
    els.finish.disabled = els.pause.disabled = !state.on;
    els.hint.className = 'hint' + (state.note ? ' say' : '');
    els.hint.textContent = state.note || 'Clicks on any tab you switch to count too. Typing and passwords are never recorded. Finish saves the guide in this browser and opens it.';
    place();
  }
  function remove() {
    gone = true;
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }
  function apply(s) {
    if (!s) return;
    if (s.gone) { state.on = false; if (s.note) { state.note = s.note; draw(); setTimeout(remove, 6000); } else remove(); return; }
    gone = false;
    state.on = !!s.on; state.paused = !!s.paused; state.count = s.count || 0; state.steps = s.steps || [];
    state.side = s.side === 'left' ? 'left' : 'right'; state.note = s.note || '';
    if (s.pos && !(els.p && els.p.classList.contains('dragging'))) state.pos = s.pos;
    if (!state.on) { remove(); return; }
    build();
    draw();
  }
  function hello() { send({ type: 'guide-hello' }, apply); }

  chrome.runtime.onMessage.addListener(function (msg, from, reply) {
    if (msg && msg.type === 'guide-state') apply(msg.state);
    if (msg && msg.type === 'guide-frame') reply(frameNow());
  });
  // a page that rebuilds its body (some apps do, on every move) keeps the panel
  new MutationObserver(function () {
    if (host && state.on && !gone && !host.isConnected) (document.body || document.documentElement).appendChild(host);
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.__stepGuide = { hello: hello };
  hello();
})();
