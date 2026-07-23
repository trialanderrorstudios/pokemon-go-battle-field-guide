// Owned-instance damage-per-hit "breakpoint" math for the Raid Target counter
// card. Ports the same separately-rounded PvE damage formula this app's
// server side already uses for standardized raid DPS —
// src/pogo_encyclopedia/dps.py's move_damage(): floor(0.5 * power * attack /
// defense * stab * shadow * effectiveness) + 1 — so a level-up or weather
// change only ever changes the displayed damage when the game's own floor+1
// rounding would actually change it. A "breakpoint" is the next attacker
// level where that floor ticks up by one point of damage per hit.
//
// Boss defense is fixed at this release's level40-standard-defense100
// methodology assumption (data/curated/dps-methodology.json
// raidDps.assumptions.targetDefense — same 100.0 constant as dps.py's
// STANDARD_TARGET_DEFENSE) unless a release supplies its own value. This is
// the same assumption every other raid DPS number in this app already bakes
// in; callers must surface it as fine print rather than imply it predicts a
// specific boss's real defense stat.
import { cpMultiplier, instanceLevel } from "./instances.js";
import { effectivenessOf } from "./type-chart.js";
import { isTypeBoosted } from "./raid-target.js";

export const STANDARD_TARGET_DEFENSE = 100;
const MAX_LEVEL = 51;

// The exact per-hit damage formula, exported for hand-verification in tests.
// weatherBoosted applies the game's own +20% attack for a move whose type
// matches the CURRENT in-game weather — independent of raid-target.js's
// weather-boosted-CATCH logic, which only affects the boss's catch level/IV
// floor, not battle damage.
export function moveDamageAt({
  form, ivs, level, movePower, moveType, bossTypes,
  targetDefense = STANDARD_TARGET_DEFENSE, weatherBoosted = false,
}) {
  const attack = (form.base_attack + ivs.atk) * cpMultiplier(level);
  const stab = form.primary_type === moveType || form.secondary_type === moveType ? 1.2 : 1.0;
  const shadow = form.shadow ? 1.2 : 1.0;
  const weather = weatherBoosted ? 1.2 : 1.0;
  const effectiveness = effectivenessOf(moveType, bossTypes);
  return Math.floor((0.5 * movePower * attack / targetDefense) * stab * shadow * effectiveness * weather) + 1;
}

// Next level (in the game's half-level power-up steps) above currentLevel
// where this move's un-boosted damage-per-hit increases. null if none exists
// through Level 51 (the endgame ceiling) — no further power-up raises it.
function nextBreakpoint({ form, ivs, currentLevel, currentDamage, movePower, moveType, bossTypes, targetDefense }) {
  const startDoubled = Math.round(currentLevel * 2) + 1;
  for (let doubled = startDoubled; doubled <= MAX_LEVEL * 2; doubled += 1) {
    const level = doubled / 2;
    const damage = moveDamageAt({ form, ivs, level, movePower, moveType, bossTypes, targetDefense });
    if (damage > currentDamage) return { level, damage, gain: damage - currentDamage };
  }
  return null;
}

// Full breakpoint report for one move an owned detailed instance actually
// knows, against one boss's types. null when the move's PvE stats aren't in
// this release's move catalog (moveCatalog is raid-scoped — see moves.js —
// and doesn't cover every legal move a roster instance could be taught) so
// this never guesses at missing numbers.
export function moveBreakpointReport({
  form, instance, moveId, moveCatalog, bossTypes, weather, targetDefense = STANDARD_TARGET_DEFENSE,
}) {
  const entry = moveCatalog?.[moveId];
  if (!entry || entry.statsAvailable === false || !Number.isFinite(entry.power)) return null;
  const currentLevel = instanceLevel(form, instance);
  if (currentLevel === null) return null;
  const { power: movePower, moveType } = entry;
  const { ivs } = instance;
  const currentDamage = moveDamageAt({ form, ivs, level: currentLevel, movePower, moveType, bossTypes, targetDefense });
  const weatherBoosted = isTypeBoosted(weather, moveType);
  const weatherDamage = weatherBoosted
    ? moveDamageAt({
      form, ivs, level: currentLevel, movePower, moveType, bossTypes, targetDefense, weatherBoosted: true,
    })
    : currentDamage;
  return {
    moveId,
    moveType,
    currentLevel,
    currentDamage,
    weatherBoosted,
    weatherDamage,
    weatherGain: weatherDamage - currentDamage,
    nextBreakpoint: nextBreakpoint({
      form, ivs, currentLevel, currentDamage, movePower, moveType, bossTypes, targetDefense,
    }),
  };
}

// Every move-slot report for an owned detailed instance vs one boss: the
// instance's actual fast move plus each of its (1-2) actual charged moves —
// never the "optimal" moveset it might not know.
export function instanceBreakpointReports({ form, instance, moveCatalog, bossTypes, weather, targetDefense }) {
  if (!form || !instance) return [];
  const slots = [
    ...(instance.fastMove ? [["fast", instance.fastMove]] : []),
    ...(instance.chargedMoves ?? []).map((moveId) => ["charged", moveId]),
  ];
  return slots
    .map(([slot, moveId]) => {
      const report = moveBreakpointReport({ form, instance, moveId, moveCatalog, bossTypes, weather, targetDefense });
      return report ? { ...report, slot } : null;
    })
    .filter(Boolean);
}
