// Type mastery meters — per-attacking-type bench strength, so the roster
// reads as a set of 18 progress bars instead of one big list. Composes
// existing machinery only:
//   attacking types         -> raid-target.js's re-exported ATTACK_TYPES
//                               (type-chart.js's canonical 18-type list)
//   rank tiers               -> raid-target.js's own RANK_TIERS
//                               (elite/solid cutoffs, same bar every other
//                               coverage view uses)
//   owned-attacker matching -> the same regular+shadow ranked-row scan
//                               party-optimizer.js's bestRowForBoss and
//                               gap-analyzer.js's bestOwnedRankByType use
//   moveset match            -> party-optimizer.js's movesetMatches check;
//                               it isn't exported, so the one-line check is
//                               mirrored here rather than editing that file
//   masterfile-gap exclusion -> swap.js's/app.js's own form.source check —
//                               gap-fill forms carry no move data
// No new type chart, rank data, or move data lives here.
import { ATTACK_TYPES, RANK_TIERS } from "./raid-target.js";

function ownedFormIdSet(roster = {}) {
  const ids = new Set(roster.ownedFormIds ?? []);
  for (const instance of roster.instances ?? []) if (instance?.formId) ids.add(instance.formId);
  return ids;
}

function movesetMatches(instance, row) {
  return instance?.fastMove === row.optimalFastMove
    && (instance?.chargedMoves ?? []).includes(row.optimalChargedMove);
}

function ownsWithMoveset(instances, formId, row) {
  return instances.some((instance) => instance.formId === formId && movesetMatches(instance, row));
}

// Every ranked row of this attacking type across both raid lanes, best rank
// first (ties broken by formId for a stable order).
function rankedRowsForType(raidRows, type) {
  return [...(raidRows?.regular ?? []), ...(raidRows?.shadow ?? [])]
    .filter((row) => row.status === "ranked" && row.attackingType === type)
    .sort((left, right) => left.rank - right.rank || left.formId.localeCompare(right.formId));
}

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Band from real bench strength: nothing owned at all -> empty; owns a form
// but never the row's optimal moveset -> thin; owns the right moveset but
// only at fringe rank (9-15) -> also thin (a moveset match at fringe rank
// still isn't a real meta pick); one solid-or-better (rank <= 8) build -> B;
// two-plus with the best at solid-or-better -> A; three-plus with the best
// at elite (rank <= 3) -> S.
function bandFor(ownedAnyCount, benchCount, bestBenchRank) {
  if (ownedAnyCount === 0) return "empty";
  if (benchCount === 0) return "thin";
  if (bestBenchRank <= RANK_TIERS.elite && benchCount >= 3) return "S";
  if (bestBenchRank <= RANK_TIERS.solid && benchCount >= 2) return "A";
  if (bestBenchRank <= RANK_TIERS.solid) return "B";
  return "thin";
}

function bandLabelFor(band, benchCount, ownedAnyCount) {
  if (band === "empty") return "No ranked attacker of this type owned.";
  if (band === "thin" && benchCount === 0) {
    return `Owns ${pluralize(ownedAnyCount, "ranked form")}, but not with the optimal moveset.`;
  }
  if (band === "thin") return `${pluralize(benchCount, "fringe-rank attacker")} with the right moveset — no solid pick yet.`;
  if (band === "B") return `${pluralize(benchCount, "solid attacker")} with ${benchCount === 1 ? "its" : "their"} best moveset.`;
  if (band === "A") return `${pluralize(benchCount, "top-15 attacker")} with their best movesets.`;
  return `${pluralize(benchCount, "top-15 attacker")} with their best movesets, including a top-3 pick.`;
}

// bestMatched: best-rank row among owned forms actually running that row's
// optimal moveset. bestAny: best-rank row among owned forms regardless of
// moveset (fallback display when nothing matches). benchCount: how many
// distinct owned forms clear the moveset bar — the number the band is built
// from.
function bestOwnedFor(rows, instances, owned) {
  let bestMatched = null;
  let bestAny = null;
  const matchedFormIds = new Set();
  for (const row of rows) {
    if (!owned.has(row.formId)) continue;
    if (!bestAny) bestAny = row; // rows are pre-sorted by rank
    if (!matchedFormIds.has(row.formId) && ownsWithMoveset(instances, row.formId, row)) {
      matchedFormIds.add(row.formId);
      if (!bestMatched) bestMatched = row;
    }
  }
  return { bestMatched, bestAny, benchCount: matchedFormIds.size };
}

// Highest-ranked NOT-owned attacker of this type, skipping masterfile-gap
// source forms (name-only placeholders with no move data to build toward).
function nextBuildFor(rows, forms, owned) {
  const row = rows.find((candidate) => !owned.has(candidate.formId)
    && forms?.[candidate.formId]
    && forms[candidate.formId].source !== "masterfile-gap");
  if (!row) return null;
  return {
    formId: row.formId,
    name: forms[row.formId]?.name ?? row.pokemon,
    why: `#${row.rank} ranked ${row.attackingType} attacker, not yet in your roster.`,
  };
}

export function computeTypeMastery({ roster = {}, forms = {}, raidRows = {} } = {}) {
  const owned = ownedFormIdSet(roster);
  const instances = roster.instances ?? [];
  return ATTACK_TYPES.map((type) => {
    const rows = rankedRowsForType(raidRows, type);
    const { bestMatched, bestAny, benchCount } = bestOwnedFor(rows, instances, owned);
    const ownedAnyCount = new Set(rows.filter((row) => owned.has(row.formId)).map((row) => row.formId)).size;
    const chosen = bestMatched ?? bestAny;
    const bestOwned = chosen ? {
      formId: chosen.formId,
      name: forms?.[chosen.formId]?.name ?? chosen.pokemon,
      ...(bestMatched ? { moveset: `${bestMatched.optimalFastMove}/${bestMatched.optimalChargedMove}` } : {}),
    } : null;
    const band = bandFor(ownedAnyCount, benchCount, bestMatched?.rank ?? Infinity);
    return {
      type,
      band,
      bandLabel: bandLabelFor(band, benchCount, ownedAnyCount),
      bestOwned,
      benchCount,
      nextBuild: nextBuildFor(rows, forms, owned),
    };
  });
}

// Weakest N types by band severity (empty worst, S best), ties broken by
// type name — a compact, deterministic slice for a Home summary line.
const BAND_SEVERITY = {
  empty: 0, thin: 1, B: 2, A: 3, S: 4,
};

export function weakestTypes(mastery, count = 2) {
  return [...mastery]
    .sort((left, right) => BAND_SEVERITY[left.band] - BAND_SEVERITY[right.band] || left.type.localeCompare(right.type))
    .slice(0, count);
}
