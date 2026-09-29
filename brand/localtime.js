/* localtime.js — the visitor's own clock, in their own city.

   Two passes. First the browser's own IANA timezone paints a city instantly,
   with no network call and no permission prompt, so the clock never blocks.
   Then one IP lookup refines it to the real town (Austin, TX rather than the
   zone's Chicago, IL) and the answer is cached for the session, so it is one
   request per visitor rather than one per page. The lookup sends the visitor's
   IP to a third party; if it is slow, blocked or down, the timezone city just
   stays. Enabled on Lawrence's word 2026-09-21.

   A mount carrying [data-localtime-zone="America/Chicago"] is FIXED: it shows
   that zone's time and city to every visitor and skips pass two. With the
   attribute empty it keeps the visitor's own zone city. Lawrence, 2026-09-29.

   A mount carrying [data-localtime-rotate="6"] walks the SPOTS list below,
   one place every 6 seconds, each with its own local time: widely loved
   hikes, weighted to Africa, South America and Asia. Same for every visitor, no
   lookup. (If brand/sisters.js is loaded it shows the visitor's sister
   cities instead; the home page does not load it.) Lawrence, 2026-09-29.

   The rotating mount changes its letters like a split flap board: every
   letter that differs spins through a few others, left to right, then lands.
   Visitors who ask their system for less motion get a plain swap.
   Lawrence, 2026-09-29.

   Mount points: any element with [data-localtime]. Inside it,
   [data-localtime-clock] gets the time and [data-localtime-city] the place.
   Fails silent: if anything throws, the block stays hidden. */
