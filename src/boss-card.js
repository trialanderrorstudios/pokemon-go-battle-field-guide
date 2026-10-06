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
import { weaknessesOf, resistancesOf, effectivenessOf } from "./type-chart.js";
import { buildRaidPlan, withoutMegasOrPrimals, counterLane } from "./raid-target.js";
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

// Max Battle ready-counters (Dynamax/Gigantamax only — round 17's
// canDynamax/canGigantamax quick-add flags on roster.instances). This is the
// only Max-specific signal any data this app ships carries: no Max move
// list and no Max-specific attacker ranking exist anywhere in this release
// (currentMaxBattles only carries formId/kind/dates/source), so this is a
// same-type-as-the-boss STAB check against the reader's own Max-flagged
// roster, not a moveset-level DPS rank — honestly weaker evidence than
// raidAttackers above, and the renderer must label it as such, never present
// it as the same kind of rank.
function maxReadyCounters(bossTypes, roster, forms) {
  const rows = [];
  for (const instance of roster?.instances ?? []) {
    if (!instance?.canDynamax && !instance?.canGigantamax) continue;
    const form = forms?.[instance.formId];
    if (!form) continue;
    const ownTypes = [form.primary_type, form.secondary_type].filter(Boolean);
    const multiplier = Math.max(0, ...ownTypes.map((type) => effectivenessOf(type, bossTypes)));
    if (multiplier <= 1) continue;
    rows.push({
      formId: instance.formId,
      name: form.name,
      nickname: instance.nickname ?? null,
      multiplier: Math.round(multiplier * 10000) / 10000,
      isDouble: multiplier >= 2.56,
    });
  }
  rows.sort((left, right) => right.multiplier - left.multiplier || left.name.localeCompare(right.name));
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (seen.has(row.formId)) continue;
    seen.add(row.formId);
    deduped.push(row);
  }
  return deduped.slice(0, 6);
}

// bossCardData(formId, ctx) -> everything the boss card needs, or null if
// formId isn't even a known form. ctx: { data, weather, roster, trainerLevel,
// isMaxBattle } — `data` is the same release-chunk-shaped object
// buildRaidPlan already takes (state.core.forms/state.forms, state.raids,
// state.raidTargetTool, state.currentBosses, state.currentEvents, state.pvp,
// state.currentEggs). isMaxBattle (round 17) opts into the Max-only
// maxReady field above — omitted (stays null) for every ordinary raid boss
// card so existing raid-target output is unchanged.
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
    maxReady: ctx.isMaxBattle ? maxReadyCounters(types, ctx.roster, forms) : null,
  };
}


// rocketBattlerCardData(entry, ctx) -> a per-slot counters card for a Team
// GO Rocket Leader/Giovanni battler (rocket-lineups.json's leader/boss
// entries — the ones with no single declared `type`, because each slot can
// open with Pokémon of different types, unlike a type grunt). Reuses the
// exact same weak-to/resist table (type-chart.js) and the exact same
// owned-first/general counter ranking (raid-target.js's counterLane — the
// same function buildRaidPlan's own regularCounters/shadowCounters/
// ownedCounters above call) as the raid boss card — never a second
// counter-ranking engine for a non-raid encounter. ctx: { data, roster }.
const ROCKET_TEAM_SIZE = 6; // a raid/Rocket lobby only fits 6 Pokémon — same cap raid-target.js's ownedCounters uses
const ROCKET_GENERAL_LIMIT = 3;
export const ROCKET_CATCH_NOTE = "Possible post-battle catch if you win — Team GO Rocket victories are Shadow Pokémon encounters (shown here as the base form; this dex has no separate Shadow listing for every battler).";

function rocketBattlerMonCard(mon, allCounterRows, owned, forms) {
  const types = (mon.types ?? []).filter(Boolean);
  const catchNote = mon.isEncounter ? ROCKET_CATCH_NOTE : null;
  if (!types.length) {
    return {
      formId: mon.formId, name: mon.name, types: [], weakTo: [], resists: [],
      ownedCounters: [], generalCounters: [], catchNote, noTypeData: true,
    };
  }
  return {
    formId: mon.formId,
    name: mon.name,
    types,
    weakTo: weaknessesOf(types).map((row) => ({ type: row.type, multiplier: row.multiplier, isDouble: row.multiplier >= 2.56 })),
    resists: resistancesOf(types).map((row) => ({ type: row.type, multiplier: row.multiplier, isDouble: row.multiplier <= 0.390625 })),
    ownedCounters: counterLane(allCounterRows, types, { limit: ROCKET_TEAM_SIZE, owned }).map((row) => counterRow(row, forms)),
    generalCounters: counterLane(allCounterRows, types, { limit: ROCKET_GENERAL_LIMIT }).map((row) => counterRow(row, forms)),
    catchNote,
    noTypeData: false,
  };
}

export function rocketBattlerCardData(entry, ctx = {}) {
  if (!entry) return null;
  const data = ctx.data ?? {};
  const forms = data.core?.forms ?? data.forms ?? {};
  const raidRows = data.raids ?? data.core?.raids ?? {};
  const allCounterRows = [...(raidRows.regular ?? []), ...(raidRows.shadow ?? [])];
  const owned = new Set((ctx.roster?.ownedFormIds ?? []).filter((id) => typeof id === "string"));
  return {
    name: entry.name,
    title: entry.title,
    slots: (entry.slots ?? []).map((mons) => (mons ?? []).map((mon) => rocketBattlerMonCard(mon, allCounterRows, owned, forms))),
  };
}
