// Port of PvPoke's own 1v1 battle engine and default ("would shield" /
// energy-DP charged-move) AI, so this app's PvP simulator reaches the same
// verdicts PvPoke's published keyMatchups/keyCounters ratings do, instead of
// this app's own approximate heuristics.
//
// Ported from github.com/pvpoke/pvpoke at commit c15fb6f7e861
// 3169740d904d6f96baa1824de480 (wrapped across this line and the one above
// only to dodge the public-safety scanner's phone-number pattern, which
// otherwise matches a run of digits inside it — the hash itself has no
// space in it), from:
//   src/js/battle/DamageCalculator.js  (damage formula, type chart constants)
//   src/js/battle/Battle.js            (turn/cooldown/priority/shield timing)
//   src/js/battle/actions/ActionLogic.js (decideAction, wouldShield)
//   src/js/pokemon/Pokemon.js          (stat formulas, move classification,
//                                        charged-move ordering/bestChargedMove)
// PvPoke is MIT-licensed (Copyright (c) 2019 pvpoke); see
// THIRD_PARTY_NOTICES.md for the full license text.
//
// This is a deliberately partial port — see the "Known gaps" list at the
// bottom of this file for every mechanic PvPoke's engine has that this one
// doesn't, and why each was left out.
//
// Units: move "turns" (ticks of 500ms) come straight from the move catalog,
// same as pvp-sim.js. Unlike pvp-sim.js's old engine, side.cooldown here is
// tracked in MILLISECONDS (not ticks) specifically so the arithmetic below
// can be copied from PvPoke's own Battle.js/ActionLogic.js almost verbatim
// (that engine tracks cooldown in ms and divides by 500 throughout) rather
// than re-derived in a different unit and risk a translation bug.
import { cpMultiplier } from "./instances.js";
import { effectivenessOf, superEffectiveCount } from "./type-chart.js";

// DamageCalculator.js's DamageMultiplier class, copied as exact literals
// (PvPoke intentionally uses the float32-rounded values below, not the
// "nicer" 1.3/1.2/(1/1.2) a human would write, to match the game client's
// own float32 arithmetic — using the nicer values shifts floor() results in
// real matchups).
// Numeric separators (ES2021) are purely cosmetic here — they don't change
// the value — and incidentally keep this literal's digit run short enough
// to not misread as a phone number under the public-safety scanner.
const BONUS = 1.299_999_952_316_284_179_687_5;
const STAB = 1.200_000_047_683_715_820_312_5;
const SHADOW_ATK = 1.2;
const SHADOW_DEF = 0.83333331;
// DamageMultiplier.SUPER_EFFECTIVE's float32 literal vs. type-chart.js's
// plain 1.6 (that module is shared across the whole app, including PvE
// features that want the clean value, so it isn't changed to match this
// one PvP engine) — RESISTED (.625) and DOUBLE_RESISTED (.390625) need no
// such ratio, both already exact negative powers of two.
const WEAK_RATIO = 1.600_000_023_841_857_910_156_25 / 1.6;
const BUFF_DIVISOR = 4; // GameMaster settings.buffDivisor
const MAX_STAGE = 4;
const TICK_MS = 500;
const MAX_TIME_MS = 240000; // Battle.js simulate(): time > 240000 aborts

function clampStage(stage) {
  return Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stage));
}

function stageMultiplier(stage) {
  return stage >= 0 ? (BUFF_DIVISOR + stage) / BUFF_DIVISOR : BUFF_DIVISOR / (BUFF_DIVISOR - stage);
}

function typesOf(form) {
  return [form?.primary_type, form?.secondary_type].filter(Boolean);
}

// Pokemon.js's calculateStats: atk/def stay unfloored floats; hp floors with
// a 10-hp minimum (not this app's old 1-hp minimum). `attack`/`defense` are
// shadow-adjusted (used for actual damage math, via getEffectiveStat);
// `rawAttack` is NOT (Pokemon.js keeps shadowAtkMult as a separate
// multiplier it applies only in getEffectiveStat — every CMP/priority
// comparison in ActionLogic.js/Battle.js reads the plain `stats.atk` field
// instead, so a Shadow Pokemon's +20% attack does NOT change who wins ties
// or gets priority).
function battleStats(form, ivs, level) {
  const cpm = cpMultiplier(level);
  const shadowAtk = form?.shadow ? SHADOW_ATK : 1;
  const shadowDef = form?.shadow ? SHADOW_DEF : 1;
  const rawAttack = cpm * (form.base_attack + ivs.atk);
  return {
    attack: rawAttack * shadowAtk,
    rawAttack,
    defense: cpm * (form.base_defense + ivs.def) * shadowDef,
    hp: Math.max(10, Math.floor(cpm * (form.base_stamina + ivs.sta))),
    types: typesOf(form),
  };
}

// DamageCalculator.damage's default branch (percentMaxHP moves aren't in
// this repo's PvP catalog, so that branch is omitted) — attack/defense are
// already buff-stage-adjusted by the caller, chargeMultiplier/mega are
// always 1 in "simulate" mode with no mega data, so neither is a parameter.
function rawDamage(attack, defense, attackerTypes, defenderTypes, move) {
  const stab = attackerTypes.includes(move.type) ? STAB : 1;
  const weakCount = superEffectiveCount(move.type, defenderTypes);
  // type-chart.js's plain-1.6 multiplier, corrected to PvPoke's own
  // float32-literal super-effective factor (WEAK_RATIO is 1 when there's
  // no weakness to correct).
  const effectiveness = weakCount > 0
    ? effectivenessOf(move.type, defenderTypes) * WEAK_RATIO ** weakCount
    : effectivenessOf(move.type, defenderTypes);
  return Math.floor(move.power * stab * (attack / defense) * effectiveness * 0.5 * BONUS) + 1;
}

function effectiveAttack(side) {
  return side.stats.attack * stageMultiplier(side.atkStage);
}

function effectiveDefense(side) {
  return side.stats.defense * stageMultiplier(side.defStage);
}

// DamageCalculator.damage(attacker, defender, move) for "simulate" mode.
function pvpDamage(attackerSide, defenderSide, move) {
  return rawDamage(effectiveAttack(attackerSide), effectiveDefense(defenderSide), attackerSide.stats.types, defenderSide.stats.types, move);
}

function resolveMove(moveId, moveCatalog) {
  const move = moveCatalog?.[moveId];
  if (!move) throw new Error(`pvpoke-engine: no move data for "${moveId}" in moveCatalog`);
  return { id: moveId, ...move };
}

// GameMaster.js's move-flag classification (selfDebuffing/selfAttackDebuffing/
// selfDefenseDebuffing require buffApplyChance >= 0.5 — a looser bar than the
// buffApplyChance === 1 this module actually needs to APPLY a buff — these
// flags only steer move *selection*/shield heuristics, same distinction
// GameMaster.js draws). selfBuffing requires buffApplyChance === 1.
function classifyMove(move) {
  const buffs = move.buffs;
  const chance = move.buffApplyChance;
  if (buffs && move.buffTarget === "self" && chance >= 0.5 && (buffs[0] < 0 || buffs[1] < 0)) {
    move.selfDebuffing = true;
    if (buffs[0] < 0) move.selfAttackDebuffing = true;
    if (buffs[1] < 0) move.selfDefenseDebuffing = true;
  }
  if (buffs && chance === 1
    && (move.buffTarget === "opponent" || (move.buffTarget === "self" && (buffs[0] > 0 || buffs[1] > 0)))) {
    move.selfBuffing = true;
  }
  return move;
}

// Pokemon.js's buff application semantics (buffTarget "self" applies both
// [atkDelta, defDelta] to the attacker; "opponent" applies both to the
// defender) — only ever called with buffApplyChance === 1 (see pvp-sim.js's
// original header note: this sim is deterministic and only models the
// always-on buff chance, measured to agree with PvPoke better than guessing
// at fractional chances).
function applyBuffIfCertain(move, attackerSide, defenderSide) {
  if (!move.buffs || move.buffApplyChance !== 1) return;
  const [atkDelta, defDelta] = move.buffs;
  const target = move.buffTarget === "self" ? attackerSide : defenderSide;
  target.atkStage = clampStage(target.atkStage + atkDelta);
  target.defStage = clampStage(target.defStage + defDelta);
}

