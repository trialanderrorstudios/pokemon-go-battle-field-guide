// Anti-meta type-coverage HEURISTIC. Composes the existing type-chart module
// (never forks effectiveness math): "what typing should I bring against the
// current meta" using ONLY primary/secondary types. It ignores bulk, moves,
// shields, and Charge Move Pressure — see HEURISTIC_LABEL, which every
// render of this data must show alongside it. Typing alone is not a real
// matchup verdict.
import { ATTACK_TYPES, weaknessesOf } from "./type-chart.js";

export const DEFAULT_META_SIZE = 20;

export const HEURISTIC_LABEL = "Type heuristic only — ignores bulk, moves, shields, and Charge "
  + "Move Pressure (CMP). Typing alone is not a real matchup verdict against a specific Pokémon.";

function formTypes(row, forms) {
  const form = forms?.[row.formId];
  return [form?.primary_type, form?.secondary_type].filter(Boolean);
}

function topByRank(rows, topN) {
  return (rows ?? [])
    .slice()
    .sort((left, right) => (left.rank ?? Infinity) - (right.rank ?? Infinity))
    .slice(0, topN);
}

function shareOf(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

// Step 1: the meta group's aggregate typing — how often each type appears
// (as a primary or secondary type) across the top-N ranked Pokémon.
export function metaTypeFrequency(rows, forms, topN = DEFAULT_META_SIZE) {
  const metaRows = topByRank(rows, topN);
  const counts = new Map();
  for (const row of metaRows) {
    for (const type of formTypes(row, forms)) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, share: shareOf(count, metaRows.length) }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

// Step 2a: "types that pressure the current meta" — for each meta member,
// which attacking types hit its typing for more than neutral damage
// (type-chart.js's weaknessesOf), aggregated by how many meta members each
// attacking type threatens. Ranked highest-pressure first.
export function pressureTypes(rows, forms, topN = DEFAULT_META_SIZE) {
  const metaRows = topByRank(rows, topN);
  const counts = new Map(ATTACK_TYPES.map((type) => [type, 0]));
  for (const row of metaRows) {
    const types = formTypes(row, forms);
    if (!types.length) continue;
    for (const { type } of weaknessesOf(types)) counts.set(type, counts.get(type) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({ type, count, share: shareOf(count, metaRows.length) }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

// Step 2b: rank candidate attackers by how much of the meta's aggregate
// weakness their OWN typing (STAB) lines up with — sum of each matched
// pressure type's count. Ties break by published rank, then name.
export function rankCandidateAttackers(candidateRows, forms, pressure, { limit = 10 } = {}) {
  const pressureByType = new Map(pressure.map((entry) => [entry.type, entry.count]));
  return (candidateRows ?? [])
    .map((row) => {
      const types = formTypes(row, forms);
      const matchedTypes = types.filter((type) => pressureByType.has(type));
      const score = matchedTypes.reduce((sum, type) => sum + pressureByType.get(type), 0);
      return { formId: row.formId, pokemon: row.pokemon, rank: row.rank, types, matchedTypes, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score
      || (left.rank ?? Infinity) - (right.rank ?? Infinity)
      || left.pokemon.localeCompare(right.pokemon))
    .slice(0, limit);
}

// One-call composition for a view layer: meta typing, ranked pressure types,
// ranked candidate attackers, and the mandatory heuristic label.
export function computeMetaCoverage({ rows = [], forms = {}, topN = DEFAULT_META_SIZE, candidateLimit = 10 } = {}) {
  const typeFrequency = metaTypeFrequency(rows, forms, topN);
  const pressure = pressureTypes(rows, forms, topN);
  const candidates = rankCandidateAttackers(rows, forms, pressure, { limit: candidateLimit });
  return {
    topN: Math.min(topN, (rows ?? []).length),
    typeFrequency,
    pressure,
    candidates,
    heuristicLabel: HEURISTIC_LABEL,
  };
}