(function () {
  var US = {
    "America/Chicago": "Chicago, IL", "America/New_York": "New York, NY",
    "America/Los_Angeles": "Los Angeles, CA", "America/Denver": "Denver, CO",
    "America/Phoenix": "Phoenix, AZ", "America/Detroit": "Detroit, MI",
    "America/Anchorage": "Anchorage, AK", "Pacific/Honolulu": "Honolulu, HI",
    "America/Indiana/Indianapolis": "Indianapolis, IN", "America/Boise": "Boise, ID",
    "America/Toronto": "Toronto, ON", "America/Vancouver": "Vancouver, BC",
    "America/Mexico_City": "Mexico City, MX"
  };

  /* Widely loved hikes: Africa 9, South America 6, Asia 6, North America 6
     (5 in the United States), Costa Rica 3, Europe 3, Oceania 3. Dealt so
     the same group never comes up twice running. His split, 2026-09-29. */
  var SPOTS = [
    ["Africa/Dar_es_Salaam", "Kilimanjaro, Tanzania"],
    ["America/Punta_Arenas", "Torres del Paine, Chile"],
    ["Africa/Johannesburg", "Drakensberg, South Africa"],
    ["Asia/Kathmandu", "Everest Base Camp, Nepal"],
    ["Africa/Addis_Ababa", "Simien Mountains, Ethiopia"],
    ["America/Los_Angeles", "Yosemite, California"],
    ["Africa/Nairobi", "Mount Kenya, Kenya"],
    ["America/Lima", "Inca Trail, Peru"],
    ["Africa/Kampala", "Rwenzori Mountains, Uganda"],
    ["Asia/Tokyo", "Kumano Kodo, Japan"],
    ["America/Phoenix", "Grand Canyon, Arizona"],
    ["Africa/Windhoek", "Fish River Canyon, Namibia"],
    ["America/Argentina/Rio_Gallegos", "Fitz Roy, Argentina"],
    ["Asia/Shanghai", "Tiger Leaping Gorge, China"],
    ["America/Edmonton", "Banff, Canada"],
    ["Africa/Casablanca", "Toubkal, Morocco"],
    ["America/Lima", "Huayhuash, Peru"],
    ["Asia/Kathmandu", "Annapurna Circuit, Nepal"],
    ["America/Denver", "Zion, Utah"],
    ["America/Costa_Rica", "Corcovado, Costa Rica"],
    ["Europe/Paris", "Tour du Mont Blanc, France"],
    ["Pacific/Auckland", "Milford Track, New Zealand"],
    ["Africa/Johannesburg", "Table Mountain, South Africa"],
    ["America/Bogota", "Ciudad Perdida, Colombia"],
    ["Asia/Thimphu", "Tiger's Nest, Bhutan"],
    ["Pacific/Honolulu", "Kalalau Trail, Hawaii"],
    ["America/Costa_Rica", "Chirripó, Costa Rica"],
    ["Europe/Rome", "Dolomites, Italy"],
    ["Australia/Hobart", "Overland Track, Tasmania"],
    ["Africa/Blantyre", "Mount Mulanje, Malawi"],
    ["America/Bahia", "Chapada Diamantina, Brazil"],
    ["Asia/Kuching", "Mount Kinabalu, Malaysia"],
    ["America/Denver", "Glacier, Montana"],
    ["America/Costa_Rica", "Arenal, Costa Rica"],
    ["Atlantic/Reykjavik", "Laugavegur, Iceland"],
    ["Pacific/Auckland", "Tongariro, New Zealand"]
  ];
  var born = Date.now();
  var ring = SPOTS;

  function sisters(label) {
    var all = window.RS_SISTERS || {};
    var list = all[label];
    if (list && list.length) { ring = list.map(function (r) { return [r[1], r[0]]; }); born = Date.now(); return true; }
    return false;
  }

  function spot(h, now) {
    var every = parseFloat(h.getAttribute("data-localtime-rotate")) || 6;
    return ring[Math.floor((now - born) / (every * 1000)) % ring.length];
  }

  var FLAPS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var still = false;
  try { still = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function land(cell, ch) {
    cell.textContent = ch === " " ? "\u00a0" : ch;
    cell.classList.remove("on");
    void cell.offsetWidth;
    cell.classList.add("on");
  }

  function flap(el, text) {
    if (el._txt === text) return;
    if (still || !el.classList) { el.textContent = text; el._txt = text; return; }
    if (el._txt === undefined) el.textContent = "";
    el._txt = text;
    el.setAttribute("aria-label", text);
    var want = Array.from(text), cells = el.children, i;
    while (cells.length > want.length) el.removeChild(el.lastChild);
    while (cells.length < want.length) {
      var n = document.createElement("span");
      n.className = "flap"; n.setAttribute("aria-hidden", "true"); n.textContent = "\u00a0";
      el.appendChild(n);
    }
    for (i = 0; i < want.length; i++) (function (cell, ch, i) {
      var now = cell.textContent === "\u00a0" ? " " : cell.textContent;
      if (cell._t) { clearInterval(cell._t); cell._t = 0; }
      if (now === ch) return;
      /* lands on the clock, not on a count: a throttled tab still finishes */
      var due = Date.now() + (4 + Math.min(i, 14)) * 55;
      cell._t = setInterval(function () {
        if (el._txt !== text) { clearInterval(cell._t); cell._t = 0; return; }
        if (Date.now() >= due) { clearInterval(cell._t); cell._t = 0; land(cell, ch); return; }
        land(cell, FLAPS.charAt(Math.floor(Math.random() * FLAPS.length)));
      }, 55);
    })(cells[i], want[i], i);
  }

  function place() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (US[tz]) return US[tz];
      var leaf = tz.split("/").pop();
      return leaf ? leaf.replace(/_/g, " ") : "";
    } catch (e) { return ""; }
  }

  function clock(now, withSeconds, tz) {
    var opts = { hour: "2-digit", minute: "2-digit", hour12: true };
    if (withSeconds) opts.second = "2-digit";
    if (tz) opts.timeZone = tz;
    try { return now.toLocaleTimeString("en-US", opts); } catch (e) { return ""; }
  }

  var hosts = [].slice.call(document.querySelectorAll("[data-localtime]"));
  if (!hosts.length) return;

  var where = place();
  sisters(where);
  hosts.forEach(function (h) {
    var c = h.querySelector("[data-localtime-city]");
    if (!c) return;
    if (h.hasAttribute("data-localtime-rotate")) { flap(c, ring[0][1]); return; }
    var fixed = h.getAttribute("data-localtime-zone");
    if (fixed) { c.textContent = US[fixed] || fixed.split("/").pop().replace(/_/g, " "); return; }
    if (where) c.textContent = where; else c.remove();
  });

  /* pass two: the real town, once per session, never blocking */
  function paint(label) {
    if (sisters(label)) tick();
    hosts.forEach(function (h) {
      if (h.hasAttribute("data-localtime-zone") || h.hasAttribute("data-localtime-rotate")) return;
      var c = h.querySelector("[data-localtime-city]");
      if (c) c.textContent = label;
    });
  }

  function refine() {
    var cached;
    try { cached = sessionStorage.getItem("rs.city"); } catch (e) {}
    if (cached) { paint(cached); return; }
    if (!window.fetch) return;

    var ctl, signal;
    try { ctl = new AbortController(); signal = ctl.signal; } catch (e) {}
    var killed = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 2500);

    fetch("https://ipwho.is/?fields=city,region_code,success", signal ? { signal: signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) {
        clearTimeout(killed);
        if (!d || d.success === false || !d.city) return;
        var label = d.region_code ? d.city + ", " + d.region_code : d.city;
        try { sessionStorage.setItem("rs.city", label); } catch (e) {}
        paint(label);
      })
      .catch(function () { clearTimeout(killed); });
  }

  function tick() {
    var now = new Date();
    hosts.forEach(function (h) {
      var t = h.querySelector("[data-localtime-clock]");
      if (!t) return;
      var tz = h.getAttribute("data-localtime-zone");
      if (h.hasAttribute("data-localtime-rotate")) {
        var sp = spot(h, now.getTime()), c = h.querySelector("[data-localtime-city]");
        tz = sp[0];
        if (c) flap(c, sp[1]);
        var rs = clock(now, h.hasAttribute("data-localtime-seconds"), tz);
        if (rs) flap(t, rs);
        return;
      }
      var s = clock(now, h.hasAttribute("data-localtime-seconds"), tz);
      if (s) t.textContent = s;
    });
  }

  tick();
  hosts.forEach(function (h) { h.hidden = false; });
  if (hosts.some(function (h) { return !h.hasAttribute("data-localtime-zone") && !(h.hasAttribute("data-localtime-rotate") && !window.RS_SISTERS); })) refine();

  var id = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", function () {
    clearInterval(id);
    if (!document.hidden) { tick(); id = setInterval(tick, 1000); }
  });
})();
