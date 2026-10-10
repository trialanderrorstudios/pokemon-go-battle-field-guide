// Deterministic 1v1 PvP (Trainer Battle) simulator for the player's own
// roster. Distinct from battle-sim.js, which is a closed-form PvE raid DPS
// model — this one is a turn-by-turn (0.5s "turns") loop, because PvP has no
// cycle-average shortcut: energy, shields, and CMP are all discrete, order-
// dependent events.
//
// The actual battle mechanics (damage formula, CMP/priority, shield
// defaults, and PvPoke's own energy-planning/baiting AI) live in
// pvpoke-engine.js — a direct port of PvPoke's own battle engine (see that
// file's header for the exact source files/commit and its "Known gaps"
// list). This module is just the public entry point callers already import
// (cup-team.js, team-coach.js, views/cup.js, views/pvp.js): it builds the
// {form, ivs, level, fastMove, chargedMoves} side specs those callers pass
// and forwards to the port, keeping the signature they already use.
import { simulateBattle } from "./pvpoke-engine.js";

// Single source of truth for both the cup view's honesty note (cup.js) and
// the broad-agreement regression floor (tests/web/pvp-sim.test.mjs), so the
// two can't drift apart. Measured by scripts/pvp-sim-agreement.mjs: every
// pvp.great keyMatchup/keyCounter pair where BOTH sides have a published
// build, each played at PvPoke's own defaultIVs.cp1500 build (not this
// repo's rankOne — see scripts/pvp-sim-agreement.mjs's header), 1-1
// shields. Truncated to 1 decimal, never rounded up (400/499 = 80.1603...%,
// not toFixed(1)'s 80.2) — scripts/pvp-sim-agreement.mjs's own console
// output uses the same truncate1() rule, so the two never disagree with
// each other. Update this when a real mechanic fix moves the number; never
// hand-tune the simulator to chase a number written here.
//
// Raised from 76.7% (the old hand-rolled engine) by porting PvPoke's own
// engine (pvpoke-engine.js) — see that file's "Known gaps" list for what's
// keeping it under the ≥95% target. Confirmed (by reading Ranker.js/
// RankerOverall.js directly, not just inferring from the published number):
// pvp.great/ultra/master's `rating` fields ARE a single fight — shields
// [1,1], energy [0,0], PvPoke's own defaultIVs, floor((health+damage)*500)
// — the same "leads" ranking scenario this harness already plays. So this
// harness's shields/energy/IV setup was already right; the remaining gap
// is engine fidelity (move-selection/shielding edge cases still undiscovered
// or deliberately left unported — see pvpoke-engine.js's "Known gaps"),
// not a scenario mismatch.
//
// Raised again, from 85.7% to 86.7%, after scripts/pvpoke-diff.mjs (a
// differential harness that runs PvPoke's own fetched Battle.js/Pokemon.js/
// ActionLogic.js in a Node vm and diffs it fight-by-fight against this
// port — not shipped, not vendored, see that script's header) found and
// fixed two engine-ordering bugs in pvpoke-engine.js's decideAction (see
// its "Known gaps" / "Already handled" notes). That harness also measured
// the REAL engine's own reproduction of these published ratings at 89.8%
// (448/499) at the time — this port's winner agreed with that real
// engine's own winner on 96.6% (482/499) of pairs, closer to the ≥98%
// target than the 86.7% published number suggested, because ~18 species'
// stored chargedMoves didn't match PvPoke's own leads-scenario-specific
// moveset (a canonical-data staleness problem, not an engine bug).
//
// Raised again, from 86.7% to 94.6%, by fixing that data gap: every
// pvp.<league> row now also carries `leadsMoves` (pvp.py's
// _leads_moveset), PvPoke's own leads-scenario moveset for that species —
// the build its Ranker actually used to compute the published matchups/
// counters rating, sourced from a new pvpoke-leads-<league> snapshot
// (scripts/sync-battle-sources.mjs). scripts/pvp-sim-agreement.mjs and the
// floor test below now play both sides at leadsMoves (falling back to
// fastMove/chargedMoves for the rare row with no leads entry) instead of
// the overall-scenario moveset. Re-measuring with the data gap closed:
// scripts/pvpoke-diff.mjs's real-engine reproduction of the published
// ratings rose from 89.8% (448/499) to 100% (500/500) — confirming the
// remaining ~5.4-point gap to the real engine (473/500, see
// pvpoke-engine.js's "Known gaps") is now genuinely engine fidelity
// (Cramorant's Gulp Missile, a residual Mimikyu post-Disguise boundary,
// and a handful of others), not a moveset or snapshot-date mismatch.
export const MEASURED_AGREEMENT_PCT = 94.6;
export const AGREEMENT_FLOOR_PCT = MEASURED_AGREEMENT_PCT - 2;

// a/b: { form, ivs: {atk, def, sta}, level, fastMove, chargedMoves }, where
// form/ivs/level match instances.js's calculateCp signature and fastMove /
// chargedMoves are gamemaster move IDs (e.g. "DOUBLE_IRON_BASH").
// options.moveCatalog: methodology.pvpMoveCatalog (or an equivalent map of
// moveId -> {power, energy, energyGain, turns, type}). options.shields:
// [a's shield count, b's].
export function simulatePvp(a, b, { shields = [0, 0], moveCatalog = {} } = {}) {
  return simulateBattle(a, b, { shields, moveCatalog });
}
