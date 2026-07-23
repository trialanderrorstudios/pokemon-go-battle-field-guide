// Roster gap analyzer (round 15) — composes existing machinery only:
//   coverage per attacking type    -> raid.json's ranked rows (raid-target.js
//                                      reads the same rows for its own counter
//                                      lanes), joined against the owned set
//   Build-Next candidates          -> candy-plan.js's existing evolution +
//                                      Candy math (candyPlanRows), never a
//                                      second evolution/cost engine
//   KEEP/INVEST tiebreak           -> triage.js's own verdicts
//   trainer-level honesty          -> raid-target.js's levelCapNote (the
//                                      ranking data assumes Level 40 stats)
//   boss counters                  -> currentBosses/currentEvents + the same
//                                      effectiveness() raid-target.js uses
// No new ranking, evolution, or cost math lives here.
import {
  ATTACK_TYPES, RANK_TIERS, effectiveness, levelCapNote,
} from "./raid-target.js";
import { candyPlanRows } from "./candy-plan.js";

// Same "solid meta pick" cutoff raid-target.js's own RANK_TIERS.solid uses
// for its beatability bands (positions 1-8 of Pokebattler's per-type top-15)
// — a lane only counts as covered once an owned form clears that bar.
const SOLID_RANK = RANK_TIERS.solid;

function ownedFormIdSet(roster = {}) {
  const ids = new Set(roster.ownedFormIds ?? []);
  for (const instance of roster.instances ?? []) if (instance?.formId) ids.add(instance.formId);
  return ids;
}

function bestOwnedRankByType(raids, owned) {
  const best = new Map();
  for (const lane of ["regular", "shadow"]) {
    for (const row of raids?.[lane] ?? []) {
      if (row.status !== "ranked" || !owned.has(row.formId)) continue;
      const current = best.get(row.attackingType);
      if (!current || row.rank < current.rank) best.set(row.attackingType, row);
    }
  }
  return best;
}

// One row per the game's attacking types: the best-ranked owned counter (if
// any) and whether that's a weak lane — no owned counter ranked solid-or-
// better in either raid lane. An empty roster is honestly weak everywhere.
export function typeCoverage({ raids, roster } = {}) {
  const owned = ownedFormIdSet(roster);
  const bestByType = bestOwnedRankByType(raids, owned);
  return ATTACK_TYPES.map((attackingType) => {
    const best = bestByType.get(attackingType) ?? null;
    return { attackingType, best, weak: !best || best.rank > SOLID_RANK };
  });
}

export function weakLanes(coverage) {
  return coverage.filter((row) => row.weak);
}

function rankFor(raids, formId, attackingType) {
  for (const lane of ["regular", "shadow"]) {
    for (const row of raids?.[lane] ?? []) {
      if (row.formId === formId && row.attackingType === attackingType && row.status === "ranked") return row;
    }
  }
  return null;
}

// formIds already flagged KEEP or INVEST by triage.js — used only as a
// tiebreak below (the coach already trusts these exact copies).
function keepOrInvestFormIds(triageResult) {
  const ids = new Set();
  for (const entry of triageResult?.entries ?? []) {
    if (entry.bucket === "KEEP" || entry.invest) ids.add(entry.formId);
  }
  return ids;
}

// Build-Next candidates for one weak attacking type: every owned form's
// evolution-Candy row (candy-plan.js, unchanged) whose evolved target is
// actually a solid-or-better ranked attacker of that type. Only owned
// Pokemon ever appear here — candyPlanRows() already never suggests a
// species the roster doesn't hold. `levelNote` is the same honest gate
// raid-target.js's own solo-counter check uses: the ranking data assumes
// Level 40 stats, so a trainer who can't reach Level 40 yet (trainer level
// below 30) gets that named, never a silently-wrong recommendation.
export function buildNextCandidates({
  attackingType, forms = {}, roster = {}, raids, candyInventory = {}, triageResult = null, trainerLevel = null,
} = {}) {
  const preferred = keepOrInvestFormIds(triageResult);
  const levelNote = levelCapNote(40, trainerLevel);
  return candyPlanRows({ forms, roster, candyInventory, raids })
    .filter((row) => row.status === "reachable")
    .map((row) => ({ ...row, rankRow: rankFor(raids, row.targetFormId, attackingType) }))
    .filter((row) => row.rankRow && row.rankRow.rank <= SOLID_RANK)
    .sort((left, right) => (left.rankRow.rank - right.rankRow.rank)
      || (Number(preferred.has(right.formId)) - Number(preferred.has(left.formId)))
      || (left.candyNeeded - right.candyNeeded))
    .map((row) => ({ ...row, levelNote }));
}

function bossTypesFor(formId, forms) {
  const form = forms?.[formId];
  return form ? [form.primary_type, form.secondary_type].filter(Boolean) : [];
}

// The single most useful weak type against a boss's types, or null if none
// of the roster's weak lanes actually hit it super effectively.
function bestWeakTypeForBoss(bossTypes, weakTypes) {
  let best = null;
  let bestEffectiveness = 1;
  for (const type of weakTypes) {
    const value = effectiveness(type, bossTypes[0], bossTypes[1]);
    if (value > bestEffectiveness) {
      bestEffectiveness = value;
      best = type;
    }
  }
  return best;
}

// Every current/upcoming boss (this week's rotation + any dated event
// carrying a boss formId) a weak lane leaves uncovered, keyed by bossFormId
// — the seam upcoming.js's gapByFormId param already expects, and what
// Today's checklist checks against. Empty when coverage is strong, never a
// guessed boss.
export function buildGapByFormId({
  coverage, currentBosses, currentEvents, forms = {},
} = {}) {
  const weakTypes = weakLanes(coverage).map((row) => row.attackingType);
  if (!weakTypes.length) return {};
  const formIds = new Set([
    ...(currentBosses?.bosses ?? []).map((boss) => boss.formId),
    ...(currentEvents?.events ?? []).map((event) => event.formId).filter(Boolean),
  ]);
  const gap = {};
  for (const formId of formIds) {
    const bossTypes = bossTypesFor(formId, forms);
    if (!bossTypes.length) continue;
    const weakType = bestWeakTypeForBoss(bossTypes, weakTypes);
    if (weakType) gap[formId] = { headline: `You lack strong ${weakType} counters`, href: "#buildnext" };
  }
  return gap;
}

// Current/upcoming bosses one attacking type actually counters — for the
// Build Next page's "this fixes ..." line under each weak lane.
export function bossesForType(attackingType, { currentBosses, currentEvents, forms = {} } = {}) {
  const seen = new Map();
  const add = (formId, fallbackName) => {
    if (!formId || seen.has(formId)) return;
    const bossTypes = bossTypesFor(formId, forms);
    if (bossTypes.length && effectiveness(attackingType, bossTypes[0], bossTypes[1]) > 1) {
      seen.set(formId, forms?.[formId]?.name ?? fallbackName ?? formId);
    }
  };
  for (const boss of currentBosses?.bosses ?? []) add(boss.formId);
  for (const event of currentEvents?.events ?? []) add(event.formId, event.name);
  return [...seen.entries()].map(([formId, name]) => ({ formId, name }));
}
