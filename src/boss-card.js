// Boss card: one compact, honest summary of a raid boss, built entirely from
// data this app already ships — never a second copy of a number another
// module already computes, and never a presentational rating this release
// doesn't actually carry. Catch CP / weather boost / counters / trainers-
// needed all come straight from raid-target.js's buildRaidPlan (the exact
// same call raidTargetSurface in app.js makes); weak-to/resists come from
// type-chart.js's canonical table; the boss's own ranked raid-attacker rows
// reuse home.js's attackerRowsFor. Every field is null (not guessed) when
// the release doesn't carry that fact for this formId, and every rating
// shown is the release's own shipped investmentTier/rank — no derived
// letter grade.
import { weaknessesOf, resistancesOf } from "./type-chart.js";
import { buildRaidPlan, withoutMegasOrPrimals } from "./raid-target.js";
import { attackerRowsFor } from "./views/home.js";

const LEAGUES = Object.freeze(["great", "ultra", "master"]);

// A boss's own species tags that put its top counters in the "Legendary /
// Mythical" bucket (grouping only — unrelated to raid-target.js's HARD_TAGS,
// which asks "is THIS raid hard", not "is this counter's species legendary").
const LEGENDARY_MYTHICAL_TAGS = new Set(["legendary", "mythical", "ultrabeast"]);

// Every ranked raid-attacker row for this boss (attackerRowsFor already
// dedupes by attacking type, best rank first), re-ordered so the boss's OWN
// types lead — a boss is usually raided for its own-type attacker row (e.g.
// Xerneas's Fairy row), even when some other type happens to rank it #1
// overall (Xerneas's Normal row). Order within each bucket stays rank order.
function raidAttackersFor(formId, raids, types) {
  const rows = attackerRowsFor(formId, [...(raids?.regular ?? []), ...(raids?.shadow ?? [])]);
  const ownTypes = new Set(types);
  const toCardRow = (row) => ({
    attackingType: row.attackingType,
    rank: row.rank,
    investmentTier: row.investmentTier ?? null,
    fastMove: row.optimalFastMove ?? null,
    chargedMove: row.optimalChargedMove ?? null,
    eliteFastTM: Boolean(row.optimalEliteFastTM),
    eliteChargedTM: Boolean(row.optimalEliteChargedTM),
  });
  return [
    ...rows.filter((row) => ownTypes.has(row.attackingType)),
    ...rows.filter((row) => !ownTypes.has(row.attackingType)),
  ].map(toCardRow);
}

function pvpRowFor(formId, pvpRows, league) {
  const row = (pvpRows?.[league] ?? []).find((entry) => entry.formId === formId);
  if (!row) return null;
  return {
    league,
    rank: row.rank,
    investmentTier: row.investmentTier ?? null,
    fastMove: row.fastMove ?? null,
    chargedMoves: row.chargedMoves ?? [],
    eliteFastTM: Boolean(row.eliteFastTM),
    eliteChargedTM: Boolean(row.eliteChargedTM),
  };
}

function counterRow(row, forms) {
  return {
    formId: row.formId,
    pokemon: forms?.[row.formId]?.name ?? row.pokemon,
    attackingType: row.attackingType,
    rank: row.rank,
    fastMove: row.optimalFastMove ?? null,
    chargedMove: row.optimalChargedMove ?? null,
    eliteFastTM: Boolean(row.optimalEliteFastTM),
    eliteChargedTM: Boolean(row.optimalEliteChargedTM),
  };
}

