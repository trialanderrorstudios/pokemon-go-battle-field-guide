// Deterministic 1v1 PvP (Trainer Battle) simulator for the player's own
// roster. Distinct from battle-sim.js, which is a closed-form PvE raid DPS
// model — this one is a turn-by-turn (0.5s "turns") loop, because PvP has no
// cycle-average shortcut: energy, shields, and CMP are all discrete, order-
// dependent events.
//
// Stats come from this app's own CP-multiplier curve (instances.js) and base
// stats (encyclopedia.json forms); move numbers come from
// methodology.pvpMoveCatalog, which src/pogo_encyclopedia/pvp_moves.py
// already built from the pinned pvpoke-moves.json gamemaster dump (see
// pvp-moves.js's header) — reused here rather than re-parsing the raw file
// a third time. Callers (tests, views) pass that catalog in; this module
// never fetches or imports data itself.
//
// PvP damage formula: floor(0.5 * power * (atk/def) * stab * effectiveness *
// 1.3) + 1. The 0.5/stab/effectiveness/+1 shape matches this repo's own PvE
// formula (battle-sim.js rawDamage); the trailing 1.3 is PvP's own damage
// bonus multiplier, confirmed against PvPoke's public damage calculator
// (pvpoke.com) but not present anywhere in this repo's data — treat it as an
// external assumption, not a repo-sourced fact.
//
// Shadow stat modifiers (atk x1.2, def x1/1.2) are Niantic's standard GO
// Battle League Shadow bonus/penalty, same external-knowledge caveat as the
// 1.3 constant above — this repo's own data has no shadow multiplier field.
// Defense is the exact reciprocal of the attack boost (1/1.2 = 5/6), not the
// commonly-quoted rounded 0.833.
//
// Timing: a FAST move's damage and energy gain apply when its cooldown
// COMPLETES, not when it's thrown — matching PvPoke's own battle engine
// (and the real game: tapping a fast move starts an animation, the hit
// lands at the end of it). A side that picks a fast move this tick gets no
// immediate effect; it's queued (`pendingFast`) and resolved on the tick
// its cooldown reaches 0. A CHARGED move still resolves at the moment it's
// thrown (energy spend, shields, CMP, damage) — PvPoke doesn't delay those.
// Any two actions that land on the exact same tick (two fast completions,
// or two charged throws tied on Attack for CMP) are computed from one
// shared pre-tick snapshot and applied together, so which side is passed
// as "a" vs "b" never changes the outcome — simulatePvp(a, b) and
// simulatePvp(b, a) are mirror images of each other. On a NON-tied
// sequential pair (one side has clear CMP priority), applyAction also
// checks that the attacker itself is still alive before it swings — a
// side KO'd by the faster side's hit this same tick doesn't get to throw
// back, which is the entire reason CMP priority matters for a lethal hit.
//
// Buff/debuff stat stages: moveCatalog entries carry `buffs: [atkDelta,
// defDelta]`, `buffTarget` ("self"/"opponent") and a `buffApplyChance` the
// real game rolls for independently each throw. This sim is deterministic
// and has no RNG, so it only models the moves whose chance is exactly 1
// (Superpower, Drum Beating, Icy Wind, etc. — genuinely always-on effects
// in the real game, not an assumption). A fractional chance (0.1-0.5, e.g.
// Moonblast, Night Slash) is left unmodeled rather than guessed at
// "always procs" — measured (see scripts/pvp-sim-agreement.mjs) to make
// agreement with PvPoke's own rating slightly *worse*, not better, which
// means PvPoke's own matchup math isn't just assuming chance=1 either, so
// doing the same here would be tuning to a wrong model, not a fix. Stages
// are capped at +/-4 and use Niantic's published stage-multiplier formula
// (stage>=0 ? (4+stage)/4 : 4/(4-stage) — e.g. -1 -> 0.8, +1 -> 1.25), same
// table GO Battle League's own buff tooltips use.
import { cpMultiplier } from "./instances.js";
import { effectivenessOf } from "./type-chart.js";

const PVP_DAMAGE_BONUS = 1.3;
const STAB = 1.2;
const SHADOW_ATK = 1.2;
const SHADOW_DEF = 1 / SHADOW_ATK;
const ENERGY_CAP = 100;
const MAX_STAGE = 4;

