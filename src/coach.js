// Weekly Coach: composes existing modules into one "what should I do this
// week" summary. No new math lives here — every number is computed by the
// module that already owns it (raid-target's beatability, the Future-Proof
// planner's priority order, the power-up cost table, pvp-team's My Team
// builder); this module only filters, sorts, and links to the source screen.
import { buildRaidPlan, levelCapNote, powerUpCost } from "./raid-target.js";
import { bestInstanceForForm, instanceLevel } from "./instances.js";
import { buildMyTeam, MY_TEAM_SLOTS, myTeamOverridesFor } from "./pvp-team.js";
import { futureImpactRows } from "./views/more.js";
import { myTeamMoveDeltaLines } from "./views/pvp.js";
import { formatRaidHourWhen, nextRaidHour } from "./views/home.js";
import { instanceBreakpointReports } from "./breakpoints.js";
import {
  BUDDY_LEVEL_NAMES, BUDDY_LEVEL_THRESHOLDS, buddyLevelForHearts, daysToBest, heartsToBest,
} from "./buddy.js";

const BAND_ORDER = {
  "solo-able": 0, duoable: 1, "bring-3-4": 2, "full-lobby": 3, "not-enough-data": 4,
};
export const PVP_LEAGUES = Object.freeze(["great", "ultra", "master"]);
// Matches app.js's raidReadyPanel: a fresh raid catch is Level 20 until a
// saved roster instance says otherwise.
const FRESH_CATCH_LEVEL = 20;
const POWER_UP_LIMIT = 3;

function formsOf(data) {
  return data?.core?.forms ?? data?.forms ?? {};
}


// Only folds in a Raid Hour that hasn't happened yet — a lapsed one isn't
// "worth raiding" advice, it's history. (Home's banner is stale-honest and
// shows lapsed windows too; this fold-in just omits them instead — so unlike
// Home, a stale nextRaidHour() fallback result is discarded here.)
function upcomingRaidHour(events, formId, now) {
  const picked = nextRaidHour((events ?? []).filter((event) => event.formId === formId), now);
  return picked && new Date(picked.endsAt) >= now ? picked : null;
}


function worthRaidingThisWeek(data, roster, now = new Date(), trainerLevel = null) {
  const bosses = data?.currentBosses?.bosses ?? [];
  const events = data?.currentEvents?.events ?? [];
  const rows = [];
  for (const boss of bosses) {
    let plan;
    try {
      plan = buildRaidPlan({ targetFormId: boss.formId, ownedFormIds: roster?.ownedFormIds, roster, trainerLevel }, data);
    } catch {
      continue; // not in this release's raid target tool — nothing to summarize
    }
    const raidHour = upcomingRaidHour(events, boss.formId, now);
    rows.push({
      formId: boss.formId,
      name: plan.target.boss,
      band: plan.beatability.band,
      headline: plan.beatability.headline,
      detail: plan.beatability.detail,
      ownedCounterCount: plan.ownedCounters.length,
      topCounterNames: plan.ownedCounters.slice(0, 2).map((row) => row.pokemon),
      href: `./?boss=${encodeURIComponent(boss.formId)}#raids`,
      raidHourWhen: raidHour ? formatRaidHourWhen(raidHour.startsAt, raidHour.endsAt, now) : null,
    });
  }
  return rows.sort((left, right) => (BAND_ORDER[left.band] - BAND_ORDER[right.band])
    || left.name.localeCompare(right.name));
}


export function powerUpNext(data, roster, trainerLevel = null) {
  const forms = formsOf(data);
  const owned = new Set(roster?.ownedFormIds ?? []);
  const candidates = futureImpactRows(data?.futureProof ?? []).filter((row) => owned.has(row.formId));
  return candidates.slice(0, POWER_UP_LIMIT).map((row) => {
    const form = forms[row.formId];
    const bestInstance = bestInstanceForForm(roster?.instances ?? [], row.formId);
    const derivedLevel = bestInstance ? instanceLevel(form, bestInstance) : null;
    const fromLevel = derivedLevel ?? FRESH_CATCH_LEVEL;
    const cost = powerUpCost(fromLevel, 40);
    return {
      formId: row.formId,
      instanceId: bestInstance?.id ?? null,
      name: row.pokemon,
      investmentTier: row.investmentTier,
      recommendation: row.recommendation,
      fromLevel,
      assumption: derivedLevel === null,
      candy: cost.candy,
      stardust: cost.stardust,
      maxed: cost.candy === 0 && cost.stardust === 0,
      capNote: levelCapNote(40, trainerLevel),
      href: "./?list=future#more",
    };
  });
}


