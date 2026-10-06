// "Do these 3 things today" (feature #9) — one prioritized card above the
// Home briefing picking up to 3 highest-value actions for today. Pure: scores
// candidates built only from signals the app already computes elsewhere, no
// new data and no DOM/storage reads.
//   nearest raid hour / spotlight hour / Max event -> views/home.js's own
//     live-first-else-upcoming pickers (nextRaidHour/nextSpotlightHour/
//     pickMaxEvent) — not re-derived here.
//   Frustration removal window                     -> frustration-window.js
//   medal bonus                                     -> medals.js
//     nextPlatinums + collection.js generationOf (dex -> region)
//   boss / Max boss leaving soon                    -> currentBosses /
//     currentMaxBattles, the same bare-endsAt-local-date day math
//     today-tasks.js and boss-countdown.js each already carry (both private
//     there — this is the same small local copy, not a new derivation).
import { nextRaidHour, nextSpotlightHour, pickMaxEvent, maxEventSubject } from "./views/home.js";
import { frustrationWindow } from "./frustration-window.js";
import { medalRows } from "./medals.js";
import { generationOf } from "./collection.js";

function localDateFromISO(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function dateOnly(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(dateString, now) {
  const target = localDateFromISO(dateString);
  if (target === null) return null;
  return Math.round((target - dateOnly(now)) / 86400000);
}

// Same guard today-tasks.js's maxBossEndingRow uses: a feed-derived future
// Max Monday row carries a startsAt later than today, and "leaves Max
// spots tomorrow" is a lie about a boss that hasn't even started yet.
function hasStartedByToday(boss, now) {
  if (typeof boss?.startsAt !== "string") return true;
  const start = localDateFromISO(boss.startsAt);
  return start === null || start <= dateOnly(now);
}

// Lower sorts first. Tiers are spaced by 10 so neither the medal bonus
// (-0.5) nor a same-tier day-count tiebreaker (+1) ever crosses into a
// neighboring tier.
const TIER_FRUSTRATION = 0;
const TIER_LIVE = 10;
const TIER_LEAVING_TODAY = 20;
const TIER_STARTING_TODAY = 30;
const TIER_LEAVING_TOMORROW = 40;

// True when `formId`'s Pokédex region's living-dex medal is not yet
// platinum and within 5 catches of it — the "advances the cheapest next
// platinum" bonus from the spec (a medal this close is the cheapest way to
// bank a platinum, whatever its nominal tier).
function regionMedalBonus(formId, forms, medalState) {
  if (!formId || !medalState) return false;
  const dex = forms?.[formId]?.dex;
  if (!Number.isInteger(dex)) return false;
  const region = generationOf(dex)?.region;
  if (!region) return false;
  return medalRows(medalState)
    .some((row) => row.name === region && !row.done && row.remaining !== null && row.remaining <= 5);
}

function frustrationCandidate({ currentEvents, roster, forms, now }) {
  const result = frustrationWindow({ currentEvents, roster, forms, now });
  if (!result || !result.blocked.length) return null;
  if (result.status !== "open" && result.daysUntil !== 0) return null;
  const n = result.blocked.length;
  return {
    title: result.event.name,
    why: `${n} Shadow${n === 1 ? "" : "s"} stuck on Frustration — window ${result.status === "open" ? "is open now" : "opens today"}`,
    href: null,
    tier: TIER_FRUSTRATION,
    eventId: result.event.eventId ?? null,
  };
}

function liveOrStartsToday(startsAt, endsAt, now) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.valueOf())) return null;
  const live = start <= now && (Number.isNaN(end.valueOf()) || end > now);
  const startsToday = !live && start > now && start.toDateString() === now.toDateString();
  return live || startsToday ? { live } : null;
}

function raidHourCandidate({ currentEvents, forms, now, medalState }) {
  const event = nextRaidHour(currentEvents?.events, now);
  if (!event) return null;
  const when = liveOrStartsToday(event.startsAt, event.endsAt, now);
  if (!when) return null;
  const name = forms?.[event.formId]?.name ?? event.name.replace(/ Raid Hour$/, "");
  const bonus = regionMedalBonus(event.formId, forms, medalState);
  return {
    title: `${name} Raid Hour`,
    why: `${when.live ? "Live now" : "Starts today"} — one-hour raid window${bonus ? " · closes in on a Pokédex platinum" : ""}`,
    href: event.formId ? `./?boss=${encodeURIComponent(event.formId)}#raids` : "./#raids",
    tier: (when.live ? TIER_LIVE : TIER_STARTING_TODAY) - (bonus ? 0.5 : 0),
    eventId: event.eventId ?? null,
  };
}