// Single source of truth for both the cup view's honesty note (cup.js) and
// the broad-agreement regression floor (tests/web/pvp-sim.test.mjs), so the
// two can't drift apart. Measured by scripts/pvp-sim-agreement.mjs: every
// pvp.great keyMatchup/keyCounter pair where BOTH sides have a published
// rankOne build, each played at that build, 1-1 shields, no shield baiting.
// Update this when a real mechanic fix moves the number; never hand-tune
// the simulator to chase a number written here.
export const MEASURED_AGREEMENT_PCT = 72.9;
export const AGREEMENT_FLOOR_PCT = MEASURED_AGREEMENT_PCT - 2;
// Safety bound, not a game rule: a fight where both sides always attack as
// soon as they're able resolves in well under this many 0.5s ticks (100s).
// Only a degenerate all-zero-energy-gain input could stall this long.
const MAX_TURNS = 200;

function stageMultiplier(stage) {
  return stage >= 0 ? (4 + stage) / 4 : 4 / (4 - stage);
}

function clampStage(stage) {
  return Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stage));
}

function typesOf(form) {
  return [form?.primary_type, form?.secondary_type].filter(Boolean);
}

function battleStats(form, ivs, level) {
  const cpm = cpMultiplier(level);
  const shadowAtk = form?.shadow ? SHADOW_ATK : 1;
  const shadowDef = form?.shadow ? SHADOW_DEF : 1;
  return {
    attack: (form.base_attack + ivs.atk) * cpm * shadowAtk,
    defense: (form.base_defense + ivs.def) * cpm * shadowDef,
    hp: Math.max(1, Math.floor((form.base_stamina + ivs.sta) * cpm)),
    types: typesOf(form),
  };
}

function resolveMove(moveId, moveCatalog) {
  const move = moveCatalog?.[moveId];
  if (!move) throw new Error(`pvp-sim: no move data for "${moveId}" in moveCatalog`);
  return { id: moveId, ...move };
}

// Cheapest-first: makeSide sorts chargedMoves by energy cost so "the
// cheapest charged move that's ready" is always .find()'s first match.
function makeSide(spec, moveCatalog) {
  const stats = battleStats(spec.form, spec.ivs, spec.level);
  const fast = resolveMove(spec.fastMove, moveCatalog);
  const charged = (spec.chargedMoves ?? [])
    .map((id) => resolveMove(id, moveCatalog))
    .sort((left, right) => left.energy - right.energy);
  return {
    stats, fast, charged, energy: 0, cooldown: 0, hp: stats.hp, shields: 0,
    atkStage: 0, defStage: 0, pendingFast: null,
  };
}

function effectiveAttack(side) {
  return side.stats.attack * stageMultiplier(side.atkStage);
}

function effectiveDefense(side) {
  return side.stats.defense * stageMultiplier(side.defStage);
}

function pvpDamage(attackerAttack, defenderDefense, attackerTypes, defenderTypes, move) {
  const stab = attackerTypes.includes(move.type) ? STAB : 1;
  const eff = effectivenessOf(move.type, defenderTypes);
  return Math.floor(0.5 * move.power * (attackerAttack / defenderDefense) * stab * eff * PVP_DAMAGE_BONUS) + 1;
}

// Applies a thrown move's own stat-stage change (if any) to whichever side
// it targets. Runs after damage is computed so a self-debuff (e.g.
// Superpower) never retroactively weakens the hit that caused it — only
// the attacker's own FUTURE moves see the drop, matching the game's order.
function applyBuff(move, attackerSide, defenderSide) {
  if (!move.buffs || move.buffApplyChance !== 1) return;
  const [atkDelta, defDelta] = move.buffs;
  const target = move.buffTarget === "self" ? attackerSide : defenderSide;
  target.atkStage = clampStage(target.atkStage + atkDelta);
  target.defStage = clampStage(target.defStage + defDelta);
}

// Picks the next action: the cheapest ready charged move (spent/cooldown
// immediately, same as a real throw), or the side's fast move — which, per
// the header note, only gets QUEUED here (`pendingFast`); its damage and
// energy gain are applied later, when its cooldown completes.
function chooseAction(side) {
  const ready = side.charged.find((move) => side.energy >= move.energy);
  if (ready) {
    side.energy -= ready.energy;
    side.cooldown = ready.turns;
    return { kind: "charged", move: ready };
  }
  side.pendingFast = side.fast;
  side.cooldown = side.fast.turns;
  return { kind: "fast", move: side.fast };
}

