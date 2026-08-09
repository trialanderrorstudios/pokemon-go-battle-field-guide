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


// The Coach is the computed lane (gym_ranking.py's whole point is 50 ranked
// defenders, not the hand-typed 12), so this maps row.tier — the computed
// S/A/B/C band — not row.curatedTier, which only exists for the curated subset
// and would silently drop every non-curated ranked defender back to undefined.
export function defenderPoolFromRanking(gym) {
  if (!gym?.defenderRanking?.length) return gym?.defenders ?? [];
  const pool = gym.defenderRanking.map((row) => ({ formId: row.formId, defenseTier: row.tier }));
  // Shadows moved out of defenderRanking into their own shadowDefenderRanking
  // list (same Blissey=100 score scale, own S/A/B/C tier) — union them in or
  // the Coach can recommend zero shadows, including ones the app itself calls
  // out as strong (e.g. Shadow Steelix reaches rank 17 with a Charged TM).
  // isShadow lets any consumer of the pool tell a shadow row apart without
  // re-deriving it from the formId suffix or a forms[] lookup.
  for (const row of gym.shadowDefenderRanking ?? []) {
    pool.push({ formId: row.formId, defenseTier: row.tier, isShadow: true });
  }
  // Union in curated defenders the ranking's cut (Shuckle is curated B-tier
  // but unranked): ranking-only silently dropped them, so a reader owning one
  // got no Coach suggestion at all — the leaderboard drop-form default came
  // back empty instead of falling to their next defender. Curated rows keep
  // their hand-graded defenseTier; it is the only tier they have.
  const ranked = new Set(pool.map((row) => row.formId));
  for (const row of gym.defenders ?? []) {
    if (!ranked.has(row.formId)) pool.push(row);
  }
  return pool;
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
