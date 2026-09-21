// billing.js — how a trainer actually buys Swish.
//
// There is no server, so there is no account and no card handling in this app.
// The purchase happens on a hosted checkout page; the buyer gets a license key
// by email; the key unlocks the roster offline. That is the whole mechanism,
// and it is the only honest one without a backend.
//
// TO GO LIVE, EDIT THE THREE CONSTANTS BELOW. Nothing else needs to change.

// Live Stripe Payment Links, created 2026-09-21 on acct_1TnjDo90Xq05dzfC.
export const CHECKOUT_URL = "";           // per-plan links live in PLANS below
export const BOOK_A_CALL   = "";          // 15-minute intro call link, set when Calendly is live
export const SALES_EMAIL  = "lawrence@vybrancelabs.co";

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

export function validateKey(raw) {
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

/* ---- what this install is entitled to, right now ---- */
export function entitlement(settings) {
  const plan = validateKey(settings.licenseKey) || null;
  if (plan) return { plan, ...PLANS[plan], licensed: true, trialDaysLeft: 0 };

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
