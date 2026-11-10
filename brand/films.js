/* films.js — one controller for every film block on the page.
   Markup contract: a container with class "hv" holds one ".hvid[data-film]" (poster <img> inside).
     data-film  = the hover film, served from this site (brand/films/*.mp4: 540p, no audio, faststart).
     data-vimeo = the Vimeo ID the file was encoded from (provenance only; the controller never loads Vimeo).
   The controller owns ONE state per block: the class "is-on". CSS reacts only to that class.
   Mode, set on <html data-film-mode>:
     hover — fine pointer + hover (desktop): mouse enter/leave flips it.
     touch — touch screens: the row the finger lands on (the phone's own hover moment) plays its film behind the words;
             at rest the page is plain text (Lawrence 2026-11-05: "from the surface it's looking like nothing").
   Warm-up: a block within 400px of the screen gets its <video> early (preload metadata), so its opening frame is
     decoded before the mouse or finger arrives; browsers that ignore preload get a muted play-then-pause instead. Data saver / 2g: no warm-up.
   Bandwidth: an idle film holds only its opening buffer (preload "metadata"); the film that is on gets "auto",
     so the one being watched owns the connection. 2026-11-10: with every warmed film on "auto", a slow-4G tap on the
     footer film waited 4.4 s live behind the four films above it, and plain scrolling pulled 15.4 MB.
   The film is revealed (.is-ready) only once the browser has a real frame; a failed file leaves the poster.
   prefers-reduced-motion: films never load; posters stay.
   2026-11-05, Lawrence: "architectural build, not a patch".
   2026-11-10: Vimeo iframes replaced by native video. Vimeo's player now runs a Cloudflare check plus its own
     player boot before a single frame, which is the wait Lawrence still felt ("still taking a little too long"). */
(function () {
  var root = document.documentElement;
  var blocks = [].slice.call(document.querySelectorAll('.hv'));
  if (!blocks.length) return;

  var hoverMQ = matchMedia('(hover: hover) and (pointer: fine)');
  var calmMQ = matchMedia('(prefers-reduced-motion: reduce)');
  var net = navigator.connection || {};
  var lean = !!net.saveData || /(^|-)2g$/.test(net.effectiveType || '');
  var cleanup = [];

  function film(b) { return b.querySelector('.hvid[data-film]'); }
  function block(h) { return h.closest('.hv'); }

  function load(h) {
    if (!h || calmMQ.matches) return null;
    var v = h.querySelector('video');
    if (v) return v;
    v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
    v.playsInline = true; v.setAttribute('playsinline', '');
    v.loop = true;
    v.preload = 'metadata';
    v.disablePictureInPicture = true;
    v.setAttribute('aria-hidden', 'true');
    v.tabIndex = -1;
    var ready = function () { h.classList.add('is-ready'); };
    v.addEventListener('loadeddata', ready);
    v.addEventListener('playing', ready);
    v.src = h.dataset.film;
    h.appendChild(v);
    return v;
  }

  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); return p; }

  /* warm = load with preload "metadata" (opening frame + a small buffer, no more). A browser that ignores preload
     (iPhone Safari) shows it by still having no frame after 1.5 s; only then prime it with a muted play, then pause.
     Priming everywhere made Chrome keep downloading each idle film nearly in full (14 MB on one scroll, 11/10). */
  function warm(h) {
    if (lean) return;
    var v = load(h);
    if (!v || v.dataset.warm) return;
    v.dataset.warm = '1';
    setTimeout(function () {
      if (v.readyState >= 2 || block(h).classList.contains('is-on')) return;
      var p = play(v);
      var settle = function () { if (!block(h).classList.contains('is-on')) v.pause(); };
      if (p && p.then) p.then(settle, function () {}); else settle();
    }, 1500);
  }

  function on(b) { if (b.classList.contains('is-on')) return; b.classList.add('is-on'); var v = load(film(b)); if (v) { v.preload = 'auto'; play(v); } }
  function off(b) { if (!b.classList.contains('is-on')) return; b.classList.remove('is-on'); var h = film(b), v = h && h.querySelector('video'); if (v) { v.pause(); v.preload = 'metadata'; } }

  /* Desktop: the film fills everything left of the details column, sized to a true 16:9. */
  function sizeRows() {
    blocks.forEach(function (b) {
      if (!b.classList.contains('row')) return;
      var p = b.querySelector('.pr'), h = film(b);
      if (!p || !h) return;
      b.style.removeProperty('--filmh');
      var rb = b.getBoundingClientRect(), pb = p.getBoundingClientRect();
      b.style.setProperty('--rowpad', getComputedStyle(b).paddingTop);
      b.style.setProperty('--filmh', Math.round((pb.left - 28 - rb.left) * 9 / 16) + 'px');
      h.style.right = (rb.right - pb.left + 28) + 'px';
    });
  }
  function clearRows() {
    blocks.forEach(function (b) { b.style.removeProperty('--filmh'); b.style.removeProperty('--rowpad'); var h = film(b); if (h) h.style.right = ''; });
  }

  /* warm each film as its block comes within 400px of the screen; without IntersectionObserver, warm them all */
  function warmNearView() {
    if (lean) return;
    if (!('IntersectionObserver' in window)) { blocks.forEach(function (b) { warm(film(b)); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { warm(film(e.target)); io.unobserve(e.target); } });
    }, { rootMargin: '400px 0px' });
    blocks.forEach(function (b) { io.observe(b); });
    cleanup.push(function () { io.disconnect(); });
  }

  function startHover() {
    sizeRows();
    var onResize = function () { sizeRows(); };
    addEventListener('resize', onResize);
    cleanup.push(function () { removeEventListener('resize', onResize); clearRows(); });
    blocks.forEach(function (b) {
      var en = function () { on(b); }, lv = function () { off(b); };
      b.addEventListener('mouseenter', en); b.addEventListener('mouseleave', lv);
      cleanup.push(function () { b.removeEventListener('mouseenter', en); b.removeEventListener('mouseleave', lv); });
    });
    warmNearView();
  }

  function startTouch() {
    var down = function (e) {
      var b = e.target.closest && e.target.closest('.hv');
      blocks.forEach(function (x) { if (x !== b) off(x); });
      if (b) on(b);
    };
    /* finger lifts = a real user activation: retry play for a film the browser held back
       (iPhone Low Power Mode blocks muted play until then, and blocks the warm-up entirely) */
    var up = function (e) {
      var b = e.target.closest && e.target.closest('.hv.is-on');
      var h = b && film(b), v = h && h.querySelector('video');
      if (v && v.paused) play(v);
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    cleanup.push(function () { document.removeEventListener('touchstart', down); document.removeEventListener('touchend', up); });
    warmNearView();
  }

  function apply() {
    cleanup.splice(0).forEach(function (fn) { fn(); });
    blocks.forEach(off);
    var mode = hoverMQ.matches ? 'hover' : 'touch';
    root.setAttribute('data-film-mode', mode);
    if (calmMQ.matches) return;
    mode === 'hover' ? startHover() : startTouch();
  }

  [hoverMQ, calmMQ].forEach(function (mq) {
    mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply);
  });
  apply();
})();
