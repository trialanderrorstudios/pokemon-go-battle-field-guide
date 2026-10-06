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
import { bestLevelUnderCap, LEAGUE_CP_CAP, RANK_MAX_LEVEL, rankIvSpread } from "./pvp-team.js";
import { STAR_TIER_RANGES } from "./instances.js";

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

// "What will this trade roll?" — per-friendship-tier IV re-roll floors.
// SOURCE: community-documented (no official Niantic odds page exists);
// consistently reported by GamePress and The Silph Road trade guides and
// cross-checked against Pokémon GO Hub's trade writeup (checked 2026-10-05).
// Each stat (atk/def/sta) rerolls independently and uniformly between the
// floor and 15 inclusive — the same assumption those guides state and the
// enumeration below relies on.
export const TRADE_FRIENDSHIP_TIERS = Object.freeze([
  Object.freeze({ tier: "Good Friend", floor: 1 }),
  Object.freeze({ tier: "Great Friend", floor: 2 }),
  Object.freeze({ tier: "Ultra Friend", floor: 3 }),
  Object.freeze({ tier: "Best Friend", floor: 5 }),
  Object.freeze({ tier: "Lucky trade", floor: 12 }),
]);

// In-game 3-star appraisal is STAR_TIER_RANGES' 37-44 band (instances.js);
// 45 (the hundo) is that same module's own "4 stars" shorthand for the
// highlighted top of the 3-star band, not a real 4th star the game shows.
// This evaluator reports the real in-game label — "3-star or better" — so it
// reuses the 3-star range's own min instead of a second hardcoded 37.
const THREE_STAR_SUM_MIN = Math.min(...STAR_TIER_RANGES.filter((range) => range.stars === 3).map((range) => range.min));
const TOP_RANK_CUTOFF = 100;

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

// A league's CP cap only constrains a build if even the best possible IVs
// (a hundo) get stopped short of the species' own max level by that cap. If
// a hundo's own best level under the cap already reaches maxLevel, the cap
// never bites for this species in this league — every spread tops out at
// (almost) the same level, so "top 100 of 4096 by stat product" doesn't mean
// "a build worth chasing", it just reflects raw stat totals. Flagged here so
// the view can render "can't reach the cap" instead of a misleading rank.
function capIsMeaningful(form, league) {
  const cap = LEAGUE_CP_CAP[league];
  if (cap === null) return true;
  const maxLevel = RANK_MAX_LEVEL[league];
  return bestLevelUnderCap(form, { atk: 15, def: 15, sta: 15 }, cap, maxLevel) !== maxLevel;
}

// Exhaustive (not sampled) odds for one species: every possible re-rolled
// spread from floor..15 on each stat, uniform, is enumerated and classified.
// rankIvSpread's own rankTable cache (pvp-team.js) is keyed by base stats +
// league, so repeated calls for the same species/league across tiers reuse
// one pre-built table instead of rescanning the 4096-spread pool each time.
export function tradeRollOdds(form) {
  if (!form) return [];
  const greatCapMeaningful = capIsMeaningful(form, "great");
  const ultraCapMeaningful = capIsMeaningful(form, "ultra");
  return TRADE_FRIENDSHIP_TIERS.map(({ tier, floor }) => {
    const total = (16 - floor) ** 3;
    let hundo = 0;
    let threeStar = 0;
    let greatTop100 = 0;
    let ultraTop100 = 0;
    for (let atk = floor; atk <= 15; atk += 1) {
      for (let def = floor; def <= 15; def += 1) {
        for (let sta = floor; sta <= 15; sta += 1) {
          if (atk === 15 && def === 15 && sta === 15) hundo += 1;
          if (atk + def + sta >= THREE_STAR_SUM_MIN) threeStar += 1;
          const ivs = { atk, def, sta };
          if (greatCapMeaningful && (rankIvSpread(form, ivs, "great")?.rank ?? Infinity) <= TOP_RANK_CUTOFF) greatTop100 += 1;
          if (ultraCapMeaningful && (rankIvSpread(form, ivs, "ultra")?.rank ?? Infinity) <= TOP_RANK_CUTOFF) ultraTop100 += 1;
        }
      }
    }
    return {
      tier, floor, total,
      hundoCount: hundo,
      threeStarPct: pct(threeStar, total),
      greatTop100Pct: greatCapMeaningful ? pct(greatTop100, total) : null,
      ultraTop100Pct: ultraCapMeaningful ? pct(ultraTop100, total) : null,
    };
  });
}
