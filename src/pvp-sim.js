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
export const MEASURED_AGREEMENT_PCT = 85.7;
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