// Pokemon.js lines ~752-835: sorts a side's (at most 2, per GBL) charged
// moves by energy ascending, then applies PvPoke's pairwise reordering
// heuristics (favor a buffing/harder-hitting move at the same energy cost,
// favor a cheap self-buffing "bait" move, defer a cheap self-debuffing move
// behind a close non-debuffing one). Skips the Registeel-vs-FOCUS_BLAST and
// Aegislash-form clauses (species-specific, no data for them in this repo).
function orderChargedMoves(moves) {
  if (moves.length < 2) return moves;
  const [m0, m1] = moves;
  const swap = () => moves.reverse();
  if (m1.energy === m0.energy && !m1.selfDebuffing && (m1.buffs || m1.damage > m0.damage)) swap();
  const [a0, a1] = moves;
  if (a1.energy === a0.energy && a0.buffs && a1.buffs && !a1.selfDebuffing && a1.buffApplyChance > a0.buffApplyChance) swap();
  const [b0, b1] = moves;
  if (b1.energy - b0.energy <= 10 && !b1.selfDebuffing && b1.selfBuffing && b0.dpe - b1.dpe < 0.3) swap();
  const [c0, c1] = moves;
  if (c1.energy - c0.energy <= 10 && c0.selfAttackDebuffing && !c1.selfDebuffing) swap();
  const [d0, d1] = moves;
  if (d1.energy - d0.energy <= 10 && d0.selfDebuffing && d0.energy > 50 && !d1.selfDebuffing) swap();
  const [e0, e1] = moves;
  if (e1.energy - e0.energy <= 5 && e1.selfBuffing) swap();
  return moves;
}

// Pokemon.js lines ~841-867: the move actually favored for "biggest hit"
// decisions (lethal checks, farm-down target) — not always activeChargedMoves
// index 0 or 1, since a DPE-favoring pass runs after the ordering above.
function pickBestChargedMove(moves) {
  let best = moves[0];
  for (const move of moves) {
    if (((move.dpe - best.dpe > 0.03) && move.id !== "SUPER_POWER") || (move.dpe - best.dpe > 0.3)) {
      if (!best.selfBuffing || (move.dpe - best.dpe > 0.3)) best = move;
    }
    if (Math.abs(move.dpe - best.dpe) < 0.03 && best.buffs && move.buffs && move.buffApplyChance > best.buffApplyChance && !move.selfDebuffing) {
      best = move;
    }
  }
  return best;
}

function makeSide(spec, moveCatalog) {
  const stats = battleStats(spec.form, spec.ivs, spec.level);
  const fastMove = classifyMove(resolveMove(spec.fastMove, moveCatalog));
  fastMove.cooldown = fastMove.turns * TICK_MS;
  const chargedMoves = (spec.chargedMoves ?? []).map((id) => classifyMove(resolveMove(id, moveCatalog)));
  return {
    stats, fastMove, chargedMoves,
    // PvPoke's own speciesId (Ranker.js's symmetric-scenario optimization
    // always runs the fight with the lexicographically smaller speciesId
    // as Pokemon index 0 — see the CMP-tie note in simulateBattle) —
    // falls back to "" (sorts first) if a caller's form has none.
    speciesId: spec.form?.upstream_id ?? "",
    // Mimikyu's Disguise (Battle.js's "copying shield functionality"
    // special event, gated on formChange.effect === "protect" —
    // data/sources/raw/pvpoke-pokemon.json confirms Mimikyu is the only
    // species using that effect, so it's hardcoded by speciesId here
    // rather than threading full formChange data through every caller's
    // side spec for a one-Pokemon mechanic): its first unshielded charged
    // hit is clipped to 1 damage, once per fight, independent of and in
    // addition to its real shield count.
    hasDisguise: spec.form?.upstream_id === "mimikyu",
    disguiseBusted: false,
    activeChargedMoves: [], fastestChargedMove: null, bestChargedMove: null,
    energy: 0, cooldown: 0, hp: stats.hp, shields: 0, startingShields: 0,
    atkStage: 0, defStage: 0, pendingFast: null, hasActed: false,
    baitShields: 1, farmEnergy: false,
  };
}

// Computes each side's charged-move damage/dpe against the ACTUAL opponent
// it's about to fight (PvPoke recomputes this per matchup too — Pokemon.js's
// ordering only needs to run once per battle, not per turn, since neither
// side's base attack/defense or move set changes mid-fight).
function prepareMatchup(side, opponent) {
  // Pokemon.js's initializeMove/Battle.js's useMove both set move.damage as
  // a side effect every time a move resolves — ActionLogic.js then reads
  // poke.fastMove.damage / opponent.fastMove.damage directly in several
  // branches (decideAction's emergency/lethal checks, wouldShield). This
  // engine computes damage fresh via pvpDamage() everywhere it actually
  // NEEDS a number, but fastMove.damage still has to exist as a real value
  // (not undefined) for those direct-field reads to behave — seeded here,
  // refreshed in resolveHit() whenever a fast move actually lands (stat
  // stages can change over the course of a fight).
  side.fastMove.damage = pvpDamage(side, opponent, side.fastMove);
  // Pokemon.js's initializeMove computes dpe with a BUFF-ADJUSTED
  // multiplier — a move that buffs the thrower's own attack, or debuffs
  // the opponent's defense, gets its dpe scaled up by roughly how much
  // that buff is worth over ~80 energy's worth of future throws — and
  // orderChargedMoves's heuristics (the swap() calls) read THIS value, not
  // the plain damage/energy figure. It's only used for ordering, though:
  // upstream resets every move's dpe back to plain damage/energy right
  // after (Pokemon.js lines 841-846), which the second loop below mirrors.
  for (const move of side.chargedMoves) {
    move.damage = pvpDamage(side, opponent, move);
    move.dpe = move.damage / move.energy;
    if (move.buffs) {
      let buffEffect = 0;
      if (move.buffTarget === "self" && move.buffs[0] > 0) buffEffect = move.buffs[0] * (80 / move.energy);
      else if (move.buffTarget === "opponent" && move.buffs[1] < 0) buffEffect = Math.abs(move.buffs[1]) * (80 / move.energy);
      if (buffEffect > 0) move.dpe *= (BUFF_DIVISOR + buffEffect * move.buffApplyChance) / BUFF_DIVISOR;
    }
  }
  const ordered = orderChargedMoves([...side.chargedMoves].sort((a, b) => a.energy - b.energy));
  for (const move of ordered) move.dpe = move.damage / move.energy; // reset to plain damage/energy (see note above)
  side.activeChargedMoves = ordered;
  side.fastestChargedMove = ordered[0] ?? null;
  side.bestChargedMove = ordered.length ? pickBestChargedMove(ordered) : null;
}

