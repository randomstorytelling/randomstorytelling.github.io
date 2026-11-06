/* films.js — one controller for every film block on the page.
   Markup contract: a container with class "hv" holds one ".hvid[data-vimeo]" (poster <img> inside).
   The controller owns ONE state per block: the class "is-on". CSS reacts only to that class.
   Mode, set on <html data-film-mode>:
     hover — fine pointer + hover (desktop): mouse enter/leave flips it.
     touch — touch screens: the row the finger lands on (the phone's own hover moment) plays its film behind the words;
             at rest the page is plain text (Lawrence 2026-11-05: "from the surface it's looking like nothing").
   prefers-reduced-motion: films never load; posters stay.
   2026-11-05, Lawrence: "architectural build, not a patch". */
(function () {
  var root = document.documentElement;
  var blocks = [].slice.call(document.querySelectorAll('.hv'));
  if (!blocks.length) return;

  var hoverMQ = matchMedia('(hover: hover) and (pointer: fine)');
  var calmMQ = matchMedia('(prefers-reduced-motion: reduce)');
  var cleanup = [];

  function film(b) { return b.querySelector('.hvid[data-vimeo]'); }

  function load(h) {
    if (!h || calmMQ.matches || h.querySelector('iframe')) return;
    var f = document.createElement('iframe');
    f.allow = 'autoplay; fullscreen';
    f.title = 'film';
    f.setAttribute('tabindex', '-1');
    f.src = 'https://player.vimeo.com/video/' + h.dataset.vimeo +
      '?background=1&muted=1&loop=1&autoplay=1&quality=540p';
    /* reveal only once the player reports real playback; a blocked or failed player leaves the poster showing */
    f.addEventListener('load', function () {
      ['play', 'playProgress'].forEach(function (ev) { send(h, 'addEventListener', ev); });
      if (!h.closest('.is-on')) send(h, 'pause');
    });
    h.appendChild(f);
  }

  function send(h, method, value) {
    var f = h && h.querySelector('iframe');
    if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify(value === undefined ? { method: method } : { method: method, value: value }), 'https://player.vimeo.com');
  }

  addEventListener('message', function (m) {
    if (m.origin !== 'https://player.vimeo.com') return;
    var d; try { d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch (x) { return; }
    if (!d || (d.event !== 'play' && d.event !== 'playProgress')) return;
    [].forEach.call(document.querySelectorAll('.hvid iframe'), function (f) { if (f.contentWindow === m.source) f.parentNode.classList.add('is-ready'); });
  });

  function on(b) { if (b.classList.contains('is-on')) return; b.classList.add('is-on'); var h = film(b); load(h); send(h, 'play'); }
  function off(b) { if (!b.classList.contains('is-on')) return; b.classList.remove('is-on'); send(film(b), 'pause'); }

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

  function observe(margin, cb) {
    if (!('IntersectionObserver' in window)) return null;
    var io = new IntersectionObserver(function (es) { es.forEach(cb); }, { rootMargin: margin });
    blocks.forEach(function (b) { io.observe(b); });
    cleanup.push(function () { io.disconnect(); });
    return io;
  }

  function startHover() {
    sizeRows();
    var onResize = function () { sizeRows(); };
    addEventListener('resize', onResize);
    cleanup.push(function () { removeEventListener('resize', onResize); });
    blocks.forEach(function (b) {
      var en = function () { on(b); }, lv = function () { off(b); };
      b.addEventListener('mouseenter', en); b.addEventListener('mouseleave', lv);
      cleanup.push(function () { b.removeEventListener('mouseenter', en); b.removeEventListener('mouseleave', lv); });
    });
    /* warm the player before the mouse arrives */
    observe('400px 0px', function (e) { if (e.isIntersecting) load(film(e.target)); });
  }

  function startTouch() {
    var down = function (e) {
      var b = e.target.closest && e.target.closest('.hv');
      blocks.forEach(function (x) { if (x !== b) off(x); });
      if (b) on(b);
    };
    document.addEventListener('touchstart', down, { passive: true });
    cleanup.push(function () { document.removeEventListener('touchstart', down); });
    /* warm the player before the finger arrives, so the poster and film are instant */
    observe('400px 0px', function (e) { if (e.isIntersecting) load(film(e.target)); });
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