// Mega/Primal, Shadow, Legendary-Mythical, General — the same four buckets
// the reference infographic groups counters into. Built from buildRaidPlan's
// own already-ranked regularCounters/shadowCounters (not a re-sorted copy):
// shadowCounters is shadow-only by construction, so the only split left to
// make here is mega/primal vs. legendary/mythical vs. everything else, and
// withoutMegasOrPrimals (raid-target.js) already answers the mega/primal
// half of that.
function counterGroups(plan, forms) {
  const buildableIds = new Set(withoutMegasOrPrimals(plan.regularCounters, forms).map((row) => row.formId));
  const megaRows = plan.regularCounters.filter((row) => !buildableIds.has(row.formId));
  const buildableRows = plan.regularCounters.filter((row) => buildableIds.has(row.formId));
  const isLegendaryMythical = (row) => (forms?.[row.formId]?.tags ?? []).some((tag) => LEGENDARY_MYTHICAL_TAGS.has(tag));
  const legendaryRows = buildableRows.filter(isLegendaryMythical);
  const generalRows = buildableRows.filter((row) => !isLegendaryMythical(row));
  return {
    mega: megaRows.slice(0, 3).map((row) => counterRow(row, forms)),
    shadow: plan.shadowCounters.slice(0, 3).map((row) => counterRow(row, forms)),
    legendaryMythical: legendaryRows.slice(0, 3).map((row) => counterRow(row, forms)),
    general: generalRows.slice(0, 3).map((row) => counterRow(row, forms)),
  };
}

// bossCardData(formId, ctx) -> everything the boss card needs, or null if
// formId isn't even a known form. ctx: { data, weather, roster, trainerLevel }
// — `data` is the same release-chunk-shaped object buildRaidPlan already
// takes (state.core.forms/state.forms, state.raids, state.raidTargetTool,
// state.currentBosses, state.currentEvents, state.pvp, state.currentEggs).
export function bossCardData(formId, ctx = {}) {
  const data = ctx.data ?? {};
  const forms = data.core?.forms ?? data.forms ?? {};
  const form = forms[formId];
  if (!form) return null;

  const types = [form.primary_type, form.secondary_type].filter(Boolean);
  const bosses = data.currentBosses?.bosses ?? data.core?.currentBosses?.bosses ?? [];
  const rotation = bosses.find((row) => row.formId === formId) ?? null;
  const rotationWindow = rotation ? { tier: rotation.tier ?? null, startsAt: rotation.startsAt ?? null, endsAt: rotation.endsAt ?? null } : null;

  const events = data.currentEvents?.events ?? data.core?.currentEvents?.events ?? [];
  const raidHourEvent = events.find((event) => event.kind === "raid-hour" && event.formId === formId) ?? null;
  const raidHour = raidHourEvent ? { name: raidHourEvent.name, startsAt: raidHourEvent.startsAt, endsAt: raidHourEvent.endsAt } : null;

  const targets = data.raidTargetTool?.targets ?? data.core?.raidTargetTool?.targets ?? [];
  const hasTarget = targets.some((row) => row.bossFormId === formId);
  let plan = null;
  if (hasTarget) {
    try {
      plan = buildRaidPlan({
        targetFormId: formId,
        ownedFormIds: ctx.roster?.ownedFormIds ?? [],
        weather: ctx.weather ?? "None",
        roster: ctx.roster ?? null,
        trainerLevel: ctx.trainerLevel ?? null,
      }, data);
    } catch {
      plan = null;
    }
  }

  const catchCp = plan ? {
    normal: plan.target.normal,
    boosted: plan.target.weatherBoosted,
    boostWeathers: plan.weatherBoostConditions,
    boostedNow: plan.bossBoostedNow,
  } : null;

  // No current data source ties a shiny flag to a RAID boss — currentEggs'
  // canBeShiny is a different acquisition path (egg hatches) and isn't
  // evidence either way for a raid encounter, so this stays null rather than
  // borrow a flag that doesn't actually describe this boss.
  const shiny = null;

  const raidRows = data.raids ?? data.core?.raids ?? {};
  const raidAttackers = raidAttackersFor(formId, raidRows, types);

  const pvpRows = data.pvp ?? data.core?.pvp ?? {};
  const pvp = Object.fromEntries(LEAGUES.map((league) => [league, pvpRowFor(formId, pvpRows, league)]));

  return {
    formId,
    name: form.name,
    types,
    window: rotationWindow,
    raidHour,
    catchCp,
    weakTo: weaknessesOf(types).map((row) => ({ type: row.type, multiplier: row.multiplier, isDouble: row.multiplier >= 2.56 })),
    resists: resistancesOf(types).map((row) => ({ type: row.type, multiplier: row.multiplier, isDouble: row.multiplier <= 0.390625 })),
    shiny,
    trainersNeeded: plan ? plan.beatability : null,
    raidAttackers,
    pvp,
    counters: plan ? counterGroups(plan, forms) : null,
  };
}
