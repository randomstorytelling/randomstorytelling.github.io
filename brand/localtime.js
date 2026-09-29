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

   A mount carrying [data-localtime-rotate="6"] shows the SISTER CITIES of the
   visitor's own city (brand/sisters.js), one every 6 seconds, each with its
   own local time. A visitor whose city is not in that table gets the SPOTS
   list below, the places the Apple TV aerial screensavers fly over.
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

  var SPOTS = [
    ["America/Chicago", "Chicago, IL"], ["America/Los_Angeles", "San Francisco, CA"],
    ["America/New_York", "New York, NY"], ["Europe/London", "London, UK"],
    ["Asia/Dubai", "Dubai, UAE"], ["Asia/Hong_Kong", "Hong Kong"],
    ["America/Los_Angeles", "Los Angeles, CA"], ["Pacific/Honolulu", "Hawaii"],
    ["Asia/Shanghai", "Great Wall, China"], ["Asia/Dubai", "Liwa, UAE"],
    ["America/Godthab", "Greenland"], ["Atlantic/Reykjavik", "Iceland"],
    ["Europe/London", "Scotland"], ["America/Los_Angeles", "Yosemite, CA"],
    ["America/Phoenix", "Grand Canyon, AZ"]
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
    if (h.hasAttribute("data-localtime-rotate")) { c.textContent = ring[0][1]; return; }
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
        if (c && c.textContent !== sp[1]) c.textContent = sp[1];
      }
      var s = clock(now, h.hasAttribute("data-localtime-seconds"), tz);
      if (s) t.textContent = s;
    });
  }

  tick();
  hosts.forEach(function (h) { h.hidden = false; });
  if (hosts.some(function (h) { return !h.hasAttribute("data-localtime-zone"); })) refine();

  var id = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", function () {
    clearInterval(id);
    if (!document.hidden) { tick(); id = setInterval(tick, 1000); }
  });
})();
