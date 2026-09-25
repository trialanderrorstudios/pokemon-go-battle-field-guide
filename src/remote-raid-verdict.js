// "Is this worth a Remote Raid Pass?" — the one raid question the lobby
// finders (Poke Genie's remote lobby queue, 9db.jp's invite board) can't
// answer for you. They find the lobby; this says whether to buy into it.
//
// No new math. It's two answers this app already computes, crossed:
//   is this boss worth paying for?  -> raid-target.js's bossDifficulty()
//                                      hard/easy split (Tier 5 / Mega /
//                                      legendary vs. everything else)
//   can you actually win it?        -> raid-target.js's beatability() band,
//                                      scored off the counters you own
//
// Why only those two: a Remote Raid Pass costs coins (SHOP_GUIDE.remotePasses
// — 195 single, 525 for three, 10/day) while a raid you can walk to costs a
// free daily pass. So the pass is worth it exactly when the boss is one you
// can't casually get locally AND your roster can carry its share. What's
// leaving soon (boss-countdown.js) and hundo CP (raidTargetTool) already have
// their own surfaces and are deliberately not duplicated here.
import { bossDifficulty } from "./raid-target.js";
import { SHOP_GUIDE } from "./shop-guide.js";

// Single source for the price — re-stating "195 coins" here would be a second
// copy to drift from the shop guide's confirmed-and-sourced line.
export const REMOTE_PASS_COST = SHOP_GUIDE.remotePasses.text;

// Keyed by beatability()'s own band names, so a change to that ladder shows up
// here as a missing key rather than a silently wrong verdict.
const HARD_BOSS_VERDICTS = {
  "solo-able": {
    band: "worth-it",
    headline: "Worth a pass — you can carry",
    detail: "Every counter you own is elite-ranked for this boss. You're the one holding a lobby together, not the one being carried.",
  },
  duoable: {
    band: "worth-it",
    headline: "Worth a pass — you can carry",
    detail: "Your counters are strong enough to pull real weight. Any lobby you join is better for having you in it.",
  },
  "bring-3-4": {
    band: "worth-it",
    headline: "Worth a pass — join a full lobby",
    detail: "Your counters contribute but won't carry. Queue into a busy lobby rather than a thin one.",
  },
  "full-lobby": {
    band: "risky",
    headline: "Risky — your counters are thin",
    detail: "You'd be relying on the rest of the lobby to win it. Fine if the queue is deep, a wasted pass if it isn't.",
  },
};

// {band, headline, detail, cost} for the remote-pass call on this boss, or
// null when there's nothing to judge (no boss, or beatability hasn't run).
// `band` is its own vocabulary — skip/worth-it/risky/unknown — deliberately
// NOT beatability's band, because "can you beat it" and "should you pay for
// it" are different questions and a shared name would invite reading one as
// the other.
export function remoteRaidVerdict({ formId, beatability, forms } = {}) {
  if (!formId || !beatability) return null;
  const { band, tierLabel } = beatability;

  // beatability() fails closed on a thin roster and so must this: without
  // enough identified counters there is no honest read on whether the pass
  // pays off, and guessing "worth it" spends the user's coins for them.
  if (band === "not-enough-data") {
    return {
      band: "unknown",
      headline: "Can't call it yet",
      detail: "Star or log more of the Pokémon you own and this becomes a real verdict.",
      cost: REMOTE_PASS_COST,
    };
  }

  // An easy boss never justifies a paid pass regardless of how good your
  // counters are — the free daily pass already covers it at any gym you can
  // reach, so a strong roster is an argument for walking, not for paying.
  if (bossDifficulty(formId, tierLabel, forms) === "easy") {
    return {
      band: "skip",
      headline: "Skip the remote pass",
      detail: `${tierLabel} — your free daily pass covers this at any gym you can reach. Save the coins for a Tier 5 or Mega.`,
      cost: REMOTE_PASS_COST,
    };
  }

  const verdict = HARD_BOSS_VERDICTS[band];
  if (!verdict) return null;
  return { ...verdict, cost: REMOTE_PASS_COST };
}
