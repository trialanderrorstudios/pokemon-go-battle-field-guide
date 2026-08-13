// Dupe Advisor — "which of my duplicate copies of this species should I keep?"
// Pure. Groups roster instances that share a formId (count >= 2) and ranks
// them with a keep/transfer verdict, so the roster view can point at the
// clone worth transferring instead of the collector guessing by eye.
//
// Ranking signals, highest priority first:
//   1. Shiny/Lucky — real auto-keep (every shiny and every lucky copy is
//      kept regardless of its stats; a collector never transfers those).
//   2. IV sum (higher wins).
//   3. Moves matching the form's known-optimal moveset, IF the caller
//      supplies one via `optimalMoves`. This module deliberately does not
//      reimplement dex.js's offenseRoles/gymVerdict CP/DPS ranking math —
//      the caller (whoever already has that raid/gym data loaded) precomputes
//      the single best fastMove/chargedMoves per formId and passes it in.
//      Absent for a formId = this signal is skipped, never fabricated.
//   4. sizeClass xxs/xxl (showcase-worthy sizes).
//   5. buddyLevel (higher tier wins).
//   6. addedAt — newest copy wins remaining ties.
// Only the shiny/lucky signal is a true "every matching copy is kept" rule;
// signals 2-6 are a single sequential comparator that picks ONE best copy
// among the non-auto-keep instances in the group — every other non-auto copy
// gets keep:false. This guarantees the group's best copy (or its shinies/
// luckies) is always kept, never every copy marked transferable.
import { BUDDY_LEVEL_ORDER } from "./buddy.js";

const SHOWCASE_SIZES = new Set(["xxs", "xxl"]);

function ivSum(ivs) {
  return (ivs?.atk ?? 0) + (ivs?.def ?? 0) + (ivs?.sta ?? 0);
}

function isAutoKeep(instance) {
  return Boolean(instance.isShiny || instance.isLucky);
}

function matchesOptimalMoves(instance, optimal) {
  if (!optimal) return false;
  if (optimal.fastMove && instance.fastMove !== optimal.fastMove) return false;
  if (optimal.chargedMoves?.length) {
    return (instance.chargedMoves ?? []).some((move) => optimal.chargedMoves.includes(move));
  }
  return Boolean(optimal.fastMove);
}

function buddyRank(buddyLevel) {
  return BUDDY_LEVEL_ORDER.indexOf(buddyLevel); // -1 when unset — ranks lowest
}

function compareInstances(a, b, optimal) {
  const ivDiff = ivSum(b.ivs) - ivSum(a.ivs);
  if (ivDiff !== 0) return ivDiff;
  const matchDiff = (matchesOptimalMoves(b, optimal) ? 1 : 0) - (matchesOptimalMoves(a, optimal) ? 1 : 0);
  if (matchDiff !== 0) return matchDiff;
  const sizeDiff = (SHOWCASE_SIZES.has(b.sizeClass) ? 1 : 0) - (SHOWCASE_SIZES.has(a.sizeClass) ? 1 : 0);
  if (sizeDiff !== 0) return sizeDiff;
  const buddyDiff = buddyRank(b.buddyLevel) - buddyRank(a.buddyLevel);
  if (buddyDiff !== 0) return buddyDiff;
  return (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0);
}

function autoKeepWhy(instance) {
  const reasons = [];
  if (instance.isShiny) reasons.push("Shiny");
  if (instance.isLucky) reasons.push("Lucky");
  return `${reasons.join(" & ")} — always a keeper.`;
}

function keeperWhy(instance, matches) {
  const ivs = instance.ivs;
  return `Best in this group — ${ivs.atk}/${ivs.def}/${ivs.sta} IVs${matches ? " with the optimal set" : ""}.`;
}

function outclassedWhy(winner, winnerMatches) {
  if (!winner) return "Outclassed by another copy in this group.";
  const ivs = winner.ivs;
  return `Outclassed by your ${ivs.atk}/${ivs.def}/${ivs.sta}${winnerMatches ? " with the optimal set" : ""} copy.`;
}

// dupeGroups({ roster, forms, optimalMoves }) -> [{ formId, form, instances:
// [{ instance, verdict: { keep, why } }] }], one entry per formId that has
// 2+ roster instances. optimalMoves is optional: { [formId]: { fastMove,
// chargedMoves } } precomputed by the caller (see module doc above).
export function dupeGroups({ roster, forms = {}, optimalMoves = {} } = {}) {
  const instances = Array.isArray(roster?.instances) ? roster.instances : [];
  const byForm = new Map();
  for (const instance of instances) {
    if (!byForm.has(instance.formId)) byForm.set(instance.formId, []);
    byForm.get(instance.formId).push(instance);
  }

  const groups = [];
  for (const [formId, group] of byForm) {
    if (group.length < 2) continue;
    const optimal = optimalMoves[formId];
    const rest = group.filter((instance) => !isAutoKeep(instance));
    const winner = [...rest].sort((a, b) => compareInstances(a, b, optimal))[0] ?? null;
    const winnerMatches = winner ? matchesOptimalMoves(winner, optimal) : false;

    const rows = group.map((instance) => {
      if (isAutoKeep(instance)) return { instance, verdict: { keep: true, why: autoKeepWhy(instance) } };
      if (instance === winner) {
        return { instance, verdict: { keep: true, why: keeperWhy(instance, winnerMatches) } };
      }
      return { instance, verdict: { keep: false, why: outclassedWhy(winner, winnerMatches) } };
    });
    rows.sort((a, b) => (b.verdict.keep ? 1 : 0) - (a.verdict.keep ? 1 : 0));

    groups.push({ formId, form: forms[formId] ?? null, instances: rows });
  }
  return groups;
}