// Pure damage/shield computation for one action against the opponent's
// CURRENT state, with no mutation — lets two same-tick actions (a CMP tie,
// or two fast moves completing together) both read the same pre-resolution
// snapshot before either is applied.
function computeHit(attackerSide, defenderSide, action) {
  if (action.kind === "charged" && defenderSide.shields > 0) {
    return { damage: 1, shielded: true, shieldConsumed: true };
  }
  const damage = pvpDamage(
    effectiveAttack(attackerSide), effectiveDefense(defenderSide),
    attackerSide.stats.types, defenderSide.stats.types, action.move,
  );
  return { damage, shielded: false, shieldConsumed: false };
}

// Mutates both sides for one already-computed hit: shield consumption,
// defender HP, the attacker's own energy gain (0 for every charged move in
// this catalog, real for a completing fast move), and any buff/debuff —
// applied even on a shielded hit, since a shield blocks damage, not a
// move's secondary effect.
function applyEffects(attackerSide, defenderSide, action, hit, log, turn, label) {
  if (hit.shieldConsumed) defenderSide.shields -= 1;
  defenderSide.hp = Math.max(0, defenderSide.hp - hit.damage);
  attackerSide.energy = Math.min(ENERGY_CAP, attackerSide.energy + (action.move.energyGain ?? 0));
  applyBuff(action.move, attackerSide, defenderSide);
  log?.push({ turn, by: label, move: action.move.id, kind: action.kind, damage: hit.damage, shielded: hit.shielded });
}

// Sequential single action: no-ops if the ATTACKER was already KO'd by the
// other side's action earlier this same tick (a fainted Pokémon doesn't
// get to throw back — this is what makes CMP priority matter for a lethal
// hit), or if the defender is already down (nothing left to damage).
function applyAction(attackerSide, defenderSide, action, log, turn, label) {
  if (attackerSide.hp <= 0 || defenderSide.hp <= 0) return;
  applyEffects(attackerSide, defenderSide, action, computeHit(attackerSide, defenderSide, action), log, turn, label);
}

// Two actions landing on the exact same tick (CMP tie, or two fast moves
// completing together): both hits are computed from the pre-tick state
// before either is applied, so order never depends on which side is "a".
function applySimultaneous(sideX, labelX, actionX, sideY, labelY, actionY, log, turn) {
  const hitX = sideY.hp > 0 ? computeHit(sideX, sideY, actionX) : null;
  const hitY = sideX.hp > 0 ? computeHit(sideY, sideX, actionY) : null;
  if (hitX) applyEffects(sideX, sideY, actionX, hitX, log, turn, labelX);
  if (hitY) applyEffects(sideY, sideX, actionY, hitY, log, turn, labelY);
}

