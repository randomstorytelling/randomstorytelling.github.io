/* localtime.js — the visitor's own clock, in their own city.

   No network call, no permission prompt, no third party. The city comes from
   the browser's own IANA timezone, so it is accurate to the ZONE, not the
   town: a visitor in Austin reads CHICAGO, IL because that is the zone they
   sit in. Swapping to a real city would mean an IP lookup on every page load.

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

  var id = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", function () {
    clearInterval(id);
    if (!document.hidden) { tick(); id = setInterval(tick, 1000); }
  });
})();