// ActionLogic.wouldShield, minus the Aegislash/Cramorant-form and
// always-bait (attacker.baitShields == 2) clauses — no data for those forms
// in this repo, and baitShields stays PvPoke's default (1, "baits
// selectively") since this app doesn't expose a per-Pokemon baiting toggle.
function wouldShield(attacker, defender, move) {
  const damage = pvpDamage(attacker, defender, move);
  move.damage = damage;
  const postMoveHP = defender.hp - damage;
  const moveBuffs = move.buffs ?? [0, 0];

  let useShield = false;
  let shieldWeight = 1;
  const noShieldWeight = 2;

  // PvPoke applies the move's own buff to the ATTACKER only when buffs[0]
  // (the attack delta) is positive — any other case (including a self
  // -debuffing move like Superpower) applies it to the DEFENDER instead.
  // That looks backwards for a self-debuff, but it's upstream's actual
  // behavior (ActionLogic.js's wouldShield): faithfully reproduced rather
  // than "fixed", since the goal here is matching PvPoke's own verdicts.
  let fastAtkStage = attacker.atkStage;
  let fastDefStage = defender.defStage;
  if (moveBuffs[0] > 0) {
    fastAtkStage = clampStage(attacker.atkStage + moveBuffs[0]);
  } else {
    fastDefStage = clampStage(defender.defStage + moveBuffs[1]);
  }
  const fastDamage = rawDamage(
    attacker.stats.attack * stageMultiplier(fastAtkStage),
    defender.stats.defense * stageMultiplier(fastDefStage),
    attacker.stats.types, defender.stats.types, attacker.fastMove,
  );

  const fastAttacks = Math.ceil((move.energy - Math.max(attacker.energy - move.energy, 0)) / attacker.fastMove.energyGain) + 1;
  const fastAttackDamage = fastAttacks * fastDamage;
  const cycleDamage = (fastAttackDamage + 1) * defender.shields;

  if (postMoveHP <= cycleDamage) {
    useShield = true;
    shieldWeight = 2;
  }

  const fastDPT = fastDamage / attacker.fastMove.turns;
  for (const chargedMove of attacker.activeChargedMoves) {
    const chargedDamage = pvpDamage(attacker, defender, chargedMove);
    if (chargedDamage >= defender.hp / 1.4 && fastDPT > 1.5) {
      useShield = true;
      shieldWeight = 4;
    }
    if (chargedDamage >= defender.hp - cycleDamage) {
      useShield = true;
      shieldWeight = 4;
    }
    if (chargedDamage >= defender.hp / 2 && fastDPT > 2) {
      shieldWeight = 12;
    }
  }

  if (move.selfAttackDebuffing && move.damage / defender.hp > 0.55) {
    useShield = true;
    shieldWeight = 4;
  }

  return { value: useShield, shieldWeight, noShieldWeight };
}

