// Power-Up Planner (campaign item 6) — pure. Composes existing machinery only:
//   cost math      -> raid-target.js's powerUpCost/xlPowerUpCost (never a forked cost table)
//   level math      -> instances.js's instanceLevel/cpMultiplier (never a forked CPM table)
//   relevance       -> raid-target.js's effectiveness()/ATTACK_TYPES, same primitive
//                      views/home.js's private topWeaknesses() uses, just unbounded here
//   reachability    -> raid-target.js's levelCapNote(), the shared root-cause check its
//                      own comment names for "every invest/planner surface"
// No new ranking, cost, or CPM math lives here.
import {
  ATTACK_TYPES, effectiveness, levelCapNote, powerUpCost, xlCandyUnlocked, xlPowerUpCost,
} from "./raid-target.js";
import { cpMultiplier, instanceLevel } from "./instances.js";

function bossTypesFor(formId, forms) {
  const form = forms?.[formId];
  return form ? [form.primary_type, form.secondary_type].filter(Boolean) : [];
}

// Every attacking type a boss is weak to (effectiveness > 1) — unbounded,
// unlike home.js's UI-display topWeaknesses() which slices to 4.
function bossWeaknessTypes(bossTypes) {
  return ATTACK_TYPES.filter((type) => effectiveness(type, bossTypes[0], bossTypes[1]) > 1);
}

// The union of every current rotation boss's weakness types — the attacking
// types a powered-up Pokemon would actually get brought for right now.
function relevantAttackingTypes(currentBosses, forms) {
  const types = new Set();
  for (const boss of currentBosses?.bosses ?? []) {
    for (const type of bossWeaknessTypes(bossTypesFor(boss.formId, forms))) types.add(type);
  }
  return types;
}

// This owned form's best (lowest-rank) ranked raid-attacker row among the
// current rotation's relevant attacking types, regular or shadow — or null
// if it isn't a row a trainer would actually bring right now.
function bestRelevantRow(formId, raids, relevantTypes) {
  let best = null;
  for (const lane of ["regular", "shadow"]) {
    for (const row of raids?.[lane] ?? []) {
      if (row.status !== "ranked" || row.formId !== formId || !relevantTypes.has(row.attackingType)) continue;
      if (!best || row.rank < best.rank) best = row;
    }
  }
  return best;
}

// Target level rule (stated per the task, not derived): the next meaningful
// power-up step is +5 levels capped at 40 for a trainer who can't spend XL
// Candy yet; once XL Candy is unlocked (trainer level 31+, xlCandyUnlocked)
// the next meaningful step is the Level 50 endgame ceiling outright.
const NON_XL_STEP = 5;
const NON_XL_CAP = 40;
const XL_TARGET_LEVEL = 50;

function targetLevelFor(currentLevel, trainerLevel) {
  return xlCandyUnlocked(trainerLevel)
    ? XL_TARGET_LEVEL
    : Math.min(currentLevel + NON_XL_STEP, NON_XL_CAP);
}

// Total Candy + Stardust from currentLevel to targetLevel, reusing
// powerUpCost (levels <=40) and — only when the target crosses into the XL
// band — xlPowerUpCost for the 40-50 segment, shadow-multiplied there (the
// only tier table that carries the shadow surcharge). Never forks either table.
function costFor(currentLevel, targetLevel, shadow) {
  if (targetLevel <= 40) return powerUpCost(currentLevel, targetLevel);
  const below = currentLevel < 40 ? powerUpCost(currentLevel, 40) : { candy: 0, stardust: 0 };
  const above = xlPowerUpCost(Math.max(currentLevel, 40), targetLevel, shadow);
  return { candy: below.candy + above.candy, stardust: below.stardust + above.stardust };
}

// ESTIMATE: damage scales with attack stat * cpm; attack stat (base + IV) is
// fixed for a given instance, so the ratio of cpm(targetLevel)/cpm(currentLevel)
// approximates the relative damage gain. Deliberately does not fold in move
// breakpoints (a real damage change can jump in steps the raw ratio misses).
function damageGainPercent(currentLevel, targetLevel) {
  const ratio = cpMultiplier(targetLevel) / cpMultiplier(currentLevel);
  return Math.round((ratio - 1) * 1000) / 10;
}

export function powerUpPlan({
  roster = null, forms = {}, raids = null, currentBosses = null, trainerLevel = null,
} = {}) {
  const instances = roster?.instances ?? [];
  if (!instances.length) return { rows: [], excludedNoLevelCount: 0, hasRoster: false };

  const relevantTypes = relevantAttackingTypes(currentBosses, forms);
  const rows = [];
  let excludedNoLevelCount = 0;

  for (const instance of instances) {
    const row = bestRelevantRow(instance.formId, raids, relevantTypes);
    if (!row) continue; // not something this rotation would actually bring
    const currentLevel = instanceLevel(forms?.[instance.formId], instance);
    if (currentLevel === null) { excludedNoLevelCount += 1; continue; }
    const targetLevel = targetLevelFor(currentLevel, trainerLevel);
    if (targetLevel <= currentLevel) continue; // already at (or past) the next meaningful step

    const { candy, stardust } = costFor(currentLevel, targetLevel, Boolean(row.shadow));
    const gainPercent = damageGainPercent(currentLevel, targetLevel);
    const gainLabel = `~${gainPercent}% more damage — estimated from the CP-multiplier curve`;

    rows.push({
      instance,
      formId: instance.formId,
      pokemon: forms?.[instance.formId]?.name ?? row.pokemon ?? instance.formId,
      currentLevel,
      targetLevel,
      dustCost: stardust,
      candyCost: candy,
      damageGainPercent: gainPercent,
      why: gainLabel,
      levelCapNote: levelCapNote(targetLevel, trainerLevel),
      valueDensity: stardust > 0 ? gainPercent / (stardust / 1000) : gainPercent,
    });
  }

  // Rank by damage gained per 1000 Stardust (value density), best first.
  rows.sort((left, right) => (right.valueDensity - left.valueDensity)
    || String(left.formId).localeCompare(String(right.formId)));

  return { rows, excludedNoLevelCount, hasRoster: true };
}
