/* localtime.js — the visitor's own clock, in their own city.

   Two passes. First the browser's own IANA timezone paints a city instantly,
   with no network call and no permission prompt, so the clock never blocks.
   Then one IP lookup refines it to the real town (Austin, TX rather than the
   zone's Chicago, IL) and the answer is cached for the session, so it is one
   request per visitor rather than one per page. The lookup sends the visitor's
   IP to a third party; if it is slow, blocked or down, the timezone city just
   stays. Enabled on Lawrence's word 2026-09-21.

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

  function place() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (US[tz]) return US[tz];
      var leaf = tz.split("/").pop();
      return leaf ? leaf.replace(/_/g, " ") : "";
    } catch (e) { return ""; }
  }

  function clock(now, withSeconds) {
    var opts = { hour: "2-digit", minute: "2-digit", hour12: true };
    if (withSeconds) opts.second = "2-digit";
    try { return now.toLocaleTimeString("en-US", opts); } catch (e) { return ""; }
  }

  var hosts = [].slice.call(document.querySelectorAll("[data-localtime]"));
  if (!hosts.length) return;

  var where = place();
  hosts.forEach(function (h) {
    var c = h.querySelector("[data-localtime-city]");
    if (!c) return;
    if (where) c.textContent = where; else c.remove();
  });

  /* pass two: the real town, once per session, never blocking */
  function paint(label) {
    hosts.forEach(function (h) {
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
      var s = clock(now, h.hasAttribute("data-localtime-seconds"));
      if (s) t.textContent = s;
    });
  }

  tick();
  hosts.forEach(function (h) { h.hidden = false; });
  refine();

  var id = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", function () {
    clearInterval(id);
    if (!document.hidden) { tick(); id = setInterval(tick, 1000); }
  });
})();