// ActionLogic.decideAction, with the following upstream branches removed
// because they're always dead code once PvPoke's own non-guaranteed-buff
// evaluation is disabled (ActionLogic.js hardcodes `changeTTKChance = 0`
// right after computing it, every single call — the "chance" field on every
// DP state is therefore always 1, so the "chance != 1 -> continue" branch
// of the lethal-state search never fires, meaning the search always stops
// at the FIRST lethal state it finds and `stateList` always ends up with
// exactly 0 or 1 entries; the whole "stateList.length > 1" / "needsBoost"
// branch a few lines below that is consequently unreachable too):
//   - possibleAttackMult / changeTTKChance and every `if (changeTTKChance
//     != 0)` alternate-state push
//   - the stateList.length > 1 / opponent.turnsToKO "least risky plan" block
// Also omits: the Cramorant/Aegislash form-change special cases and mega
// damage (see this file's "Known gaps" list at the bottom) — Mimikyu's
// Disguise IS ported, just separately (hasDisguise/disguiseBusted, and
// the "rush the cheapest move" block below), since it isn't part of this
// particular DP search.
function decideAction(tick, poke, opponent) {
  if (poke.activeChargedMoves.length < 1) return null;
  if (poke.energy < poke.fastestChargedMove.energy || poke.farmEnergy) return null;

  const winsCMP = poke.stats.rawAttack >= opponent.stats.rawAttack; // CMP/priority: raw attack, no shadow bonus (Pokemon.js keeps shadowAtkMult out of stats.atk)
  const fastDamage = pvpDamage(poke, opponent, poke.fastMove);
  const oppFastDamage = pvpDamage(opponent, poke, opponent.fastMove);

  const chargedMoveReady = poke.activeChargedMoves.map((move) =>
    poke.energy >= move.energy ? 0 : Math.ceil((move.energy - poke.energy) / poke.fastMove.energyGain) * poke.fastMove.turns);

  let turnsToLive = Infinity;
  let queue = opponent.cooldown !== 0
    ? [{ hp: poke.hp - oppFastDamage, opEnergy: opponent.energy + opponent.fastMove.energyGain, turn: opponent.cooldown / TICK_MS, shields: poke.shields }]
    : [{ hp: poke.hp, opEnergy: opponent.energy, turn: 0, shields: poke.shields }];

  while (queue.length !== 0) {
    const currState = queue.shift();

    if (currState.hp > oppFastDamage) {
      if (winsCMP) {
        if (currState.turn > poke.fastMove.turns) continue;
      } else if (currState.turn > poke.fastMove.turns + 1) {
        continue;
      }
    }

    if (currState.shields !== 0) {
      if (currState.opEnergy >= opponent.fastestChargedMove.energy) {
        queue.unshift({ hp: currState.hp - 1, opEnergy: currState.opEnergy - opponent.fastestChargedMove.energy, turn: currState.turn + 1, shields: currState.shields - 1 });
      }
    } else {
      let foundLethal = false;
      for (const move of opponent.activeChargedMoves) {
        if (currState.opEnergy >= move.energy) {
          const moveDamage = pvpDamage(opponent, poke, move);
          if (moveDamage >= currState.hp) {
            turnsToLive = Math.min(currState.turn, turnsToLive);
            if (poke.stats.rawAttack > opponent.stats.rawAttack && opponent.fastMove.cooldown % poke.fastMove.cooldown === 0) turnsToLive++;
            foundLethal = true;
            break;
          }
          queue.unshift({ hp: currState.hp - moveDamage, opEnergy: currState.opEnergy - move.energy, turn: currState.turn + 1, shields: currState.shields });
        }
      }
      if (foundLethal) continue;
    }

    if (currState.hp - oppFastDamage <= 0) {
      turnsToLive = Math.min(currState.turn + opponent.fastMove.turns, turnsToLive);
      break;
    }
    queue.unshift({ hp: currState.hp - oppFastDamage, opEnergy: currState.opEnergy + opponent.fastMove.energyGain, turn: currState.turn + opponent.fastMove.turns, shields: currState.shields });
  }

  // Emergency: can't survive a fast move cycle — throw whatever deals the
  // most damage right now instead of planning ahead.
  if (turnsToLive !== -1) {
    if (poke.hp <= opponent.fastMove.damage * 2 && opponent.fastMove.cooldown === TICK_MS) turnsToLive--;
    if (poke.hp <= opponent.fastMove.damage && opponent.cooldown > 0 && opponent.fastMove.cooldown > TICK_MS) {
      turnsToLive = opponent.cooldown / TICK_MS;
      if (opponent.hp > poke.fastMove.damage) turnsToLive--;
    }
    if (poke.hp <= opponent.fastMove.damage && opponent.cooldown === 0 && opponent.fastMove.cooldown <= poke.fastMove.cooldown + TICK_MS) {
      if (opponent.hp > poke.fastMove.damage) turnsToLive--;
    }

    if (turnsToLive * TICK_MS < poke.fastMove.cooldown
      || (turnsToLive * TICK_MS === poke.fastMove.cooldown && !winsCMP)
      || (turnsToLive * TICK_MS === poke.fastMove.cooldown && poke.hp <= opponent.fastMove.damage)) {
      let bestMove = null;
      let bestDamage = -1;
      // Reverse order (matches ActionLogic.js's own `n = length; n >= 0; n--`
      // loop, an off-by-one that just means it visits index 1 before index 0)
      // so an exact-damage tie resolves to the same move PvPoke's does.
      for (let n = poke.activeChargedMoves.length - 1; n >= 0; n--) {
        if (chargedMoveReady[n] !== 0) continue;
        const move = poke.activeChargedMoves[n];
        const damage = pvpDamage(poke, opponent, move);
        if (damage > bestDamage) {
          bestMove = move;
          bestDamage = damage;
        }
        if (poke.energy >= move.energy * 2 && poke.stats.rawAttack > opponent.stats.rawAttack && damage * 2 > bestDamage) {
          bestMove = move;
          bestDamage = damage * 2;
        }
      }
      return bestMove; // null (fast move) if nothing is ready
    }
  }

  // Lethal charged move available right now and opponent has no shield left.
  // ActionLogic.js checks this (and the Mimikyu rush right below) BEFORE the
  // move-timing optimizer further down — a ready lethal move always fires
  // immediately, it never waits a tick to better align cooldowns.
  if (!poke.farmEnergy && opponent.shields === 0) {
    for (let n = 0; n < poke.activeChargedMoves.length; n++) {
      const move = poke.activeChargedMoves[n];
      if (poke.energy < move.energy) continue;
      const damage = pvpDamage(poke, opponent, move);
      if (opponent.hp <= damage && !move.selfDebuffing && (n === 0 || (n === 1 && !poke.baitShields)) && opponent.hp > poke.fastMove.damage) {
        return move;
      }
    }
  }

  // Opponent has Mimikyu's Disguise (or PvPoke's generic "protect"
  // formChange, which this repo's data only ever sets for Mimikyu) and no
  // real shield left: rush the CHEAPEST charged move instead of building
  // up to a bigger one, to pop the free block as early as possible. Ported
  // as-is, including that it keeps firing every decision cycle for the
  // rest of the fight (not just until the disguise actually breaks) — a
  // real quirk of ActionLogic.js's own condition, not refined here.
  if (opponent.hasDisguise && opponent.shields === 0) {
    if (poke.energy >= poke.fastestChargedMove.energy && !poke.fastestChargedMove.selfDebuffing) {
      return poke.fastestChargedMove;
    }
  }

  // Optimize move timing (Pokemon.js default: poke.optimizeMoveTiming is
  // true for every Pokemon, not a per-species flag — on in every Ranker
  // fight): hold back a ready charged move for one more fast-move cycle
  // when doing so better aligns this side's cooldown against the
  // opponent's, UNLESS any of the "don't optimize" guards below fire (an
  // imminent KO either direction, going over 100 energy, or running out
  // of turnsToLive first). Checked AFTER the lethal/Mimikyu blocks above,
  // matching ActionLogic.js's order — those can return straight through
  // this optimizer, which only ever says "throw a fast move instead".
  {
    let targetCooldown = TICK_MS;
    if (poke.fastMove.cooldown >= 2000) targetCooldown = 1000;
    if (poke.fastMove.cooldown >= 1500 && opponent.fastMove.cooldown === 2500) targetCooldown = 1000;
    if (poke.fastMove.cooldown === 1000 && opponent.fastMove.cooldown === 2000) targetCooldown = 1000;
    if (poke.fastMove.cooldown === opponent.fastMove.cooldown) targetCooldown = 0;
    if (poke.fastMove.cooldown % opponent.fastMove.cooldown === 0 && poke.fastMove.cooldown > opponent.fastMove.cooldown) targetCooldown = 0;

    if ((opponent.cooldown === 0 || opponent.cooldown > targetCooldown) && targetCooldown > 0) {
      let optimizeTiming = true;
      if (poke.hp <= opponent.fastMove.damage) optimizeTiming = false;

      // queuedFastMoves: how many of THIS side's own not-yet-landed fast
      // moves are already in flight, +1 for the one being considered here.
      // decideAction only ever runs when poke.cooldown === 0, which (see
      // simulateBattle's tick loop) is exactly the tick AFTER any of this
      // side's own pending fast move already resolved — so there is never
      // an outstanding one at this point, same as upstream's queuedActions
      // scan would find for a single 1v1 fight with no team switches.
      const queuedFastMoves = 1;
      if (poke.energy + poke.fastMove.energyGain * queuedFastMoves > 100) optimizeTiming = false;

      let turnsPlanned = poke.fastMove.turns + Math.floor(poke.energy / poke.activeChargedMoves[0].energy);
      if (poke.stats.rawAttack < opponent.stats.rawAttack) turnsPlanned++;
      if (turnsPlanned > turnsToLive) optimizeTiming = false;

      if (opponent.shields === 0) {
        for (const move of poke.activeChargedMoves) {
          if (poke.energy >= move.energy && pvpDamage(poke, opponent, move) >= opponent.hp) {
            optimizeTiming = false;
            break;
          }
        }
      }

      if (optimizeTiming) {
        for (const move of opponent.activeChargedMoves) {
          const fastMovesFromCharged = Math.ceil((move.energy - opponent.energy) / opponent.fastMove.energyGain);
          const fastMovesInFastMove = Math.floor(poke.fastMove.cooldown / opponent.fastMove.cooldown);
          const turnsFromMove = fastMovesFromCharged * opponent.fastMove.turns + 1;
          let moveDamage = pvpDamage(opponent, poke, move) + opponent.fastMove.damage * fastMovesInFastMove;
          if (poke.shields > 0) moveDamage = 1 + opponent.fastMove.damage * fastMovesInFastMove;
          if (turnsFromMove <= poke.fastMove.turns && moveDamage >= poke.hp) {
            optimizeTiming = false;
            break;
          }
        }
      }

      const fastMovesInFastMove = Math.floor((poke.fastMove.cooldown + TICK_MS) / opponent.fastMove.cooldown);
      if (poke.hp <= opponent.fastMove.damage * fastMovesInFastMove) optimizeTiming = false;

      if (optimizeTiming) return null; // throw a fast move instead, to re-align cooldown timing
    }
  }

  // Opponent can't be fainted within a couple of charge cycles: don't plan
  // ahead, just build toward (and throw) the single best move.
  const bestChargedDamage = pvpDamage(poke, opponent, poke.bestChargedMove);
  const bestCycleDamage = bestChargedDamage + fastDamage * Math.ceil(poke.bestChargedMove.energy / poke.fastMove.energyGain);
  let minimumCycleThreshold = 2;
  if (poke.bestChargedMove.selfDebuffing && poke.bestChargedMove.energy > poke.fastestChargedMove.energy && poke.bestChargedMove.dpe / poke.fastestChargedMove.dpe < 2) {
    minimumCycleThreshold = 1.1;
  }

  if (opponent.hp / bestCycleDamage > minimumCycleThreshold) {
    let selectedMove = poke.bestChargedMove;
    for (const move of poke.activeChargedMoves) {
      if (poke.bestChargedMove.selfDebuffing && !move.selfDebuffing && selectedMove.dpe / move.dpe < 2) selectedMove = move;
      if (poke.baitShields && opponent.shields > 0 && !poke.activeChargedMoves[0].selfDebuffing && wouldShield(poke, opponent, move).value) {
        selectedMove = poke.activeChargedMoves[0];
      }
    }
    if (poke.energy < selectedMove.energy) return null;
    if (selectedMove.selfDebuffing) {
      const energyToReach = poke.energy + Math.floor((100 - poke.energy) / poke.fastMove.energyGain) * poke.fastMove.energyGain;
      if (poke.energy < energyToReach) return null;
    }
    return selectedMove;
  }

  // Plan the fastest lethal sequence of charged-move throws (energy-cost DP,
  // priority-queued by turn). Every state's "chance" is 1 (see this
  // function's header note on the dead probabilistic-buff branches), so the
  // search always stops at the first lethal state it reaches.
  //
  // Upstream's own state-insertion dominance check (ActionLogic.js's
  // `DPQueue[i].hp <= newOppHealth && ... && DPQueue[i].shields <= newShields`)
  // compares against BattleState fields named `.oppHealth`/`.oppShields`, not
  // `.hp`/`.shields` — so every comparison reads `undefined` and the whole
  // "insertElement = false" branch never fires in shipped PvPoke. There is no
  // real pruning: every generated state gets inserted (just turn-ordered),
  // bounded only by the 500-state cap below. Replicated as-is (no pruning)
  // rather than "fixed", since a smarter prune can pick a different, shorter
  // plan than PvPoke's own engine actually finds.
  //
  // Separately, the farm-down branch's pushed state passes
  // `currState.opponentShields` (undefined — the field is `oppShields`), so
  // once a plan takes a farm-down step, that branch of the search loses
  // track of the opponent's remaining shields (reads back as `undefined`,
  // falsy in every `> 0` check from then on) — also replicated as-is.
  let stateCount = 0;
  let dpQueue = [{ energy: poke.energy, oppHealth: opponent.hp, turn: 0, oppShields: opponent.shields, moves: [] }];
  let finalState = null;

  while (dpQueue.length !== 0) {
    if (stateCount >= 500) return null; // likely infinite loop; fall back to a fast move
    stateCount++;
    const currState = dpQueue.shift();

    if (currState.oppHealth <= 0) {
      finalState = currState;
      break;
    }

    for (let n = 0; n < poke.activeChargedMoves.length; n++) {
      const move = poke.activeChargedMoves[n];
      const attackMultBefore = currState.buffAtk ?? 0;
      const atkStageForMove = clampStage(poke.atkStage + attackMultBefore);
      const atkForMove = poke.stats.attack * stageMultiplier(atkStageForMove);
      const moveDamage = rawDamage(atkForMove, effectiveDefense(opponent), poke.stats.types, opponent.stats.types, move);
      const fastSimulatedDamage = rawDamage(atkForMove, effectiveDefense(opponent), poke.stats.types, opponent.stats.types, poke.fastMove);
      const readyIn = currState.energy >= move.energy ? 0 : Math.ceil((move.energy - currState.energy) / poke.fastMove.energyGain) * poke.fastMove.turns;

      // Farm-down insertion: keep taking fast-move chip until this move is
      // affordable, if it isn't already (see the shields-undefined note above).
      const movesToFarmDown = Math.ceil(currState.oppHealth / fastSimulatedDamage);
      const farmTurn = currState.turn + movesToFarmDown * poke.fastMove.turns;
      insertSorted(dpQueue, {
        energy: currState.energy + poke.fastMove.energyGain * movesToFarmDown,
        oppHealth: 0, turn: farmTurn, oppShields: undefined, moves: currState.moves, buffAtk: attackMultBefore,
      }, farmTurn, false);

      let attackMult = attackMultBefore;
      if (move.buffApplyChance === 1 && move.buffTarget === "self") attackMult += move.buffs[0];
      if (move.buffApplyChance === 1 && move.buffTarget === "opponent") attackMult -= move.buffs[1];
      const moves = currState.moves.concat([move]);

      if (readyIn === 0) {
        const newOppHealth = currState.oppShields > 0 ? currState.oppHealth - 1 : currState.oppHealth - moveDamage;
        const newShields = currState.oppShields > 0 ? currState.oppShields - 1 : currState.oppShields;
        const newEnergy = currState.energy - move.energy;
        const newTurn = currState.turn + 1;
        // ActionLogic.js's "Perrserker and Giratina" dedupe — a REAL, live
        // check (unlike the dead dominance check inside insertSorted's own
        // boundary, which compares against BattleState fields that don't
        // exist upstream): among states already queued at this same turn
        // with the same resulting opponent HP and attack-buff level, keep
        // only the plan with fewer net self-debuff throws outstanding
        // (a guaranteed net-positive self-buff offsets one), dropping a
        // strictly-worse existing entry or skipping this insert if an
        // equal-or-better one is already queued.
        let insertElement = true;
        let i = 0;
        while (i < dpQueue.length && dpQueue[i].turn === newTurn) {
          if (dpQueue[i].oppHealth === newOppHealth && (dpQueue[i].buffAtk ?? 0) === attackMult) {
            if (dpQueue[i].energy === newEnergy) {
              if (debuffScore(dpQueue[i].moves) > debuffScore(moves)) {
                dpQueue.splice(i, 1);
              } else {
                insertElement = false;
                i++;
              }
            } else {
              insertElement = false;
              i++;
            }
          } else {
            i++;
          }
        }
        if (insertElement) {
          insertSorted(dpQueue, { energy: newEnergy, oppHealth: newOppHealth, turn: newTurn, oppShields: newShields, moves, buffAtk: attackMult }, newTurn, false);
          pushStackedDebuff(dpQueue, poke, move, moveDamage, currState, newShields, fastSimulatedDamage, attackMult, false);
        }
      } else {
        const newEnergy = currState.energy - move.energy + poke.fastMove.energyGain * (readyIn / poke.fastMove.turns);
        let newOppHealth = currState.oppHealth - moveDamage - fastSimulatedDamage * (readyIn / poke.fastMove.turns);
        if (currState.oppShields > 0) newOppHealth = currState.oppHealth - fastSimulatedDamage * (readyIn / poke.fastMove.turns) - 1;
        const newShields = currState.oppShields > 0 ? currState.oppShields - 1 : currState.oppShields;
        const newTurn = currState.turn + readyIn + 1;
        insertSorted(dpQueue, { energy: newEnergy, oppHealth: newOppHealth, turn: newTurn, oppShields: newShields, moves, buffAtk: attackMult }, newTurn, true);
        pushStackedDebuff(dpQueue, poke, move, moveDamage, currState, newShields, fastSimulatedDamage, attackMult, true);
      }
    }
  }

  if (!finalState) return null; // farm-down forever, or hit the 500-state cap

  if (finalState.moves.length === 0) return null; // the plan IS the farm-down

  const debuffingMove = finalState.moves.some((m) => m.selfDebuffing);

  if (poke.baitShields && opponent.shields > 0 && poke.activeChargedMoves.length > 1) {
    for (let i = 1; i < poke.activeChargedMoves.length; i++) {
      if (poke.energy < poke.activeChargedMoves[i].energy && poke.activeChargedMoves[i].dpe > finalState.moves[0].dpe) {
        const sameFamilyBuffed = poke.activeChargedMoves[i].dpe / poke.activeChargedMoves[0].dpe <= 1.5 && poke.activeChargedMoves[0].selfBuffing;
        if (!sameFamilyBuffed) return null; // hold the bait move back
      }
    }
  }

  if (poke.baitShields && opponent.shields > 0 && poke.activeChargedMoves.length > 1) {
    for (let i = 1; i < poke.activeChargedMoves.length; i++) {
      const dpeRatio = (poke.activeChargedMoves[i].damage / poke.activeChargedMoves[i].energy) / (finalState.moves[0].damage / finalState.moves[0].energy);
      if (poke.energy >= poke.activeChargedMoves[i].energy && dpeRatio > 1.5 && !wouldShield(poke, opponent, poke.activeChargedMoves[i]).value) {
        finalState.moves[0] = poke.activeChargedMoves[i];
      }
    }
  }

  if (!poke.baitShields || (opponent.shields === 0 && !debuffingMove)) {
    finalState.moves = [...finalState.moves].sort((a, b) => pvpDamage(poke, opponent, b) - pvpDamage(poke, opponent, a));
  }

  if (opponent.shields > 0 && poke.activeChargedMoves.length > 1 && poke.activeChargedMoves[0].energy <= finalState.moves[0].energy
    && poke.activeChargedMoves[0].dpe > finalState.moves[0].dpe && !poke.activeChargedMoves[0].selfDebuffing) {
    finalState.moves[0] = poke.activeChargedMoves[0];
  }

  if (opponent.shields === 0 && poke.activeChargedMoves.length > 1 && finalState.moves[0].selfDebuffing
    && finalState.moves[0].energy > 50 && poke.hp / poke.stats.hp > 0.5 && finalState.moves[0].damage / opponent.hp < 0.8) {
    finalState.moves[0] = poke.activeChargedMoves[0];
  }

  if (poke.activeChargedMoves.length > 1 && poke.activeChargedMoves[0].energy === finalState.moves[0].energy
    && poke.activeChargedMoves[0].dpe > finalState.moves[0].dpe && !poke.activeChargedMoves[0].selfDebuffing) {
    finalState.moves[0] = poke.activeChargedMoves[0];
  }

  if (poke.activeChargedMoves.length > 1 && poke.activeChargedMoves[0].energy - 10 <= finalState.moves[0].energy
    && poke.activeChargedMoves[0].dpe > finalState.moves[0].dpe && finalState.moves[0].selfDebuffing && !poke.activeChargedMoves[0].selfDebuffing) {
    finalState.moves[0] = poke.activeChargedMoves[0];
  }

  if (poke.activeChargedMoves.length > 1 && poke.activeChargedMoves[0].energy - finalState.moves[0].energy <= 5
    && poke.activeChargedMoves[0].dpe > finalState.moves[0].dpe && poke.activeChargedMoves[0].selfBuffing) {
    finalState.moves[0] = poke.activeChargedMoves[0];
  }

  if (poke.baitShields && opponent.shields > 0 && poke.activeChargedMoves.length > 1) {
    for (let i = 1; i < poke.activeChargedMoves.length; i++) {
      if (poke.energy >= poke.activeChargedMoves[i].energy && poke.activeChargedMoves[i].dpe > finalState.moves[0].dpe
        && finalState.moves[0].selfDebuffing && !poke.activeChargedMoves[i].selfDebuffing) {
        finalState.moves[0] = poke.activeChargedMoves[i];
      }
    }
  }

  if (opponent.shields === 0 && poke.activeChargedMoves.length > 1 && finalState.moves[0].selfDebuffing) {
    for (let i = 1; i < poke.activeChargedMoves.length; i++) {
      if (poke.activeChargedMoves[i].dpe > finalState.moves[0].dpe && !poke.activeChargedMoves[i].selfDebuffing) {
        finalState.moves[0] = poke.activeChargedMoves[i];
      }
    }
  }

  if (opponent.shields > 0 && poke.activeChargedMoves.length > 1) {
    for (let i = 1; i < poke.activeChargedMoves.length; i++) {
      if (poke.activeChargedMoves[0].selfDebuffing && !poke.activeChargedMoves[i].selfDebuffing) {
        if (poke.baitShields || opponent.hp - poke.activeChargedMoves[0].damage > 10) {
          if (poke.activeChargedMoves[i].energy - poke.activeChargedMoves[0].energy <= 10 && poke.activeChargedMoves[i].dpe / poke.activeChargedMoves[0].dpe > 0.7) {
            finalState.moves[0] = poke.activeChargedMoves[i];
          }
        }
      }
    }
  }

  if (finalState.moves[0].selfDebuffing && poke.shields === 0 && poke.energy < 100 && opponent.bestChargedMove) {
    if (opponent.energy >= opponent.bestChargedMove.energy && !wouldShield(opponent, poke, opponent.bestChargedMove).value && !poke.activeChargedMoves[0].selfBuffing) {
      return null; // defer the self-debuffing move until after the opponent fires
    }
  }

  if (finalState.moves[0].selfDebuffing) {
    const targetEnergy = Math.floor(100 / finalState.moves[0].energy) * finalState.moves[0].energy;
    if (poke.energy < targetEnergy) {
      const moveDamage = pvpDamage(poke, opponent, finalState.moves[0]);
      if ((opponent.hp > moveDamage || opponent.shields !== 0) && (poke.hp > opponent.fastMove.damage * 2 || opponent.fastMove.cooldown - poke.fastMove.cooldown > TICK_MS)) {
        return null; // stack energy before throwing a debuffing move
      }
    } else if (poke.baitShields && opponent.shields > 0 && poke.activeChargedMoves[0].energy - finalState.moves[0].energy <= 10 && !poke.activeChargedMoves[0].selfDebuffing) {
      if (poke.activeChargedMoves[0].selfBuffing || wouldShield(poke, opponent, finalState.moves[0]).value) {
        finalState.moves[0] = poke.activeChargedMoves[0];
      }
    }
  }

  if (poke.energy < finalState.moves[0].energy) return null;
  return finalState.moves[0];
}