// a/b: { form, ivs: {atk, def, sta}, level, fastMove, chargedMoves }, where
// form/ivs/level match instances.js's calculateCp signature and fastMove /
// chargedMoves are gamemaster move IDs (e.g. "DOUBLE_IRON_BASH").
// options.moveCatalog: methodology.pvpMoveCatalog (or an equivalent map of
// moveId -> {power, energy, energyGain, turns, type}) — not optional in
// practice, just defaulted so a missing catalog fails loudly per-move
// instead of silently. options.shields: [a's shield count, b's].
export function simulatePvp(a, b, { shields = [0, 0], moveCatalog = {} } = {}) {
  const sideA = makeSide(a, moveCatalog);
  const sideB = makeSide(b, moveCatalog);
  sideA.shields = shields[0] ?? 0;
  sideB.shields = shields[1] ?? 0;
  const log = [];
  let turn = 0;

  while (turn < MAX_TURNS && sideA.hp > 0 && sideB.hp > 0) {
    turn += 1;
    if (sideA.cooldown > 0) sideA.cooldown -= 1;
    if (sideB.cooldown > 0) sideB.cooldown -= 1;

    // Phase 1: resolve any fast move whose cooldown just reached 0.
    const aFast = sideA.cooldown === 0 ? sideA.pendingFast : null;
    const bFast = sideB.cooldown === 0 ? sideB.pendingFast : null;
    if (aFast) sideA.pendingFast = null;
    if (bFast) sideB.pendingFast = null;
    if (aFast && bFast) {
      applySimultaneous(sideA, "a", { kind: "fast", move: aFast }, sideB, "b", { kind: "fast", move: bFast }, log, turn);
    } else if (aFast) {
      applyAction(sideA, sideB, { kind: "fast", move: aFast }, log, turn, "a");
    } else if (bFast) {
      applyAction(sideB, sideA, { kind: "fast", move: bFast }, log, turn, "b");
    }
    if (sideA.hp <= 0 || sideB.hp <= 0) break;

    // Phase 2: whichever side(s) are now free choose their next action. A
    // freshly-chosen fast move only gets queued (see chooseAction) — it has
    // nothing to apply this tick. A freshly-thrown charged move resolves
    // now; two charged throws tied on effective Attack resolve as
    // simultaneous (CMP), not by argument order.
    const aReady = sideA.cooldown === 0;
    const bReady = sideB.cooldown === 0;
    if (!aReady && !bReady) continue;
    const aAction = aReady ? chooseAction(sideA) : null;
    const bAction = bReady ? chooseAction(sideB) : null;
    const aCharged = aAction?.kind === "charged" ? aAction : null;
    const bCharged = bAction?.kind === "charged" ? bAction : null;
    if (aCharged && bCharged) {
      const aAttack = effectiveAttack(sideA);
      const bAttack = effectiveAttack(sideB);
      if (aAttack === bAttack) {
        applySimultaneous(sideA, "a", aCharged, sideB, "b", bCharged, log, turn);
      } else if (aAttack > bAttack) {
        applyAction(sideA, sideB, aCharged, log, turn, "a");
        applyAction(sideB, sideA, bCharged, log, turn, "b");
      } else {
        applyAction(sideB, sideA, bCharged, log, turn, "b");
        applyAction(sideA, sideB, aCharged, log, turn, "a");
      }
    } else if (aCharged) {
      applyAction(sideA, sideB, aCharged, log, turn, "a");
    } else if (bCharged) {
      applyAction(sideB, sideA, bCharged, log, turn, "b");
    }
  }

  // A fast move already thrown (still mid-cooldown, tracked via
  // pendingFast — see the Timing note above) when its own user is struck
  // down still lands: the attack was already committed before the KO,
  // same as the real game showing an already-launched fast move connect
  // after its user has been defeated. Only on an actual KO, not a
  // MAX_TURNS timeout (both sides can be mid-fast-move there with neither
  // having fainted — that's not this case). This can only move hpLeft/
  // battleRating (the thrower is defeated either way); both sides'
  // lingering fast moves are computed from one shared post-loop snapshot
  // and applied together, same discipline as the mid-fight simultaneous
  // cases, so simulatePvp(a, b) and simulatePvp(b, a) still mirror.
  if (sideA.hp <= 0 || sideB.hp <= 0) {
    const aLingering = sideA.pendingFast;
    const bLingering = sideB.pendingFast;
    sideA.pendingFast = null;
    sideB.pendingFast = null;
    if (aLingering && bLingering) {
      applySimultaneous(sideA, "a", { kind: "fast", move: aLingering }, sideB, "b", { kind: "fast", move: bLingering }, log, turn);
    } else if (aLingering && sideB.hp > 0) {
      applyEffects(sideA, sideB, { kind: "fast", move: aLingering }, computeHit(sideA, sideB, { kind: "fast", move: aLingering }), log, turn, "a");
    } else if (bLingering && sideA.hp > 0) {
      applyEffects(sideB, sideA, { kind: "fast", move: bLingering }, computeHit(sideB, sideA, { kind: "fast", move: bLingering }), log, turn, "b");
    }
  }

  const aAlive = sideA.hp > 0;
  const bAlive = sideB.hp > 0;
  let winner;
  if (aAlive && !bAlive) winner = "a";
  else if (bAlive && !aAlive) winner = "b";
  else if (!aAlive && !bAlive) winner = "tie";
  else {
    // Turn cap hit with both still standing (shouldn't happen with always-
    // attacking sides outside degenerate inputs): higher remaining HP%
    // wins, matching GO Battle League's own match-timer tie-break.
    const aPct = sideA.hp / sideA.stats.hp;
    const bPct = sideB.hp / sideB.stats.hp;
    winner = aPct === bPct ? "tie" : aPct > bPct ? "a" : "b";
  }

  // 500 = even; a's share of the combined "damage dealt vs taken" outcome,
  // scaled 0-1000. This app's own rating, not a reimplementation of
  // PvPoke's battle-rating formula (that one isn't published in this repo
  // either) — label it as an approximation, same honesty rule as the PvP
  // damage-bonus constant above.
  const aPct = sideA.hp / sideA.stats.hp;
  const bPct = sideB.hp / sideB.stats.hp;
  const battleRating = Math.max(0, Math.min(1000, Math.round(500 + 500 * (aPct - bPct))));

  return { winner, battleRating, hpLeft: [sideA.hp, sideB.hp], turns: turn, log };
}
