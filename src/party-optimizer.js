// Party optimizer (answer-engine stage 1) — "who from my roster should I bring to this
// boss?" Composes existing machinery only, no forked math:
//   boss types + weaknesses -> raid-target.js's effectiveness()/ATTACK_TYPES, and the
//                               raid-target tool data's own bossTypes field (falling back
//                               to species typing exactly like raid-target.js's buildRaidPlan
//                               does when a boss isn't in that tool's target list)
//   best owned row per boss -> same regular+shadow-lane scan pattern powerup-planner.js's
//                               bestRelevantRow and gap-analyzer.js's bestOwnedRankByType use
//   level scaling            -> instances.js's cpMultiplier/instanceLevel, the exact
//                               cpMultiplier(target)/cpMultiplier(current) ratio
//                               powerup-planner.js's damageGainPercent already uses
//                               (assumed row level -> instance's actual level, not a new curve)
//   "top tier" cutoffs        -> raid-target.js's own RANK_TIERS
// No new DPS table, CPM table, or type chart lives here.
import { ATTACK_TYPES, RANK_TIERS, effectiveness } from "./raid-target.js";
import { bestInstanceForForm, cpMultiplier, instanceLevel } from "./instances.js";

const PARTY_SIZE = 6; // a raid lobby only fits 6 Pokémon — same constant raid-target.js's OWNED_TEAM_SIZE uses

// Every ranked row's DPS is a Level 40 / 15 attack IV baseline (data/curated/dps-methodology.json
// raidDps.assumptions.level) — used only as the fallback when a row is missing its own `level`.
const ASSUMED_ROW_LEVEL = 40;

// ponytail: weather isn't folded into the score. Ranked-row DPS is a neutral-weather baseline
// (dps-methodology.json), and a real weather boost only exists in breakpoints.js's per-move
// damage formula — pulling that in here would mean forking a second damage calc per candidate
// instead of composing the ranked-row DPS the spec asks for. `weather`/`trainerLevel` are
// accepted in the signature for a future stage but not read below.

function bossTypesFor(targetFormId, forms, data) {
  const tool = data?.raidTargetTool?.targets ? data.raidTargetTool : data?.raidTargetTool?.raidTargetTool ?? {};
  const target = (tool.targets ?? []).find((row) => row.bossFormId === targetFormId);
  return target?.bossTypes ?? [forms?.[targetFormId]?.primary_type, forms?.[targetFormId]?.secondary_type].filter(Boolean);
}

function bossWeaknessTypes(bossTypes) {
  return ATTACK_TYPES.filter((type) => effectiveness(type, bossTypes[0], bossTypes[1]) > 1);
}

// This form's best (lowest-rank) ranked raid-attacker row among the attacking types that
// actually hit this boss's weaknesses — same regular+shadow scan powerup-planner.js's
// bestRelevantRow uses, scoped to one boss instead of the current rotation.
function bestRowForBoss(formId, raids, weaknessTypes) {
  let best = null;
  for (const lane of ["regular", "shadow"]) {
    for (const row of raids?.[lane] ?? []) {
      if (row.status !== "ranked" || row.formId !== formId || !weaknessTypes.includes(row.attackingType)) continue;
      if (!best || row.rank < best.rank) best = row;
    }
  }
  return best;
}

function tierBucket(multiplier) {
  if (multiplier >= 2.56) return "double weakness";
  if (multiplier >= 1.6) return "super effective";
  return "neutral";
}

const BUCKET_KEY = { "double weakness": "doubleWeakness", "super effective": "superEffective", neutral: "neutral" };

function movesetMatches(instance, row) {
  return instance?.fastMove === row.optimalFastMove
    && (instance?.chargedMoves ?? []).includes(row.optimalChargedMove);
}

