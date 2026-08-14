// Trade Planner — pairs roster content worth offering in a trade with saved
// friends. Pure. Reuses purge-string.js's legendary/mythical/trade-value tag
// signal for what makes a species desirable trade bait, and dupe-advisor.js's
// keep/release verdicts for which duplicate detailed copies are safe to
// offer (same "you already have a better one" reasoning, just relabeled for
// trade context instead of transfer context).
//
// Deliberately NOT included, and why:
//   - Catch-date/age-based bait reasoning (e.g. "old enough to force a
//     guaranteed Lucky"). Roster instances only record addedAt — the date
//     this app's entry was created — not when the Pokémon was actually
//     caught in-game (see lucky-advisor.js's caughtYear, which is re-entered
//     per lucky-advice check and deliberately never persisted). Faking catch
//     age from addedAt would be dishonest, so it's left out entirely rather
//     than approximated.
//   - Any friendship-level-based odds/cost claim. friend-codes.js's saved
//     friend entries are only { id, name, code } — this app has no way to
//     read in-game friendship tier — so every per-friend suggestion carries
//     an explicit note instead of a guessed number.
import { dupeGroups } from "./dupe-advisor.js";

function formTags(form) {
  return new Set((form?.tags ?? []).map((tag) => String(tag).toLowerCase()));
}

// Same tag set purge-string.js's tradeBaitReason checks, for consistency.
function taggedBaitReason(form) {
  const tags = formTags(form);
  if (tags.has("legendary") || tags.has("mythical")) return "Legendary/Mythical — rare, high-demand trade bait.";
  if (tags.has("trade-value")) return "Tagged trade-value — good trade bait.";
  return null;
}

export const FRIENDSHIP_LEVEL_NOTE = "Lucky odds and stardust cost depend on your in-game friendship level with this friend, which this app does not track — check it in-game before offering.";

export function tradePlan({ roster = {}, forms = {}, friends = [], optimalMoves = {} } = {}) {
  const detailedFormIds = new Set((roster.instances ?? []).map((instance) => instance.formId));
  const seenInstanceIds = new Set();
  const baits = [];

  // 1. Detailed instances of a legendary/mythical/trade-value species — the
  // roster content worth offering, tag-driven.
  for (const instance of roster.instances ?? []) {
    const form = forms[instance.formId] ?? null;
    const reason = taggedBaitReason(form);
    if (!reason) continue;
    // Precious singles are NEVER bait (review catch: a shiny lucky hundo
    // Mewtwo was suggested as an offer). Shiny/lucky/hundo copies only
    // surface via the duplicate pass below, where an outclassed extra copy
    // is the thing on offer — matching the purge planner's keep discipline.
    const ivSum = (instance.ivs?.atk ?? 0) + (instance.ivs?.def ?? 0) + (instance.ivs?.sta ?? 0);
    if (instance.isShiny || instance.isLucky || ivSum === 45) continue;
    baits.push({ kind: "instance", id: instance.id, formId: instance.formId, name: form?.name ?? instance.formId, reason });
    seenInstanceIds.add(instance.id);
  }

  // 2. Owned-but-not-detailed species of the same tags (star-only entries,
  // same shape purge-string.js's speciesKeepReason reads).
  for (const formId of roster.ownedFormIds ?? []) {
    if (detailedFormIds.has(formId)) continue;
    const form = forms[formId] ?? null;
    const reason = taggedBaitReason(form);
    if (!reason) continue;
    baits.push({ kind: "species", formId, name: form?.name ?? formId, reason });
  }

  // 3. Duplicate detailed copies dupe-advisor.js would mark "release" —
  // conservative by construction: a lone hundo/recorded copy never appears
  // here, only one outclassed by a better copy of the same species already
  // in the group (shiny/lucky auto-keep, then IV sum, then the rest of
  // dupe-advisor's comparator).
  for (const group of dupeGroups({ roster, forms, optimalMoves })) {
    for (const row of group.instances) {
      if (row.verdict.keep) continue;
      if (seenInstanceIds.has(row.instance.id)) continue;
      baits.push({
        kind: "dupe-release",
        id: row.instance.id,
        formId: group.formId,
        name: group.form?.name ?? group.formId,
        reason: `Duplicate — ${row.verdict.why}`,
      });
      seenInstanceIds.add(row.instance.id);
    }
  }

  const perFriend = (friends ?? []).map((friend) => ({
    id: friend.id,
    name: friend.name,
    code: friend.code,
    offers: baits,
    note: FRIENDSHIP_LEVEL_NOTE,
  }));

  return { baits, perFriend };
}
