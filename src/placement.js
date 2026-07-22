import { ATTACK_TYPES, effectivenessOf } from "./type-chart.js";


function effectiveness(attackingType, form) {
  return effectivenessOf(attackingType, [form.primary_type, form.secondary_type]);
}


function weaknesses(form) {
  return new Set(ATTACK_TYPES.filter((attackingType) => effectiveness(attackingType, form) > 1));
}


function lineupWarnings(lineup) {
  const warnings = [];
  for (let index = 0; index < lineup.length - 1; index += 1) {
    const first = lineup[index];
    const second = lineup[index + 1];
    const secondWeaknesses = weaknesses(second);
    const common = [...weaknesses(first)].filter((type) => secondWeaknesses.has(type)).sort();
    if (common.length) {
      warnings.push(`${first.name} → ${second.name} repeats ${common.join(", ")} weakness; one counter can continue the sweep.`);
    }
    if (common.includes("Fighting")) {
      warnings.push(`Shared Fighting warning: ${first.name} and ${second.name} are consecutive Fighting targets. Insert a fighter punisher.`);
    }
  }
  return warnings;
}


function scoreCandidate(defender, candidate, lineup, weights) {
  const candidateWeaknesses = weaknesses(candidate);
  const counts = Object.fromEntries(ATTACK_TYPES.map((type) => [
    type,
    lineup.reduce((count, form) => count + (weaknesses(form).has(type) ? 1 : 0), 0),
  ]));
  let score = Number(weights.tier[String(defender.defenseTier ?? "C")] ?? 52);
  score += Math.min(candidate.base_defense / 20, 15) + Math.min(candidate.base_stamina / 30, 15);
  const repeated = [...candidateWeaknesses].filter((type) => counts[type]).sort();
  score -= repeated.reduce((penalty, type) => penalty + counts[type] * weights.sharedWeaknessPenalty, 0);
  const previousWeaknesses = lineup.length ? weaknesses(lineup.at(-1)) : new Set();
  const adjacent = [...candidateWeaknesses].filter((type) => previousWeaknesses.has(type)).sort();
  score -= adjacent.length * weights.adjacentWeaknessPenalty;
  const common = ATTACK_TYPES.filter((type) => counts[type] >= 2);
  const resistsCommon = common.filter((type) => effectiveness(type, candidate) < 1).sort();
  score += resistsCommon.length * weights.commonWeaknessResistanceBonus;
  if (counts.Fighting >= 2 && effectiveness("Fighting", candidate) < 1) {
    score += weights.fightingChainBreakBonus;
  }
  const reasons = [`${defender.defenseTier ?? "C"}-tier defender value`];
  if (resistsCommon.length) reasons.push(`resists repeated ${resistsCommon.join("/")}`);
  if (repeated.length) reasons.push(`penalized for sharing ${repeated.join("/")}`);
  if (adjacent.length) reasons.push(`adjacent weakness overlap: ${adjacent.join("/")}`);
  if (!lineup.length) reasons.push("strong standalone opening placement");
  return {
    formId: candidate.form_id,
    pokemon: candidate.name,
    score: Math.round((score + Number.EPSILON) * 100) / 100,
    rationale: `${reasons.join("; ")}.`,
    weaknesses: [...candidateWeaknesses].sort(),
    resistsCommon,
  };
}


export function scorePlacement({
  lineupFormIds = [], ownedFormIds = [], defenderRows = [], forms = {}, weights,
} = {}) {
  if (!weights?.tier) throw new TypeError("Canonical placement weights are required.");
  const lineup = lineupFormIds.filter((formId) => forms[formId]).map((formId) => forms[formId]);
  const usedSpecies = new Set(lineup.map((form) => form.dex));
  const owned = new Set(ownedFormIds);
  const all = [];
  for (const defender of defenderRows) {
    const candidate = forms[defender?.formId];
    if (!candidate || usedSpecies.has(candidate.dex)) continue;
    all.push(scoreCandidate(defender, candidate, lineup, weights));
  }
  all.sort((left, right) => right.score - left.score || left.formId.localeCompare(right.formId));
  const ownedAlternatives = all.filter((candidate) => owned.has(candidate.formId));
  return {
    lineup: [...lineupFormIds],
    lineupWarnings: lineupWarnings(lineup),
    bestOwned: ownedAlternatives[0] ?? null,
    bestOverall: all[0] ?? null,
    ownedAlternatives,
    overallAlternatives: all,
    weights: structuredClone(weights),
  };
}