// Best owned candidate to walk as a buddy: fewest km per Candy among owned
// Pokemon that have a buddy distance at all, tie-broken toward whichever is
// also worth investing in (its Future-Proof priority, if any).
function walkThisBuddy(data, roster) {
  const forms = formsOf(data);
  const priorityByFormId = new Map(futureImpactRows(data?.futureProof ?? [])
    .map((row) => [row.formId, row.impactPriority]));
  const candidates = [...new Set(roster?.ownedFormIds ?? [])]
    .map((formId) => forms[formId])
    .filter((form) => Number.isInteger(form?.buddy_distance_km) && form.buddy_distance_km > 0);
  if (!candidates.length) return null;
  const [best] = [...candidates].sort((left, right) => {
    const leftPriority = priorityByFormId.get(left.form_id) ?? Infinity;
    const rightPriority = priorityByFormId.get(right.form_id) ?? Infinity;
    return (leftPriority - rightPriority)
      || (left.buddy_distance_km - right.buddy_distance_km)
      || left.name.localeCompare(right.name);
  });
  return {
    formId: best.form_id,
    name: best.name,
    buddyKm: best.buddy_distance_km,
    relevant: priorityByFormId.has(best.form_id),
    href: "./#more",
  };
}


function pvpTeamStatus(data, roster) {
  const forms = formsOf(data);
  return PVP_LEAGUES.map((league) => {
    const overrides = myTeamOverridesFor(roster?.preferences, league);
    const team = buildMyTeam({
      league, pvp: data?.pvp ?? {}, pvpTeams: data?.pvpTeams ?? [], roster, forms, overrides,
    });
    if (team.isEmpty) {
      return {
        league, status: "empty", filledCount: 0, emptySlots: MY_TEAM_SLOTS.length, moveTodos: [], href: "./#pvp",
      };
    }
    const filled = team.members.filter(Boolean);
    const moveTodos = filled
      .map((member) => ({
        slot: member.slot,
        name: member.form?.name ?? member.formId,
        lines: myTeamMoveDeltaLines(member),
      }))
      .filter((entry) => entry.lines.length);
    const emptySlots = MY_TEAM_SLOTS.length - filled.length;
    const status = emptySlots > 0 ? "partial" : moveTodos.length ? "moves-needed" : "complete";
    return { league, status, filledCount: filled.length, emptySlots, moveTodos, href: "./#pvp" };
  });
}


function moveCatalogOf(data) {
  return data?.core?.methodology?.raidDps?.moveCatalog ?? data?.methodology?.raidDps?.moveCatalog ?? {};
}

function targetDefenseOf(data) {
  return data?.core?.methodology?.raidDps?.assumptions?.targetDefense
    ?? data?.methodology?.raidDps?.assumptions?.targetDefense;
}

function bossTypesOf(form) {
  return [form?.primary_type, form?.secondary_type].filter(Boolean);
}


// Best Buddy's CP boost is a full power-up LEVEL (two power-up steps — see
// buddy.js's cited sources), not the game's usual half-level power-up step.
// Reuses breakpoints.js's own move-damage math untouched: if any move the
// linked instance actually knows ticks its damage-per-hit up somewhere
// between its current level and one full level up against a boss in this
// week's rotation, the Best Buddy boost alone gets there. First qualifying
// boss wins — this is a "why," not an exhaustive rotation scan.
function buddyBreakpointBoss({ data, form, instance }) {
  if (!form || !instance) return null;
  const currentLevel = instanceLevel(form, instance);
  if (currentLevel === null) return null;
  const forms = formsOf(data);
  const moveCatalog = moveCatalogOf(data);
  const targetDefense = targetDefenseOf(data);
  for (const boss of data?.currentBosses?.bosses ?? []) {
    const bossForm = forms[boss.formId];
    const bossTypes = bossTypesOf(bossForm);
    if (!bossTypes.length) continue;
    const reports = instanceBreakpointReports({
      form, instance, moveCatalog, bossTypes, weather: "None", targetDefense,
    });
    const hit = reports.find((report) => (
      report.nextBreakpoint && report.nextBreakpoint.level <= currentLevel + 1 + 1e-9
    ));
    if (hit) return { formId: boss.formId, name: bossForm?.name ?? boss.formId };
  }
  return null;
}


