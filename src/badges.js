// Milestone badges (fun item): honest, derived-only shelf of "you did this"
// markers. Never stored — every call recomputes from the journal/roster/
// dex data that's already the source of truth, so a badge can never say
// "earned" for something that later got un-earned (e.g. a released hundo).
// Pure module; web/src/views/trophy.js renders the shelf.
import { collectionProgress } from "./collection.js";

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

// One tier ladder (e.g. streak 3/7/30) becomes one badge per threshold,
// each earned independently once `count` clears it.
function tieredBadges({ idPrefix, count, thresholds, label, unit, unitPlural = `${unit}s` }) {
  return thresholds.map((threshold) => {
    const earned = count >= threshold;
    return {
      id: `${idPrefix}-${threshold}`,
      label: label(threshold),
      earned,
      ...(earned
        ? { earnedDetail: `${count} ${pluralize(count, unit, unitPlural)}` }
        : { progressDetail: `${count}/${threshold} ${pluralize(threshold, unit, unitPlural)}` }),
    };
  });
}

function ivSum(ivs) {
  const complete = [ivs?.atk, ivs?.def, ivs?.sta].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 15,
  );
  return complete ? ivs.atk + ivs.def + ivs.sta : null;
}

export function badgesFrom({ journal, bestStreak = 0, roster, forms } = {}) {
  const entries = journal?.entries ?? [];
  const instances = roster?.instances ?? [];

  // Journal is capped at 500 entries (journal.js MAX_ENTRIES), so a
  // long-lived player's instance-added count can undercount their true
  // save total — roster.instances never gets pruned, so take whichever is
  // higher rather than trusting the capped log alone.
  const journalSaves = entries.filter((e) => e.kind === "instance-added").length;
  const saves = Math.max(journalSaves, instances.length);

  const hundos = instances.filter((i) => ivSum(i.ivs) === 45).length;
  const shinies = instances.filter((i) => i.isShiny).length;

  // Raid wins have the same 500-entry undercount as saves, but there's no
  // roster-level "wins" count to cross-check against (raid outcomes aren't
  // persisted on the roster) — this is a floor, not an exact total.
  const raidWins = entries.filter((e) => e.kind === "raid-logged" && e.detail?.outcome === "won").length;

  const genBadges = collectionProgress(forms ?? {}, roster ?? {}).byGeneration
    .filter((bucket) => bucket.total > 0)
    .map((bucket) => {
      const earned = bucket.caught === bucket.total;
      return {
        id: `gen-${bucket.gen}`,
        label: `${bucket.region} Complete`,
        earned,
        ...(earned
          ? { earnedDetail: `${bucket.caught}/${bucket.total} caught` }
          : { progressDetail: `${bucket.caught}/${bucket.total} caught` }),
      };
    });

  return [
    ...tieredBadges({
      idPrefix: "streak", count: bestStreak, thresholds: [3, 7, 30],
      label: (t) => `${t}-Day Streak`, unit: "day",
    }),
    ...tieredBadges({
      idPrefix: "saves", count: saves, thresholds: [10, 50, 100],
      label: (t) => `${t} Saves`, unit: "save",
    }),
    ...tieredBadges({
      idPrefix: "hundo", count: hundos, thresholds: [1, 5, 10],
      label: (t) => (t === 1 ? "First Hundo" : `${t} Hundos`), unit: "hundo",
    }),
    ...tieredBadges({
      idPrefix: "shiny", count: shinies, thresholds: [5, 25],
      label: (t) => `${t} Shinies`, unit: "shiny", unitPlural: "shinies",
    }),
    ...tieredBadges({
      idPrefix: "raid", count: raidWins, thresholds: [1, 10],
      label: (t) => (t === 1 ? "First Raid Win" : `${t} Raid Wins`), unit: "raid win",
    }),
    ...genBadges,
  ];
}
