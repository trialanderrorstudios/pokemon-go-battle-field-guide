// Lucky Trade Advisor — "worth saving this one for a lucky trade?"
//
// Composes round-11's guaranteed-lucky trade tip (see tricks.js's
// "trade-guaranteed-lucky") with a Pokemon's current IVs: a lucky result
// guarantees a 12/12/12 IV floor, so a copy with a genuinely bad worst stat
// has real room to gain; a copy that's already at or above 12 on its worst
// stat can only match or lose ground, since trading always re-rolls IVs from
// scratch regardless of lucky status.
//
// Sources (retrieved 2026-07):
// - 12/12/12 guaranteed IV floor on Lucky Pokemon: well-established mechanic,
//   cross-checked across imobie.com's "Pokemon GO Lucky Pokemon" guide,
//   doctorpokegogo.com's "Lucky Pokemon Guide", and the Pokemon GO Fandom
//   wiki's "Lucky Pokemon" page.
// - ANY trade re-rolls the receiving copy's IVs from a friendship-tier floor
//   (Good 1/1/1, Great 2/2/2, Ultra 3/3/3, Best Friend 5/5/5) rather than
//   keeping the original stats; Lucky overrides that floor to 12/12/12
//   regardless of friendship level (hundo-hunter.com's trade-reroll
//   reference). A Lucky trade is a fresh roll with a better floor, not a
//   guaranteed improvement to your exact current IVs.
// - Guaranteed-lucky eligibility (catch year 2020-or-earlier, 45-trade
//   lifetime cap) reuses tricks.js's "trade-guaranteed-lucky" tip verbatim —
//   not re-sourced here. A non-eligible old catch still gets a better-than-
//   baseline chance at a random Lucky result; the exact odds curve by age
//   aren't published by Niantic, so this only says "improves with age," not a
//   number.
// - A "15 guaranteed-lucky trades per day" figure surfaced only on
//   low-authority SEO guides, contradicted itself across searches (some
//   said no daily cap exists at all), and isn't mentioned in LeekDuck's
//   official New Year's 2026 event recap (lifetime 45-cap only). Left out
//   deliberately rather than shipped unsourced — see catch-chance-spike.md's
//   sibling honesty call.

export const GUARANTEED_LUCKY_CUTOFF_YEAR = 2020;
export const LUCKY_IV_FLOOR = 12;

function worstIv(ivs) {
  return Math.min(ivs.atk, ivs.def, ivs.sta);
}

// ivs: { atk, def, sta } (0-15 each, required). caughtYear: optional 4-digit
// year the copy was actually caught (not when it was added to this app) —
// only used to check guaranteed-lucky eligibility, never persisted by the
// caller. isLucky: already-Lucky copies have nothing left to gain.
export function luckyTradeAdvice({ ivs, caughtYear, isLucky = false } = {}) {
  const values = ivs ? [ivs.atk, ivs.def, ivs.sta] : [];
  if (values.length !== 3 || values.some((v) => !Number.isInteger(v) || v < 0 || v > 15)) {
    return { status: "invalid", message: "Enter this copy's IVs (0-15 each) to get lucky-trade advice." };
  }
  if (isLucky) {
    return {
      status: "already-lucky",
      message: "Already Lucky — its IV floor is already 12/12/12, so there's nothing left to gain by trading it again.",
    };
  }

  const worst = worstIv(ivs);
  const eligible = Number.isInteger(caughtYear) && caughtYear <= GUARANTEED_LUCKY_CUTOFF_YEAR;
  const eligibilityNote = !Number.isInteger(caughtYear)
    ? "Enter a catch year to see if this copy qualifies for a guaranteed Lucky trade."
    : eligible
      ? `Caught ${caughtYear} qualifies for a guaranteed Lucky trade (2020-or-earlier rule, capped at 45 lifetime per account).`
      : `Caught ${caughtYear} doesn't meet the guaranteed-Lucky cutoff (needs 2020 or earlier) — a Lucky result here is chance-only, and that chance improves the longer you've held it.`;

  if (worst >= LUCKY_IV_FLOOR) {
    return {
      status: "risky",
      worstIv: worst,
      floorGain: 0,
      eligible,
      message: `Its worst IV is already ${worst}/15 — at or above the Lucky floor. Trading re-rolls IVs from scratch, so a Lucky result could only match or lower this stat, never raise it. ${eligibilityNote}`,
    };
  }
  return {
    status: "benefits",
    worstIv: worst,
    floorGain: LUCKY_IV_FLOOR - worst,
    eligible,
    message: `Its worst IV is only ${worst}/15 — a Lucky trade guarantees every stat rolls at least 12/15, so the worst case for this stat would rise by ${LUCKY_IV_FLOOR - worst}. ${eligibilityNote}`,
  };
}
