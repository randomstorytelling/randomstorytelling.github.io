// billing.js — how a trainer actually buys Swish.
//
// There is no server, so there is no account and no card handling in this app.
// The purchase happens on a hosted checkout page; the buyer gets a license key
// by email; the key unlocks the roster offline. That is the whole mechanism,
// and it is the only honest one without a backend.
//
// TO GO LIVE, EDIT THE THREE CONSTANTS BELOW. Nothing else needs to change.
//
// 2026-09-21: there IS a server now. LICENSE_API below mints, device-binds,
// verifies and revokes keys. A key has to be redeemed online ONCE; after that
// the device carries a signed token for 30 days and refreshes it quietly
// whenever there is a line, so a gym with no signal never locks anyone out.

// Live Stripe Payment Links, created 2026-09-21 on acct_1TnjDo90Xq05dzfC.
export const CHECKOUT_URL = "";           // per-plan links live in PLANS below
export const BOOK_A_CALL   = "https://calendly.com/randomstorytelling/free-intro-call";  // 15 minutes, free, phone
export const SALES_EMAIL  = "lawrence@vybrancelabs.co";

// The license server. Empty string falls back to offline-checksum-only, which
// is what shipped before today and which anyone could forge.
export const LICENSE_API = "https://swish-license.vybrance.workers.dev";

export const PLANS = {
  free:  { name: "Solo",   price: "Free",      players: 3,        blurb: "Your own reps plus three players.", url: "" },
  pro:   { name: "Roster", price: "$29 / mo",  players: 25,       blurb: "Up to 25 players, the full week log, unlimited hand-offs.",
           url: "https://buy.stripe.com/aFa9ANglv13jeY8aYb3ZK00" },
  team:  { name: "Program",price: "$79 / mo",  players: Infinity, blurb: "A whole program: unlimited players and coaches.",
           url: "https://buy.stripe.com/5kQaER7OZaDTaHSean3ZK01" },
};

export const TRIAL_DAYS = 14;

/* ---- license keys: SW-XXXXX-CCCC, checksum-validated offline ----
   This is a trust model, not DRM: it stops casual sharing and nothing more.
   The honest upgrade path is a licence server, and the shape below is ready
   for one — validate() is the only thing that would change. */
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function checksum(body, plan) {
  let h = plan === "team" ? 7 : 3;
  for (const ch of body) h = (h * 31 + ALPHA.indexOf(ch) + 1) % 1048576;
  let out = "";
  for (let i = 0; i < 4; i++) { out = ALPHA[h % ALPHA.length] + out; h = Math.floor(h / ALPHA.length); }
  return out;
}

// Mint a key (used by the seller, not the app: node -e to print keys for buyers)
export function mintKey(plan = "pro") {
  let body = "";
  for (let i = 0; i < 5; i++) body += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  const tag = plan === "team" ? "T" : "R";
  return `SW-${tag}${body}-${checksum(tag + body, plan)}`;
}

// Shape check only. It proves a key is typed correctly, NOT that we issued it.
// Unlocking requires a token from the license server (see redeem below).
export function keyLooksValid(raw) {
  const key = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!key.startsWith("SW") || key.length !== 12) return null;
  const body = key.slice(2, 8);        // tag + 5
  const sum  = key.slice(8);
  const plan = body[0] === "T" ? "team" : body[0] === "R" ? "pro" : null;
  if (!plan) return null;
  return checksum(body, plan) === sum ? plan : null;
}

export function formatKey(raw) {
  const k = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return k.length === 12 ? `${k.slice(0, 2)}-${k.slice(2, 8)}-${k.slice(8)}` : raw;
}

export const validateKey = keyLooksValid;   // old name, same shape check

/* ------------------------- the license server ---------------------------- */
// One stable id per install, so a trainer's phone and tablet count separately
// and a key can be limited to a sensible number of devices.
export function deviceId() {
  try {
    let id = localStorage.getItem("swish.device");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
      localStorage.setItem("swish.device", id);
    }
    return id;
  } catch { return "no-storage"; }
}

async function call(path, payload) {
  const res = await fetch(LICENSE_API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Redeem a key. Returns {ok:true, license} to store, or {ok:false, message}
// in plain English that the UI can show as-is.
export async function redeem(rawKey, deviceName = "") {
  const key = (rawKey || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!keyLooksValid(key)) {
    return { ok: false, message: "That does not look like a Swish key. It reads SW-XXXXXX-XXXX." };
  }
  if (!LICENSE_API) {                       // no server configured: old behaviour
    return { ok: true, license: { key, plan: keyLooksValid(key), token: "", exp: 0, offline: true } };
  }
  try {
    const { status, data } = await call("/redeem", { key, device: deviceId(), name: deviceName });
    if (status === 200 && data.ok) {
      return { ok: true, license: { key, plan: data.plan, token: data.token, exp: data.exp } };
    }
    return { ok: false, message: data.message || "That key did not go through. Write to " + SALES_EMAIL + " and we will sort it out." };
  } catch {
    return { ok: false, message: "I could not reach the license server. Get a signal for a moment and try again. You only need one." };
  }
}

// Quiet background refresh. Extends the offline window and picks up a
// revocation. Never throws, never blocks the UI, never logs anyone out just
// because the network was down.
export async function refresh(license) {
  if (!LICENSE_API || !license?.token) return null;
  try {
    const { status, data } = await call("/verify", { token: license.token });
    if (status === 200 && data.ok) return { ...license, plan: data.plan, token: data.token, exp: data.exp };
    if (status === 403) return { revoked: true };   // the one case worth acting on
    return null;
  } catch { return null; }
}

/* ---- what this install is entitled to, right now ---- */
export function entitlement(settings) {
  // A server-issued token is the only thing that unlocks a paid plan. The old
  // offline checksum stays a typo check; on its own anyone could forge a key.
  const lic = settings.license;
  if (lic && lic.plan && PLANS[lic.plan] && (lic.offline || (lic.exp || 0) > Date.now())) {
    return { plan: lic.plan, ...PLANS[lic.plan], licensed: true, trialDaysLeft: 0 };
  }

  const started = Date.parse(settings.installedAt || "") || Date.now();
  const used = Math.floor((Date.now() - started) / 86400000);
  const left = Math.max(0, TRIAL_DAYS - used);
  if (left > 0) return { plan: "trial", ...PLANS.pro, name: "Trial", price: "Free for now", licensed: false, trialDaysLeft: left };
  return { plan: "free", ...PLANS.free, licensed: false, trialDaysLeft: 0 };
}

export function buyHref(plan = "pro") {
  if (PLANS[plan]?.url) return PLANS[plan].url;
  if (CHECKOUT_URL) return CHECKOUT_URL + (CHECKOUT_URL.includes("?") ? "&" : "?") + "plan=" + plan;
  const subject = encodeURIComponent(`Swish ${PLANS[plan].name} plan`);
  const body = encodeURIComponent("How many players do you train a week?");
  return `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
}
