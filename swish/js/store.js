// store.js — local-first persistence (source of truth). Numbers only, never video.
//
// SCHEMA v2 adds the thing v1 had no concept of: an OWNER for every shot.
// v1 kept one flat list of sessions, so a trainer filming six players on one
// phone got one blended trend that described nobody. v2 keeps a roster and
// scopes every session, every stat and every trend to a player id.
//
// Other v2 foundations: an explicit schema version with a migration that runs
// once at boot, a hard cap on stored sessions (localStorage is a ~5MB origin
// budget and a quota failure used to be swallowed silently, so "Saved ✓" could
// be a lie), collision-proof ids, and writes that report success or failure.

const K_SCHEMA   = "swish.schema";
const K_SESSIONS = "swish.sessions.v2";
const K_PLAYERS  = "swish.players.v2";
const K_SETTINGS = "swish.settings.v1";
const K_LEGACY_SESSIONS = "swish.sessions.v1";

export const SCHEMA_VERSION = 2;
const MAX_SESSIONS = 2000;   // ~2k shots; oldest trimmed first, never a silent drop

const DEFAULT_SETTINGS = {
  seat: "",               // "" = not chosen yet | "trainer" (the buyer) | "player"
  trainerCode: "",        // a trainer's own code; players join a roster with it
  joinedCode: "",         // a player's coach code
  coachName: "",          // what a player calls their coach, for the UI
  onboarded: false,
  installedAt: "",        // set once at boot; the trial clock
  licenseKey: "",         // unlocks the roster offline (see billing.js)
  hand: "auto",
  angle: "auto",
  voice: true,
  liveSkel: true,
  model: "full",
  coach: "shot_doctor",   // which coaching archetype (see coaches.js PERSONAS)
  geminiKey: "",          // optional BYO key (browser-direct, never sent to a server)
  activePlayer: "",       // resolved lazily to the roster's first player
};

const subs = new Set();
function notify() { for (const fn of subs) { try { fn(); } catch {} } }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

/* ---- last storage failure, so the UI can stop claiming a save that did not happen ---- */
let lastWriteError = null;
export function lastStorageError() { return lastWriteError; }

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
  catch { return fallback; }
}

// Returns true on a real write. On a quota error it trims the oldest sessions
// once and retries, and only then gives up — loudly, via lastStorageError().
function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    lastWriteError = null;
    return true;
  } catch (e) {
    if (key === K_SESSIONS && Array.isArray(val) && val.length > 50) {
      try {
        const trimmed = val.slice(Math.floor(val.length / 2));
        localStorage.setItem(key, JSON.stringify(trimmed));
        lastWriteError = "Storage was full, so the oldest half of the history was trimmed.";
        return true;
      } catch {}
    }
    lastWriteError = "This phone would not let Swish save (storage is full or blocked in private mode).";
    return false;
  }
}