function spotlightCandidate({ currentEvents, forms, now, medalState }) {
  const event = nextSpotlightHour(currentEvents?.events, now);
  if (!event) return null;
  const when = liveOrStartsToday(event.startsAt, event.endsAt, now);
  if (!when) return null;
  const name = forms?.[event.formId]?.name ?? event.name.replace(/ Spotlight Hour$/, "");
  const bonus = regionMedalBonus(event.formId, forms, medalState);
  const bonusText = event.spotlightBonus ? ` — ${event.spotlightBonus}` : "";
  return {
    title: `${name} Spotlight Hour`,
    why: `${when.live ? "Live now" : "Starts today"}${bonusText}${bonus ? " · closes in on a Pokédex platinum" : ""}`,
    href: event.formId ? `./?form=${encodeURIComponent(event.formId)}#dex` : "./#dex",
    tier: (when.live ? TIER_LIVE : TIER_STARTING_TODAY) - (bonus ? 0.5 : 0),
    eventId: event.eventId ?? null,
  };
}

function maxEventCandidate({ currentEvents, roster, forms, now, medalState }) {
  const event = pickMaxEvent(currentEvents?.events, now);
  if (!event) return null;
  const when = liveOrStartsToday(event.startsAt, event.endsAt, now);
  if (!when) return null;
  const subject = maxEventSubject(event.name);
  const name = subject ? `${subject.modifier} ${subject.species}` : event.name;
  const kindLabel = event.kind === "max-mondays" ? "Max Monday" : "Max Battle Day";
  const readyCount = (roster?.instances ?? []).filter((instance) => instance.canDynamax || instance.canGigantamax).length;
  const bonus = regionMedalBonus(event.formId, forms, medalState);
  return {
    title: `${name} — ${kindLabel}`,
    why: `${when.live ? "Live now" : "Starts today"} — ${readyCount} Max-ready Pokémon${bonus ? " · closes in on a Pokédex platinum" : ""}`,
    href: event.formId ? `./?boss=${encodeURIComponent(event.formId)}#raids` : "./#raids",
    tier: (when.live ? TIER_LIVE : TIER_STARTING_TODAY) - (bonus ? 0.5 : 0),
    eventId: event.eventId ?? null,
  };
}

function nearestLeaving(bosses, now) {
  return (bosses ?? [])
    .map((boss) => ({ boss, diff: daysUntil(boss.endsAt, now) }))
    .filter((row) => row.diff !== null && row.diff >= 0 && row.diff <= 1)
    .sort((left, right) => left.diff - right.diff || left.boss.formId.localeCompare(right.boss.formId))[0] ?? null;
}

function rotationBossCandidate({ currentBosses, forms, now }) {
  const pick = nearestLeaving(currentBosses?.bosses, now);
  if (!pick) return null;
  const name = forms?.[pick.boss.formId]?.name ?? pick.boss.formId;
  return {
    title: name,
    why: pick.diff === 0 ? "Leaves the raid rotation today" : "Leaves the raid rotation tomorrow",
    href: `./?boss=${encodeURIComponent(pick.boss.formId)}#raids`,
    tier: pick.diff === 0 ? TIER_LEAVING_TODAY : TIER_LEAVING_TOMORROW,
  };
}

function maxBossCandidate({ currentMaxBattles, forms, now }) {
  const started = (currentMaxBattles?.bosses ?? []).filter((boss) => hasStartedByToday(boss, now));
  const pick = nearestLeaving(started, now);
  if (!pick) return null;
  const name = forms?.[pick.boss.formId]?.name ?? pick.boss.formId;
  return {
    title: name,
    why: pick.diff === 0 ? "Leaves Max Battle spots today" : "Leaves Max Battle spots tomorrow",
    href: `./#dex/${encodeURIComponent(pick.boss.formId)}`,
    tier: pick.diff === 0 ? TIER_LEAVING_TODAY : TIER_LEAVING_TOMORROW,
  };
}

// Up to 3 {title, why, href} rows, highest value first. Never padded with
// filler — fewer than 3 real candidates means fewer than 3 rows.
export function dailyPlan({
  now = new Date(), currentEvents = null, currentBosses = null, currentMaxBattles = null,
  roster = null, forms = {}, medalState = null,
} = {}) {
  const candidates = [
    frustrationCandidate({ currentEvents, roster, forms, now }),
    raidHourCandidate({ currentEvents, forms, now, medalState }),
    spotlightCandidate({ currentEvents, forms, now, medalState }),
    maxEventCandidate({ currentEvents, roster, forms, now, medalState }),
    rotationBossCandidate({ currentBosses, forms, now }),
    maxBossCandidate({ currentMaxBattles, forms, now }),
  ].filter(Boolean);
  // Sort BEFORE dedupe: two candidates can share an href (e.g. a rotation
  // boss leaving today and a Raid Hour starting today for that same boss,
  // both "./?boss=X#raids") and the better-tier one must win the slot, not
  // whichever happened to be pushed into `candidates` first.
  const seen = new Set();
  const deduped = candidates
    .sort((left, right) => left.tier - right.tier)
    .filter((item) => {
      const key = item.href ?? item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return deduped
    .slice(0, 3)
    .map(({ title, why, href, eventId }) => ({ title, why, href, eventId }));
}

// ponytail: dismissal is one localStorage flag per day, same disposable-UI
// contract as today-tasks.js's todayTaskKey — not data worth syncing.
export function dailyPlanDismissedKey(dateISO) {
  return `daily-plan-dismissed:${dateISO}`;
}