// WHY this one: composes raid relevance from the breakpoints module when it
// can actually say something (an owned detailed instance + a current boss it
// damage-breakpoints against with the extra level); otherwise every Best
// Buddy still gets the same honest fallback — the plain CP-level-bump
// framing, since that part of the mechanic never varies.
function buddyPlanReason({ data, form, instance }) {
  const breakpointBoss = buddyBreakpointBoss({ data, form, instance });
  if (breakpointBoss) return `Best Buddy boost gains a breakpoint vs ${breakpointBoss.name}.`;
  return "Best Buddy adds about one power-up level of CP (up to Lv. 51) while it's your active buddy — a free strength bump for whatever you use it for.";
}


// Owned, walkable-buddy candidates for the plan picker: favorites first, then
// alphabetical. Each candidate lists its detailed roster instances (if any)
// so the picker can optionally pin the plan to one specific copy — buddy
// hearts/level track a single Pokémon, not the whole species.
export function buddyPlanCandidates(data, roster) {
  const forms = formsOf(data);
  const favorites = new Set(roster?.favorites ?? []);
  const instancesByForm = new Map();
  for (const instance of roster?.instances ?? []) {
    if (!instancesByForm.has(instance.formId)) instancesByForm.set(instance.formId, []);
    instancesByForm.get(instance.formId).push(instance);
  }
  return [...new Set(roster?.ownedFormIds ?? [])]
    .map((formId) => forms[formId])
    .filter((form) => Number.isInteger(form?.buddy_distance_km) && form.buddy_distance_km > 0)
    .sort((left, right) => (Number(favorites.has(right.form_id)) - Number(favorites.has(left.form_id)))
      || left.name.localeCompare(right.name))
    .map((form) => ({
      formId: form.form_id,
      name: form.name,
      favorite: favorites.has(form.form_id),
      instances: (instancesByForm.get(form.form_id) ?? []).map((instance) => ({
        id: instance.id,
        label: instance.nickname ? `${instance.nickname} (${instance.cp} CP)` : `${instance.cp} CP`,
      })),
    }));
}


// The single active plan's derived card: buddy level, hearts remaining, and
// days at the standard daily cap — all null (not zero) until hearts are
// entered, since an unset manual field is honestly "unknown," not "0."
export function buildBuddyPlanCard({ data = {}, roster = {}, plan = {} } = {}) {
  if (!plan?.formId) return null;
  const forms = formsOf(data);
  const form = forms[plan.formId];
  if (!form) return null; // formId not in this release's catalog
  const owned = (roster?.ownedFormIds ?? []).includes(plan.formId);
  const instance = plan.instanceId
    ? (roster?.instances ?? []).find((row) => row.id === plan.instanceId && row.formId === plan.formId) ?? null
    : null;
  const hearts = plan.hearts;
  return {
    formId: plan.formId,
    instanceId: instance?.id ?? null,
    name: form.name,
    nickname: instance?.nickname ?? null,
    owned,
    hearts,
    levelLabel: hearts === null ? null : BUDDY_LEVEL_NAMES[buddyLevelForHearts(hearts)],
    heartsToBest: hearts === null ? null : heartsToBest(hearts),
    daysToBest: hearts === null ? null : daysToBest(hearts),
    isBest: hearts !== null && hearts >= BUDDY_LEVEL_THRESHOLDS.best,
    reason: buddyPlanReason({ data, form, instance }),
  };
}


export function buildCoachSummary({
  data = {}, roster = {}, now = new Date(), trainerLevel = null, buddyPlan = null,
} = {}) {
  return {
    worthRaiding: worthRaidingThisWeek(data, roster, now, trainerLevel),
    powerUpNext: powerUpNext(data, roster, trainerLevel),
    buddyPick: walkThisBuddy(data, roster),
    buddyPlanCandidates: buddyPlanCandidates(data, roster),
    buddyPlanCard: buildBuddyPlanCard({ data, roster, plan: buddyPlan }),
    pvpTeams: pvpTeamStatus(data, roster),
  };
}