/* ---- ids: time + counter + randomness, so a reload cannot reissue an id ---- */
let idSeq = 0;
function newId(prefix) {
  let stamp; try { stamp = Date.now().toString(36); } catch { stamp = "0"; }
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${(idSeq++).toString(36)}${rand}`;
}

/* ============================ seats and codes ============================ */
// Swish is sold to the TRAINER. A trainer owns a roster and a code; a player
// seat is the free companion that joins a roster with that code and sends the
// coach their week. Nothing here is an account: there is no server, so a code
// is a local handle and a hand-off, never a login.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes
export function trainerCode() {
  const s = getSettings();
  if (s.trainerCode) return s.trainerCode;
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  const code = out.slice(0, 3) + "-" + out.slice(3);
  setSettings({ trainerCode: code });
  return code;
}
export function normalizeCode(raw) {
  const up = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return up.length === 6 ? up.slice(0, 3) + "-" + up.slice(3) : "";
}
export function seat() { return getSettings().seat || ""; }
export function isTrainer() { return seat() === "trainer"; }

/* ============================ roster ============================ */
function seedRoster() {
  const me = { id: "p_me", name: "Me", created: nowStamp() };
  write(K_PLAYERS, [me]);
  return [me];
}

export function getPlayers() {
  const list = read(K_PLAYERS, null);
  if (!Array.isArray(list) || !list.length) return seedRoster();
  return list;
}

export function addPlayer(name) {
  const clean = (name || "").trim().slice(0, 40) || "New player";
  const list = getPlayers();
  const rec = { id: newId("p"), name: clean, created: nowStamp() };
  list.push(rec);
  write(K_PLAYERS, list);
  notify();
  return rec;
}

export function renamePlayer(id, name) {
  const list = getPlayers();
  const p = list.find(x => x.id === id);
  if (!p) return null;
  p.name = (name || "").trim().slice(0, 40) || p.name;
  write(K_PLAYERS, list);
  notify();
  return p;
}

// Removing a player removes their shots too — this is their data, not ours.
export function removePlayer(id) {
  const list = getPlayers().filter(p => p.id !== id);
  write(K_PLAYERS, list.length ? list : seedRoster());
  write(K_SESSIONS, allSessions().filter(s => s.playerId !== id));
  const s = getSettings();
  if (s.activePlayer === id) setSettings({ activePlayer: getPlayers()[0]?.id || "" });
  notify();
}

export function getPlayer(id) { return getPlayers().find(p => p.id === id) || null; }

export function activePlayerId() {
  const s = getSettings();
  const roster = getPlayers();
  if (s.activePlayer && roster.some(p => p.id === s.activePlayer)) return s.activePlayer;
  return roster[0]?.id || "p_me";
}
export function setActivePlayer(id) { setSettings({ activePlayer: id }); }
export function activePlayer() { return getPlayer(activePlayerId()); }

/* ============================ settings ============================ */
export function getSettings() { return { ...DEFAULT_SETTINGS, ...read(K_SETTINGS, {}) }; }
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  write(K_SETTINGS, next);
  notify();
  return next;
}

/* ============================ sessions ============================ */
function allSessions() { return read(K_SESSIONS, []); }

// Every shot belongs to someone. No argument means the active player.
export function getSessions(playerId) {
  const pid = playerId === "*" ? null : (playerId || activePlayerId());
  const all = allSessions();
  return pid ? all.filter(s => s.playerId === pid) : all;
}

function summarize(report) {
  return {
    overall: report.overall,
    grade: report.grade,
    hand: report.hand,
    view: report.view,
    metrics: report.metrics.map(m => ({ key: m.key, label: m.label, value: m.value, unit: m.unit, score: m.score, status: m.status })),
    topFix: report.topFixes[0]?.label || null,
  };
}

export function saveSession(report, extra = {}) {
  const all = allSessions();
  const rec = {
    id: newId("s"),
    playerId: extra.playerId || activePlayerId(),
    ts: nowStamp(),
    ...summarize(report),
    note: extra.note || "",
    drill: extra.drill || null,
  };
  all.push(rec);
  while (all.length > MAX_SESSIONS) all.shift();
  const ok = write(K_SESSIONS, all);
  notify();
  return ok ? rec : null;
}

// Update an existing record in place (used when a shot is re-analyzed with a
// corrected hand/angle) so the trend isn't polluted with duplicates.
export function updateSession(id, report, extra = {}) {
  const all = allSessions();
  const i = all.findIndex(s => s.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...summarize(report), ...(extra.drill !== undefined ? { drill: extra.drill } : {}) };
  write(K_SESSIONS, all);
  notify();
  return all[i];
}

export function clearSessions(playerId) {
  const pid = playerId === "*" ? null : (playerId || activePlayerId());
  write(K_SESSIONS, pid ? allSessions().filter(s => s.playerId !== pid) : []);
  notify();
}

/* ---- trend + headline stats, scoped to one player ---- */
export function stats(playerId) {
  const s = getSessions(playerId);
  if (!s.length) return { count: 0, best: 0, avg: 0, last: 0, std: 0, trend: [] };
  const scores = s.map(x => x.overall);
  const best = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  // consistency = how repeatable (lower std = better) — the headline "shot signature"
  const std = Math.round(Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length));
  return { count: s.length, best, avg: Math.round(mean), last: scores[scores.length - 1], std, trend: scores.slice(-20) };
}

/* ---- the trainer's week: one row per player, no film to watch ---- */
export function weekLog(days = 7) {
  const cutoff = Date.now() - days * 86400000;
  const inWindow = (s) => { const t = Date.parse(s.ts); return Number.isFinite(t) ? t >= cutoff : false; };
  const prevWindow = (s) => {
    const t = Date.parse(s.ts);
    return Number.isFinite(t) && t < cutoff && t >= cutoff - days * 86400000;
  };
  return getPlayers().map(p => {
    const mine = allSessions().filter(s => s.playerId === p.id);
    const now = mine.filter(inWindow);
    const prev = mine.filter(prevWindow);
    const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b.overall, 0) / arr.length) : null;
    const nowAvg = avg(now), prevAvg = avg(prev);
    // the one thing to work on: the fix that showed up most this week
    const tally = {};
    now.forEach(s => { if (s.topFix) tally[s.topFix] = (tally[s.topFix] || 0) + 1; });
    const topFix = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const days_ = new Set(now.map(s => (s.ts || "").slice(0, 10))).size;
    return {
      id: p.id,
      name: p.name,
      shots: now.length,
      days: days_,
      avg: nowAvg,
      delta: (nowAvg != null && prevAvg != null) ? nowAvg - prevAvg : null,
      best: now.length ? Math.max(...now.map(s => s.overall)) : null,
      topFix,
      lastTs: mine.length ? mine[mine.length - 1].ts : null,
      total: mine.length,
    };
  });
}

/* ==================== the hand-off (no server, on purpose) ====================
   There is no backend. A player's week reaches their coach as a compact,
   numbers-only payload the player sends and the coach pastes in. Video never
   moves, because video never leaves the phone in the first place. When a sync
   service exists this same shape becomes its request body. */

const HANDOFF_VERSION = 1;
const HANDOFF_MAX = 40;   // most recent shots; keeps a paste-able payload small

export function exportWeek(days = 7) {
  const s = getSettings();
  const me = activePlayer();
  const cutoff = Date.now() - days * 86400000;
  const rows = getSessions(me?.id)
    .filter(r => { const t = Date.parse(r.ts); return Number.isFinite(t) ? t >= cutoff : true; })
    .slice(-HANDOFF_MAX)
    .map(r => ({ id: r.id, ts: r.ts, overall: r.overall, grade: r.grade, topFix: r.topFix, drill: r.drill, metrics: r.metrics }));
  const payload = { v: HANDOFF_VERSION, code: s.joinedCode || s.trainerCode || "", name: me?.name || "Player", rows };
  return { payload, text: encodeHandoff(payload), count: rows.length };
}

// A week the coach can read at a glance, with the machine payload underneath.
export function weekReport(days = 7) {
  const me = activePlayer();
  const { payload, text, count } = exportWeek(days);
  const rows = payload.rows;
  const scores = rows.map(r => r.overall);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best = scores.length ? Math.max(...scores) : null;
  const tally = {};
  rows.forEach(r => { if (r.topFix) tally[r.topFix] = (tally[r.topFix] || 0) + 1; });
  const topFix = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const dayCount = new Set(rows.map(r => String(r.ts).slice(0, 10))).size;
  const half = Math.floor(scores.length / 2);
  const trend = scores.length >= 4
    ? Math.round(scores.slice(half).reduce((a, b) => a + b, 0) / (scores.length - half)) -
      Math.round(scores.slice(0, half).reduce((a, b) => a + b, 0) / half)
    : null;

  const lines = [
    `SWISH — ${me?.name || "Player"} · last ${days} days`,
    `${count} shot${count === 1 ? "" : "s"} across ${dayCount} day${dayCount === 1 ? "" : "s"}`,
    avg != null ? `Form score: ${avg} average · ${best} best` : "No scored reps yet",
  ];
  if (trend != null) lines.push(`Trend inside the week: ${trend >= 0 ? "+" : ""}${trend}`);
  if (topFix) lines.push(`Showing up most: ${topFix[0]} (${topFix[1]} of ${count} reps)`);
  lines.push("", "Paste this whole message into Swish to load it:", text);
  return { text: lines.join("\n"), count, avg, best, topFix: topFix?.[0] || null };
}

export function encodeHandoff(payload) {
  const json = JSON.stringify(payload);
  try {
    // base64url so it survives a text message, an email and a URL hash
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return "SWISH1." + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch { return json; }
}

export function decodeHandoff(text) {
  let raw = (text || "").trim();
  if (!raw) return null;
  // the payload usually arrives inside a readable report, so pull the token out
  const token = raw.match(/SWISH1\.[A-Za-z0-9_-]+/);
  if (token) raw = token[0];
  try {
    if (raw.startsWith("SWISH1.")) {
      let b64 = raw.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    }
    return JSON.parse(raw);
  } catch { return null; }
}

// Merge a player's hand-off into this trainer's roster. Matches the player by
// name (case-insensitive) or creates them, and dedupes by session id so the
// same paste twice does not double a trend.
export function importHandoff(text) {
  const payload = typeof text === "string" ? decodeHandoff(text) : text;
  if (!payload || !Array.isArray(payload.rows)) return { ok: false, reason: "That does not look like a Swish hand-off." };
  const name = (payload.name || "Player").trim();
  let p = getPlayers().find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!p) p = addPlayer(name);
  const all = allSessions();
  const seen = new Set(all.map(r => r.id));
  let added = 0;
  payload.rows.forEach(r => {
    if (!r || seen.has(r.id)) return;
    all.push({ ...r, playerId: p.id, note: "", from: "handoff" });
    seen.add(r.id);
    added++;
  });
  all.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  while (all.length > MAX_SESSIONS) all.shift();
  const ok = write(K_SESSIONS, all);
  notify();
  return ok ? { ok: true, player: p, added, skipped: payload.rows.length - added }
            : { ok: false, reason: lastWriteError || "Could not save." };
}

/* ============================ migration ============================ */
// Runs once at boot. v1 -> v2: adopt the old flat session list into the roster's
// first player instead of dropping it on the floor.
// stamp the install date once, so a trial cannot be reset by a reload
export function stampInstall() {
  const s = getSettings();
  if (!s.installedAt) setSettings({ installedAt: nowStamp() });
}

export function migrate() {
  const from = Number(read(K_SCHEMA, 1)) || 1;
  if (from >= SCHEMA_VERSION) { write(K_SCHEMA, SCHEMA_VERSION); return { from, to: SCHEMA_VERSION, moved: 0 }; }

  let moved = 0;
  const legacy = read(K_LEGACY_SESSIONS, null);
  if (Array.isArray(legacy) && legacy.length) {
    const roster = getPlayers();
    const owner = roster[0].id;
    const existing = allSessions();
    const seen = new Set(existing.map(s => s.id));
    legacy.forEach(s => {
      if (!s || seen.has(s.id)) return;
      existing.push({ ...s, playerId: s.playerId || owner });
      moved++;
    });
    while (existing.length > MAX_SESSIONS) existing.shift();
    write(K_SESSIONS, existing);
  }
  write(K_SCHEMA, SCHEMA_VERSION);
  notify();
  return { from, to: SCHEMA_VERSION, moved };
}

// timestamp without Date.now sensitivity issues — uses Date at call time (UI only)
function nowStamp() {
  try { return new Date().toISOString(); } catch { return "" + performance.now(); }
}
