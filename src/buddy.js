// Best Buddy mechanics: cumulative affection hearts per buddy level, the daily
// heart cap, and this app's one-active-plan storage. Pokemon GO does not
// expose a trainer's buddy hearts to third-party apps, so the current heart
// count is manual entry — same honesty posture as Stardust/Candy in
// resource-inventory.js.
//
// Sources (cumulative-heart thresholds and the CP-boost framing agree across
// all three; used together because no single one states every number):
// - Bulbapedia, "Buddy Pokémon" — heart thresholds, per-activity heart caps,
//   Best Buddy CP-boost wording, one-buddy-at-a-time + up to 20 swaps/day.
// - Dexerto, "How to get Best Buddy status fast in Pokemon Go" — thresholds,
//   standard/excited daily caps (10/20), per-activity heart breakdown.
// - Switchblade Gaming, "Pokemon GO Buddy Guide" — thresholds, CP-boost
//   framing ("+1 power-up level, equivalent to two power-ups"), confirms
//   swapping buddies doesn't reset hearts (it pauses the daily streak).
const BUDDY_PLAN_STORAGE_KEY = "pogo-buddy-plan";

// Cumulative hearts needed to REACH each level, not hearts needed within it.
export const BUDDY_LEVEL_THRESHOLDS = Object.freeze({
  good: 1,
  great: 70,
  ultra: 150,
  best: 300,
});
export const BUDDY_LEVEL_ORDER = Object.freeze(["buddy", "good", "great", "ultra", "best"]);
export const BUDDY_LEVEL_NAMES = Object.freeze({
  buddy: "Buddy",
  good: "Good Buddy",
  great: "Great Buddy",
  ultra: "Ultra Buddy",
  best: "Best Buddy",
});

const MIN_HEARTS = 0;
const MAX_HEARTS = BUDDY_LEVEL_THRESHOLDS.best;

// Daily heart caps: documented TOTALS across every heart-earning activity
// combined (walking, treats, play, battle, snapshot, new PokéStop) — not a
// per-activity limit. EXCITED is the buddy's "Excited" mood bonus.
export const DAILY_HEART_CAP = 10;
export const DAILY_HEART_CAP_EXCITED = 20;

export function validBuddyHearts(value) {
  return Number.isInteger(value) && value >= MIN_HEARTS && value <= MAX_HEARTS ? value : null;
}

// Buddy-level label for a cumulative heart count.
export function buddyLevelForHearts(hearts) {
  let level = "buddy";
  for (const key of BUDDY_LEVEL_ORDER) {
    if (key !== "buddy" && hearts >= BUDDY_LEVEL_THRESHOLDS[key]) level = key;
  }
  return level;
}

export function heartsToBest(hearts) {
  return Math.max(0, BUDDY_LEVEL_THRESHOLDS.best - hearts);
}

// Whole days at the given daily cap — defaults to the standard, non-excited
// cap, the honest floor. An Excited buddy (or a Poffin) can beat this.
export function daysToBest(hearts, dailyCap = DAILY_HEART_CAP) {
  const remaining = heartsToBest(hearts);
  return remaining === 0 ? 0 : Math.ceil(remaining / dailyCap);
}

function emptyBuddyPlan() {
  return { formId: null, instanceId: null, hearts: null };
}

// Tracks exactly one active plan: loading/saving always reads or replaces
// this single stored record, never a list.
export function loadBuddyPlan(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(BUDDY_PLAN_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || typeof parsed.formId !== "string" || !parsed.formId) {
      return emptyBuddyPlan();
    }
    return {
      formId: parsed.formId,
      instanceId: typeof parsed.instanceId === "string" && parsed.instanceId ? parsed.instanceId : null,
      hearts: validBuddyHearts(parsed.hearts),
    };
  } catch {
    return emptyBuddyPlan();
  }
}

export function saveBuddyPlan(storage, plan) {
  if (typeof plan?.formId !== "string" || !plan.formId) {
    throw new TypeError("A buddy plan needs an owned Pokémon form to target.");
  }
  const safe = {
    formId: plan.formId,
    instanceId: typeof plan.instanceId === "string" && plan.instanceId ? plan.instanceId : null,
    hearts: validBuddyHearts(plan.hearts),
  };
  try {
    storage?.setItem?.(BUDDY_PLAN_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Storage can legitimately be unavailable — the plan still applies for
    // this session, it just won't persist to the next visit.
  }
  return safe;
}

export function clearBuddyPlan(storage) {
  try {
    storage?.removeItem?.(BUDDY_PLAN_STORAGE_KEY);
  } catch {
    // See saveBuddyPlan.
  }
  return emptyBuddyPlan();
}