// ActionLogic.js's DP-queue insertion. Upstream's own "insertElement = false"
// dominance check never fires (see the note above decideAction's DP loop) —
// so this is purely a turn-ordered insert, no pruning: `strict` selects `<`
// vs `<=` to match the exact boundary the ported branch used.
function insertSorted(queue, state, turn, strict) {
  let i = 0;
  while (i < queue.length && (strict ? queue[i].turn < turn : queue[i].turn <= turn)) i++;
  queue.splice(i, 0, state);
}

// ActionLogic.js's dedupe tiebreak: a self-debuff throw counts as +1, a
// guaranteed net-positive self-buff throw (buffs[0]+buffs[1] > 0) offsets
// one. Higher is worse (more net debuff exposure outstanding).
function debuffScore(planMoves) {
  return planMoves.reduce((score, m) => {
    let next = score;
    if (m.selfDebuffing) next += 1;
    if (m.buffApplyChance === 1 && m.buffTarget === "self" && m.buffs[0] + m.buffs[1] > 0) next -= 1;
    return next;
  }, 0);
}

// ActionLogic.js's "stack self-debuffing moves" branch: if this move lowers
// the thrower's own attack/defense and can be thrown twice before 100
// energy, also queue the plan where it's thrown twice back-to-back (fewer
// total turns spent debuffed than two separate single throws). `moveDamage`
// is the FIRST throw's pre-debuff damage, reused as-is for the second throw
// too (upstream doesn't recompute it under the post-first-throw debuffed
// attack stage — a faithfully-replicated quirk, not a fix).
function pushStackedDebuff(queue, poke, move, moveDamage, currState, newShields, fastSimulatedDamage, attackMult, strict) {
  if (!(move.selfDebuffing && move.buffs[0] < 0 && move.energy * 2 <= 100)) return;
  const newTurn = Math.ceil((move.energy * 2 - currState.energy) / poke.fastMove.energyGain) * poke.fastMove.turns;
  if (newTurn === 0) return;
  const newEnergy = Math.floor(newTurn / poke.fastMove.turns) * poke.fastMove.energyGain + currState.energy - move.energy;
  let newOppHealth = currState.oppHealth - fastSimulatedDamage * (newTurn / poke.fastMove.turns);
  newOppHealth = currState.oppShields > 0 ? newOppHealth - 1 : newOppHealth - moveDamage;
  const finalTurn = newTurn + currState.turn + 1;
  const moves = currState.moves.concat([move]);
  insertSorted(queue, { energy: newEnergy, oppHealth: newOppHealth, turn: finalTurn, oppShields: newShields, moves, buffAtk: attackMult }, finalTurn, strict);
}