// One owned instance's scored contribution against this boss, or null when it can't be
// honestly scored (no derivable level, or the row has no DPS number for the bucket used).
function scoreCandidate(instance, form, row, bossTypes) {
  const level = instanceLevel(form, instance);
  if (level === null) return null;

  const multiplier = effectiveness(row.attackingType, bossTypes[0], bossTypes[1]);
  const impliedBucket = tierBucket(multiplier);
  const matches = movesetMatches(instance, row);
  // A moveset that isn't the row's optimal same-type moveset can't land that row's optimal-tier
  // damage, so it's scored at the neutral bucket regardless of type-effectiveness tier.
  const bucket = matches ? impliedBucket : "neutral";
  const dpsValue = row.dps?.[BUCKET_KEY[bucket]];
  if (!Number.isFinite(dpsValue)) return null;

  const rowLevel = Number.isFinite(row.level) ? row.level : ASSUMED_ROW_LEVEL;
  const cpmRatio = cpMultiplier(level) / cpMultiplier(rowLevel);
  const score = dpsValue * cpmRatio;

  const moveNote = matches
    ? ""
    : ` Different moveset than this row's optimal (${row.optimalFastMove}/${row.optimalChargedMove}) — scored at neutral DPS instead of ${impliedBucket}.`;
  const why = `${row.pokemon}'s #${row.rank} ${row.attackingType} row: ${dpsValue.toFixed(1)} DPS (${bucket}) at the row's assumed Level ${rowLevel}, scaled to your Level ${level} instance (${Math.round(cpmRatio * 100)}%).${moveNote}`;

  return { row, score, why };
}

function estimateFor(partyEntries) {
  if (!partyEntries.length) {
    return { label: "No owned counters ranked for this boss yet — can't estimate.", relobbies: null, confidence: "unknown" };
  }
  const eliteShare = partyEntries.filter((entry) => entry.row.rank <= RANK_TIERS.elite).length / partyEntries.length;
  const solidShare = partyEntries.filter((entry) => entry.row.rank <= RANK_TIERS.solid).length / partyEntries.length;
  const band = eliteShare >= 0.5 ? "comfortable" : solidShare >= 0.5 ? "tight" : "likely-relobby";
  const headline = {
    comfortable: "Comfortable",
    tight: "Tight",
    "likely-relobby": "Likely relobby",
  }[band];
  return {
    // Rough guide from party depth (Pokebattler rank), not a battle simulation — a real relobby
    // count needs an actual damage/HP sim (stage 2), which shipped data doesn't give us.
    label: `${headline} — rough guide from party depth, not a simulation.`,
    relobbies: null,
    confidence: band,
  };
}

export function buildParty({
  targetFormId, roster, forms, raids, data, trainerLevel, weather,
} = {}) {
  if (!forms?.[targetFormId]) return null;
  const bossTypes = bossTypesFor(targetFormId, forms, data);
  if (!bossTypes.length) return null;
  const weaknessTypes = bossWeaknessTypes(bossTypes);

  const instances = roster?.instances ?? [];
  const formIds = new Set(instances.map((instance) => instance.formId));

  const candidates = [];
  for (const formId of formIds) {
    const form = forms?.[formId];
    const row = bestRowForBoss(formId, raids, weaknessTypes);
    if (!form || !row) continue;
    // Score EVERY copy and keep the best (review catch: pre-picking by CP
    // chose a higher-CP wrong-moveset copy over a lower-level copy running
    // the optimal set — the exact call this engine exists to get right).
    let best = null;
    for (const instance of instances) {
      if (instance.formId !== formId) continue;
      const scored = scoreCandidate(instance, form, row, bossTypes);
      if (scored && (!best || scored.score > best.score)) best = { instance, form, ...scored };
    }
    if (best) candidates.push(best);
  }
  candidates.sort((left, right) => right.score - left.score || left.row.formId.localeCompare(right.row.formId));

  const partyEntries = candidates.slice(0, PARTY_SIZE);
  const party = partyEntries.map(({ instance, form, row, score, why }) => ({
    instance, form, role: `${row.attackingType} attacker`, score: Math.round(score * 100) / 100, why,
  }));

  // Coverage counts EVERY ranked row an owned form has (review catch: a
  // dual-coverage Rayquaza covered only its single best type, so gaps
  // claimed its other role was unowned — and then recommended Rayquaza).
  const allRows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])];
  const coveredTypes = new Set(allRows
    .filter((row) => row.status === "ranked" && formIds.has(row.formId) && weaknessTypes.includes(row.attackingType))
    .map((row) => row.attackingType));
  const gaps = [];
  for (const type of weaknessTypes) {
    if (coveredTypes.has(type)) continue;
    const best = allRows
      .filter((row) => row.status === "ranked" && row.attackingType === type && !formIds.has(row.formId))
      .sort((left, right) => left.rank - right.rank)[0];
    if (best) gaps.push(`No ranked ${type} attacker owned — ${best.pokemon} would fill this.`);
  }

  return { party, estimate: estimateFor(partyEntries), gaps };
}
