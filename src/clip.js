/* Plays a step's clip: its pictures stacked in the step's box, each faded
   into the next. The first is held twice as long with the ring on it (what
   was clicked), the last three times as long (where it ended up), then it
   starts again. Someone who asked their system for less motion sees the
   still picture.

   The same function runs on the guide's page and inside a downloaded web
   page (export.js copies its source), so both play the same way. */
function playClips(root) {
  var BEAT = 500, still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  (root || document).querySelectorAll('.pic[data-clip]').forEach(function (box) {
    if (box.dataset.playing || still) return;
    var frames = box.querySelectorAll('img.f'), ring = box.querySelector('.ring');
    if (frames.length < 2) return;
    box.dataset.playing = '1';
    var i = 0;
    function show() {
      if (!box.isConnected) return;
      frames.forEach(function (f, k) { f.style.opacity = k === i ? '1' : '0'; });
      if (ring) ring.style.opacity = i === 0 ? '1' : '0';
      var hold = i === 0 ? 2 : i === frames.length - 1 ? 3 : 1;
      setTimeout(function () { i = (i + 1) % frames.length; show(); }, hold * BEAT);
    }
    show();
  });
}