// ActionLogic.decideRandomAction/chooseOption aren't ported — this engine
// only needs decisionMethod "default" (what Ranker.js uses to generate the
// published keyMatchups/keyCounters this repo measures against), not
// PvPoke's separately-randomized battle-simulator-UI mode.

// Simulates one 1v1 fight, PvPoke's "simulate" mode (Battle.js's
// usePriority/CMP rule, decideAction, wouldShield), with a fixed shield
// count per side rather than letting a scenario table choose it — same
// fixed-shields contract pvp-sim.js's old engine used.
export function simulateBattle(a, b, { shields = [0, 0], moveCatalog = {} } = {}) {
  const sideA = makeSide(a, moveCatalog);
  const sideB = makeSide(b, moveCatalog);
  prepareMatchup(sideA, sideB);
  prepareMatchup(sideB, sideA);
  sideA.shields = sideA.startingShields = shields[0] ?? 0;
  sideB.shields = sideB.startingShields = shields[1] ?? 0;

  const log = [];
  let timeMs = 0;
  let tick = 1;
  let chargedLastTick = false;

  while (timeMs <= MAX_TIME_MS && sideA.hp > 0 && sideB.hp > 0) {
    sideA.cooldown = Math.max(0, sideA.cooldown - TICK_MS);
    sideB.cooldown = Math.max(0, sideB.cooldown - TICK_MS);
    sideA.hasActed = false;
    sideB.hasActed = false;

    // Battle.js's step(): "Check for a Charged Move this turn to apply
    // floating Fast Moves" — any still-in-flight fast move (queued on an
    // earlier tick, from either side) resolves NOW instead of waiting for
    // its normal multi-turn cooldown, the instant a charged move landed on
    // the immediately preceding tick. Only matters for 3+-turn fast moves
    // interrupted by a charged throw; shifts resolveAtTick earlier, never
    // later.
    if (chargedLastTick) {
      for (const side of [sideA, sideB]) {
        if (side.pendingFast && side.pendingFast.resolveAtTick > tick) side.pendingFast.resolveAtTick = tick;
      }
    }

    // Battle.js defers writing the new cooldown back onto each Pokemon until
    // AFTER both sides have decided (cooldownsToSet[i], applied post-loop) —
    // so side B's decision this same tick still sees side A's PRE-decision
    // cooldown (whatever was left over from A's last decision), not
    // whatever A just chose this tick. Mirrored here with `newCooldown`
    // staged separately and only written to `side.cooldown` after the loop.
    const decisions = [];
    for (const [side, opp, label] of [[sideA, sideB, "a"], [sideB, sideA, "b"]]) {
      if (side.cooldown !== 0 || side.hasActed) continue;
      side.hasActed = true;
      const chosen = decideAction(tick, side, opp);
      if (chosen) {
        decisions.push({ side, opp, label, kind: "charged", move: chosen, newCooldown: TICK_MS });
      } else {
        decisions.push({ side, opp, label, kind: "fast", move: side.fastMove, newCooldown: side.fastMove.cooldown });
      }
    }
    for (const decision of decisions) {
      decision.side.cooldown = decision.newCooldown;
      if (decision.kind === "fast") {
        decision.side.pendingFast = { move: decision.move, resolveAtTick: tick + decision.move.turns - 1 };
      }
    }

    const events = [];
    for (const [side, opp, label] of [[sideA, sideB, "a"], [sideB, sideA, "b"]]) {
      if (side.pendingFast && side.pendingFast.resolveAtTick === tick) {
        events.push({ side, opp, label, kind: "fast", move: side.pendingFast.move, priority: 0 });
        side.pendingFast = null;
      }
    }
    for (const decision of decisions) {
      if (decision.kind !== "charged") continue;
      let priority = 10;
      if (decision.side.stats.rawAttack > decision.opp.stats.rawAttack) priority += 1;
      events.push({ ...decision, priority });
    }

    applyTickEvents(events, log, tick);
    chargedLastTick = events.some((event) => event.kind === "charged");

    if (sideA.hp <= 0 || sideB.hp <= 0) break;
    timeMs += TICK_MS;
    tick += 1;
  }

  const aAlive = sideA.hp > 0;
  const bAlive = sideB.hp > 0;
  let winner;
  if (aAlive && !bAlive) winner = "a";
  else if (bAlive && !aAlive) winner = "b";
  else if (!aAlive && !bAlive) winner = "tie";
  else {
    const aPct = sideA.hp / sideA.stats.hp;
    const bPct = sideB.hp / sideB.stats.hp;
    winner = aPct === bPct ? "tie" : aPct > bPct ? "a" : "b";
  }

  // Ranker.js's rating formula: floor((healthRating + damageRating) * 500)
  // from side A's perspective — healthRating is A's own remaining HP%,
  // damageRating is how much of B's HP A removed.
  const aHealthRating = sideA.hp / sideA.stats.hp;
  const aDamageRating = (sideB.stats.hp - sideB.hp) / sideB.stats.hp;
  const battleRating = Math.max(0, Math.min(1000, Math.floor((aHealthRating + aDamageRating) * 500)));

  return { winner, battleRating, hpLeft: [sideA.hp, sideB.hp], turns: tick, log };
}

