/* Everything a guide is lives here, in the extension's own IndexedDB, first.
   Nothing leaves the browser unless a destination is set up (destinations.js).

     guides  { id, title, intro, began, ended, finishedAt, send }
     steps   { guide, key, meta, image (JPEG bytes), sentence }

   Loaded by the background script (importScripts) and by the extension's
   own pages (<script>), so both read the same rows. */
var Store = (function () {
  var NAME = 'step-guide', VERSION = 1, GUIDES = 'guides', STEPS = 'steps';
  var opened = null;

  function db() {
    if (opened) return opened;
    opened = new Promise(function (ok, bad) {
      var r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(GUIDES)) d.createObjectStore(GUIDES, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STEPS)) d.createObjectStore(STEPS, { autoIncrement: true }).createIndex('guide', 'guide');
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { opened = null; bad(r.error); };
    });
    return opened;
  }
  // runs fn on one store and resolves with what it handed back (an IDBRequest's result, or a plain value)
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, bad) {
        var t = d.transaction(store, mode), out = fn(t.objectStore(store));
        t.oncomplete = function () { ok(out && typeof out === 'object' && 'result' in out ? out.result : out); };
        t.onerror = function () { bad(t.error); };
        t.onabort = function () { bad(t.error); };
      });
    });
  }

  function guide(id) { return tx(GUIDES, 'readonly', function (s) { return s.get(id); }); }
  function guides() {
    return tx(GUIDES, 'readonly', function (s) { return s.getAll(); }).then(function (rows) {
      return rows.sort(function (a, b) { return (b.began || 0) - (a.began || 0); });
    });
  }
  function putGuide(row) { return tx(GUIDES, 'readwrite', function (s) { s.put(row); }); }
  function change(id, fn) {
    return tx(GUIDES, 'readwrite', function (s) {
      var g = s.get(id), out = { result: null };
      g.onsuccess = function () { if (g.result) { fn(g.result); s.put(g.result); out.result = g.result; } };
      return out;
    });
  }

  /* A guide's steps in the order they were taken, each with its row key
     (pk) so one can be changed or deleted. */
  function steps(id) {
    return tx(STEPS, 'readonly', function (s) {
      var out = { result: [] };
      s.index('guide').openCursor(IDBKeyRange.only(id)).onsuccess = function (e) {
        var c = e.target.result;
        if (!c) return;
        var row = c.value;
        row.pk = c.primaryKey;
        out.result.push(row);
        c.continue();
      };
      return out;
    }).then(function (rows) { return rows.sort(function (a, b) { return a.pk - b.pk; }); });
  }
  function count(id) { return tx(STEPS, 'readonly', function (s) { return s.index('guide').count(id); }); }
  function addStep(row) { return tx(STEPS, 'readwrite', function (s) { s.add(row); }); }
  function changeStep(pk, fn) {
    return tx(STEPS, 'readwrite', function (s) {
      var q = s.get(pk);
      q.onsuccess = function () { if (q.result) { fn(q.result); s.put(q.result, pk); } };
    });
  }
  function dropStep(pk) { return tx(STEPS, 'readwrite', function (s) { s.delete(pk); }); }

  function forget(id) {
    return db().then(function (d) {
      return new Promise(function (ok, bad) {
        var t = d.transaction([GUIDES, STEPS], 'readwrite');
        t.objectStore(STEPS).index('guide').openKeyCursor(IDBKeyRange.only(id)).onsuccess = function (e) {
          var c = e.target.result;
          if (c) { t.objectStore(STEPS).delete(c.primaryKey); c.continue(); }
        };
        t.objectStore(GUIDES).delete(id);
        t.oncomplete = ok;
        t.onerror = function () { bad(t.error); };
      });
    });
  }

  return { guide: guide, guides: guides, putGuide: putGuide, change: change,
           steps: steps, count: count, addStep: addStep, changeStep: changeStep, dropStep: dropStep, forget: forget };
})();