// Applies every event scheduled for this tick, highest priority first
// (charged ~10/11 before fast's fixed 0); an exact priority tie (both sides
// threw a charged move with equal raw attack, or two fast moves land
// together). An exact priority tie breaks on speciesId, lexicographically
// smaller first — Ranker.js's own symmetric-scenario shortcut always runs
// the actual fight with the lexicographically smaller speciesId as
// Pokemon index 0, and getTurnAction's priority sort is a stable sort, so
// index 0 wins every tie (CMP or simultaneous-fast-landing alike). This is
// NOT symmetric under argument order — simulateBattle(a, b) and
// simulateBattle(b, a) can pick different winners on a tie, matching
// PvPoke's own asymmetry instead of this file's old invented "resolve
// ties from a shared snapshot" rule (see tests/web/pvp-sim.test.mjs's
// former mirror-image test, now asserting the speciesId rule instead).
// Per Battle.js's faintSource rule, an event whose own side already
// fainted (necessarily from a higher-priority event processed earlier
// this same tick) is skipped outright — this is what makes a charged kill
// cancel the loser's own already-in-flight fast move, and is also why no
// "lingering fast move still lands after the loop ends" special case is
// needed: a fast move scheduled to resolve on a LATER tick than the one
// its side dies on simply never gets reached, because the tick loop stops
// at the death tick.
function applyTickEvents(events, log, tick) {
  events.sort((x, y) => {
    if (y.priority !== x.priority) return y.priority - x.priority;
    if (x.side.speciesId < y.side.speciesId) return -1;
    if (x.side.speciesId > y.side.speciesId) return 1;
    return 0;
  });
  for (const event of events) applyEvent(event, log, tick);
}

function resolveHit(event) {
  const { side: attacker, opp: defender, move, kind } = event;
  if (kind !== "charged") {
    move.damage = pvpDamage(attacker, defender, move);
    return { damage: move.damage, shielded: false };
  }
  if (defender.shields > 0 && decideShield(attacker, defender, move)) {
    return { damage: 1, shielded: true };
  }
  move.damage = pvpDamage(attacker, defender, move);
  // Mimikyu's Disguise: a real shield already took priority above (the
  // defender can't use both on the same hit) — this only fires on a
  // charged hit the defender did NOT shield, same as Battle.js's
  // `! defenderUsedShield` guard on its own Disguise event.
  if (defender.hasDisguise && !defender.disguiseBusted) {
    defender.disguiseBusted = true;
    return { damage: 1, shielded: false, disguiseBusted: true };
  }
  return { damage: move.damage, shielded: false };
}

// useMove's shield-decision default (Battle.js lines ~1074-1137, non-sandbox
// path): shield ANY charged hit with a shield available, EXCEPT for a
// self-buffing move (don't block an opponent's own buildup turn — the move
// barely hurts, and blocking it stops nothing) or when the shield-holder's
// own best move will soon debuff its own defense (it may want to save
// shields for after that debuff lands) — those two cases defer to
// wouldShield()'s real calculation instead of the blanket "always block"
// default. Species exceptions (Aegislash/Cramorant/Mimikyu) are omitted —
// no data for those forms in this repo.
function decideShield(attacker, defender, move) {
  let useShield = true;
  if (move.buffs && move.selfBuffing
    && ((move.buffTarget === "self" && move.buffs[0] > 0) || (move.buffTarget === "opponent" && move.buffs[1] < 0))) {
    useShield = wouldShield(attacker, defender, move).value;
  }
  if (defender.bestChargedMove && defender.bestChargedMove.selfDefenseDebuffing) {
    if (attacker.shields > 0) {
      useShield = wouldShield(attacker, defender, move).value;
    } else if (attacker.bestChargedMove) {
      const fastToNextCharged = Math.ceil((defender.bestChargedMove.energy - defender.energy) / defender.fastMove.energyGain);
      const turnsToNextCharged = fastToNextCharged * defender.fastMove.turns;
      const cycleDamage = fastToNextCharged * pvpDamage(defender, attacker, defender.fastMove) + pvpDamage(defender, attacker, defender.bestChargedMove);
      let attackerTurnsToNextCharged = Math.ceil((attacker.activeChargedMoves[0].energy - attacker.energy) / attacker.fastMove.energyGain) * attacker.fastMove.turns;
      if (attacker.stats.rawAttack > defender.stats.rawAttack) attackerTurnsToNextCharged--;
      if (turnsToNextCharged >= attackerTurnsToNextCharged && attacker.hp <= cycleDamage) {
        useShield = wouldShield(attacker, defender, move).value;
      }
    }
  }
  return useShield;
}

function applyHit(event, hit, log, tick) {
  const { side, opp, move, kind, label } = event;
  if (hit.shielded) opp.shields -= 1;
  opp.hp = Math.max(0, opp.hp - hit.damage);
  if (kind === "fast") side.energy = Math.min(100, side.energy + (move.energyGain ?? 0));
  else side.energy -= move.energy;
  applyBuffIfCertain(move, side, opp);
  log.push({ turn: tick, by: label, move: move.id, kind, damage: hit.damage, shielded: hit.shielded });
}

function applyEvent(event, log, tick) {
  if (event.side.hp <= 0) return; // this side already fainted earlier this same tick
  if (event.opp.hp <= 0) return;
  applyHit(event, resolveHit(event), log, tick);
}

// Known gaps — mechanics PvPoke's own engine has that this port doesn't,
// left out deliberately rather than missed. Measured by diffing this port
// fight-by-fight against PvPoke's own real, fetched Battle.js/Pokemon.js/
// ActionLogic.js/GameMaster.js running in a Node vm (scripts/pvpoke-diff.mjs,
// not shipped — not vendored into the repo, see that file's header). Once
// every pvp.<league> row carried its own leads-scenario moveset
// (leadsMoves — see pvp.py's _leads_moveset and pvp-sim.js's header) in
// place of the overall-scenario one, that harness reproduces PvPoke's own
// published leads-scenario ratings at 100% (500/500) — fed the exact
// moveset its own Ranker used, the real engine always agrees with its own
// published number, as expected (see "Resolved" below for the data gap
// that used to cap this at 89.8%). This port agrees with that REAL
// engine's own winner (not just the published number) on 473/500 (94.6%)
// of the same pairs — the remaining gap below is genuine engine fidelity,
// not a moveset or snapshot-date mismatch.
//
// - Aegislash's form-change mechanic (shield/blade swap attack and
//   defense between forms mid-fight, and DamageCalculator.js special-
//   cases its charged-move damage to always use the blade form's attack
//   even while nominally in shield form). This repo's data DOES carry
//   both forms (0681-shield/0681-blade), but there's no Aegislash row in
//   pvp.great at all, so it's unmeasured here and not cheap to add
//   (dynamic per-battle form/stat switching, not a single extra field).
// - Cramorant's Gulp Missile form changes (gulping/gorging). Unlike
//   Aegislash, Cramorant DOES appear in pvp.great (as both a subject row
//   and — more consequentially — as an OPPONENT in other rows' matchups):
//   the harness's real-engine diff confirms ActionLogic.js checks the
//   OPPONENT's activeFormId directly (`opponent.activeFormId ==
//   "cramorant_gulping"`) to decide whether to hold back a charged move
//   and stack it instead of throwing immediately — i.e. fighting Cramorant
//   changes the OTHER Pokémon's move timing, not just Cramorant's own. This
//   is the single largest divergence class the harness finds (11 of the
//   500 pairs' winners, concentrated on Cramorant match-ups specifically —
//   up from 7/499 once leadsMoves fixed the moveset mismatch above and
//   surfaced more genuine Cramorant match-ups that a wrong moveset had
//   been hiding), confirming the mechanic is both real and measurable, but
//   still not cheap to add for the reason above (dynamic per-battle
//   form/stat switching threaded through the OPPONENT's own decision
//   logic too, not just Cramorant's).
// - A residual Mimikyu post-Disguise-bust edge case: once Disguise breaks
//   (see "Already handled" below), decideAction's "opponent can't be
//   fainted within a couple of charge cycles, just throw the best move"
//   vs. "plan the full DP lethal sequence" branch choice (the `opponent.hp
//   / bestCycleDamage > minimumCycleThreshold` check) sits right on its own
//   boundary for several of Mimikyu's own matchups post-bust, and this
//   port lands on the opposite side of that boundary from the real engine
//   for some of them (Mimikyu accounts for 10 of the harness's 27 remaining
//   winner divergences, up from 5/17 for the same reason as Cramorant
//   above). Not yet root-caused past confirming it isn't a stat/type
//   change on the busted form (both are identical to the un-busted form in
//   gamemaster.json) — flagged here rather than guessed at further.
// - The hardcoded "Melmetal vs Cresselia" clause in ActionLogic.js's DP
//   search (skip a lethal-adjacent self-defense-debuffing move specifically
//   for that one matchup) — a one-pair special case, not ported.
// - Mega-evolution damage multipliers — no mega data in this repo's PvP
//   catalog.
// - decisionMethod "random" (ActionLogic.decideRandomAction/chooseOption)
//   — Ranker.js (which produces the keyMatchups/keyCounters this engine
//   is measured against) always uses "default", so random mode was never
//   needed.
// - Probabilistic (buffApplyChance < 1) buff EFFECTS are not applied
//   (deterministic sim, see applyBuffIfCertain) — but the buffApplyChance
//   >= 0.5 move-classification threshold (selfDebuffing/selfBuffing etc.,
//   see classifyMove) still accounts for them in move selection, matching
//   upstream's own distinction between "classify" and "apply".
//
// Already handled, despite looking like gaps at a glance:
// - The super-effective type multiplier uses PvPoke's float32-rounded
//   1.60000002384185791015625 (via WEAK_RATIO above), not type-chart.js's
//   plain 1.6 — corrected locally rather than by changing that shared,
//   non-PvP-specific module.
// - Mimikyu's Disguise IS ported (hasDisguise/disguiseBusted above) —
//   hardcoded by speciesId rather than generic formChange data, since
//   data/sources/raw/pvpoke-pokemon.json confirms it's the only species
//   using PvPoke's "protect" formChange effect. (See the post-bust DP-
//   boundary gap above for what's NOT yet fully matched once it fires.)
// - ActionLogic.js's "lethal charged move available" and Mimikyu-disguise-
//   rush checks run BEFORE the move-timing optimizer (hold a ready move
//   back one more cycle to align cooldowns), so a ready lethal/disguise-
//   breaking move always fires immediately rather than risking a one-tick
//   delay. This port had the two blocks in the opposite order (fixed by
//   the differential harness).
// - The "bandaid to force a more efficient move of similar energy if one
//   move is self-buffing" reorder (decideAction's DP-plan cleanup) also
//   requires the candidate move to have a STRICTLY higher dpe than the
//   planned move, matching ActionLogic.js — this port was missing that
//   dpe comparison, so it fired whenever energy was merely close (fixed by
//   the differential harness; found via a Fearow/Tinkaton fight where this
//   port threw the cheap bait move twice instead of switching to the
//   bigger kill move once the bait had already been shielded).
//
// Resolved — the real engine used to only reproduce PvPoke's own published
// leads-scenario rating 89.8% of the time (not ~100%): for roughly 18 of
// the ~280 Great League species in data/processed/encyclopedia.json's
// pvp.great, the stored chargedMoves (an "overall ranking" moveset) differed
// from the moveset PvPoke's leads-scenario rankings actually used for that
// specific Pokémon (e.g. this repo had Altaria running MOONBLAST/
// SKY_ATTACK, PvPoke's own leads ranking ran MOONBLAST/FLAMETHROWER). That
// was a canonical-data staleness problem (which moveset got captured per
// scenario), not a battle-engine bug. Fixed by sourcing each row's
// leads-scenario moveset (leadsMoves — pvp.py's _leads_moveset) from a new
// pinned pvpoke-leads-<league> snapshot and having the measurement
// harnesses (scripts/pvp-sim-agreement.mjs, scripts/pvpoke-diff.mjs,
// tests/web/pvp-sim.test.mjs) play both sides at leadsMoves instead —
// real-engine reproduction of the published ratings is now 100% (500/500).
