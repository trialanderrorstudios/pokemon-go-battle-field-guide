// Today: the open-every-day checklist. Composes existing modules only — no
// new math lives here. Signal -> source:
//   raid/spotlight hour today -> data.currentEvents (same feed Home reads),
//     window text via home.js's formatRaidHourWhen
//   Community Day today -> cd-brief.js's communityDayTodayItem, same
//     data.currentEvents feed, guarded to only fire the actual CD day
//   daily-pass verdict + coach picks -> coach.js buildCoachSummary (worthRaiding)
//   gym status -> gym-defense-log.js buildLeaderboard/durationMs (local active entries)
//   staleness / profile -> optional round-8 modules, no-op when absent
import { escapeHtml, formatRaidHourWhen } from "./home.js";
import { buildCoachSummary } from "../coach.js";
import { durationMs } from "../gym-defense-log.js";
import { communityDayTodayItem } from "../cd-brief.js";

const HOUR_EVENT_KINDS = new Set(["raid-hour", "pokemon-spotlight-hour"]);
const HOUR_EVENT_LABEL = Object.freeze({ "raid-hour": "Raid Hour", "pokemon-spotlight-hour": "Spotlight Hour" });
const HOUR_EVENT_SUFFIX = Object.freeze({ "raid-hour": / Raid Hour$/, "pokemon-spotlight-hour": / Spotlight Hour$/ });

const VERDICT_BY_BAND = Object.freeze({
  "solo-able": "Yes — solo-able",
  duoable: "Yes",
  "bring-3-4": "Bring friends",
  "full-lobby": "Only with a full lobby",
  "not-enough-data": "Not worth it yet",
});

function sameDay(left, right) {
  return left.toDateString() === right.toDateString();
}

function localDateKey(now) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// "TODAY · 6-7 PM" -> "6-7 PM tonight" (evening) / "6-7 PM today" (morning) —
// reuses home.js's shared hour formatter rather than reparsing the clock.
// Every event reaching this helper is already same-day (todaysHourEvents
// filtered on it), so formatRaidHourWhen's relative-day token is always
// "TODAY" — swap it for a same-day countdown word instead.
function todayWhen(startsAt, endsAt, now) {
  const full = formatRaidHourWhen(startsAt, endsAt, now);
  if (!full) return "";
  const rest = full.replace(/^\S+ · /, "");
  return `${rest} ${/PM$/.test(rest) ? "tonight" : "today"}`;
}

function todaysHourEvents(events, now) {
  return (events ?? [])
    .filter((event) => HOUR_EVENT_KINDS.has(event.kind) && sameDay(new Date(event.startsAt), now))
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
}

function hourEventItem(event, forms, now) {
  const name = forms?.[event.formId]?.name ?? event.name.replace(HOUR_EVENT_SUFFIX[event.kind] ?? "", "");
  return {
    id: `event-${event.eventId}`,
    title: `${HOUR_EVENT_LABEL[event.kind] ?? "Event"}: ${name}`,
    detail: `${todayWhen(event.startsAt, event.endsAt, now)}${event.action ? ` — ${event.action}` : ""}`,
    href: `./?boss=${encodeURIComponent(event.formId)}#raids`,
  };
}

// null (not an empty-array item) when nothing's in rotation, so an empty
// week collapses cleanly into the "nothing scheduled" card instead of
// leaving a hollow "no bosses" row behind.
function dailyPassItem(summary) {
  const top = summary.worthRaiding[0];
  if (!top) return null;
  return {
    id: "daily-pass",
    title: "Worth your free daily pass?",
    detail: `${VERDICT_BY_BAND[top.band] ?? "Check"} — ${top.name}: ${top.headline}`,
    href: top.href,
  };
}

function formatElapsed(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Only the local player's still-out defenders — a completed entry already
// paid out or is history, not a today task. The "collect coins?" line is the
// same fact already taught on the Gyms page (1 coin/10 min, capped at
// 50/day account-wide, paid out on return), not a new computed verdict.
function gymStatusItems(defenseLog, now) {
  const active = (defenseLog?.entries ?? [])
    .filter((entry) => entry.isLocal && !entry.endedAt)
    .map((entry) => ({ ...entry, elapsedMs: durationMs(entry, now) }))
    .sort((left, right) => right.elapsedMs - left.elapsedMs);
  return active.map((entry) => ({
    id: `gym-${entry.id}`,
    title: `${entry.pokemon} @ ${entry.gymName}`,
    detail: `Holding for ${formatElapsed(entry.elapsedMs)}. Coins pay out when it's knocked out and returns — 1 coin per 10 min, capped at 50/day account-wide.`,
    href: "./#gyms",
  }));
}

function coachPickItems(summary) {
  return summary.worthRaiding.slice(0, 2).map((row) => ({
    id: `coach-${row.formId}`,
    title: `Coach pick: ${row.name}`,
    detail: row.headline,
    href: "./#coach",
  }));
}

// Round-8's staleness module isn't merged yet — `staleness` stays optional
// and this is a no-op until it lands. Shape expected once it does:
// { active: boolean, message?: string, href?: string }.
function stalenessItems(staleness) {
  if (!staleness?.active) return [];
  return [{
    id: "staleness",
    title: "Data refresh nudge",
    detail: staleness.message ?? "Your data may be stale — check for updates.",
    href: staleness.href ?? "./#more",
  }];
}

// ponytail: no signal in this round carries a minLevel yet — no data source
// defines "beyond reach" thresholds, so this doesn't fabricate one. It just
// threads `profile.trainerLevel` through so round-8's profile module can
// attach a `minLevel` to a future item; today, every item passes through
// unchanged whether profile is present or not. Upgrade when a real
// level-gated signal exists.
function applyProfileGate(items, profile) {
  const trainerLevel = profile?.trainerLevel;
  if (!Number.isInteger(trainerLevel)) return items;
  return items.map((item) => (Number.isInteger(item.minLevel) && item.minLevel > trainerLevel
    ? { ...item, detail: `${item.detail} (needs Trainer Level ${item.minLevel} — you're ${trainerLevel})`, locked: true }
    : item));
}

export function buildTodayItems({
  data = {}, roster = {}, defenseLog = null, staleness = null, profile = null, now = new Date(),
} = {}) {
  const summary = buildCoachSummary({ data, roster, now, trainerLevel: profile?.trainerLevel });
  const forms = data?.core?.forms ?? data?.forms ?? {};
  const pass = dailyPassItem(summary);
  const cdToday = communityDayTodayItem(data?.currentEvents?.events, forms, now);
  const items = [
    ...todaysHourEvents(data?.currentEvents?.events, now).map((event) => hourEventItem(event, forms, now)),
    ...(cdToday ? [cdToday] : []),
    ...(pass ? [pass] : []),
    ...gymStatusItems(defenseLog, now),
    ...coachPickItems(summary),
    ...stalenessItems(staleness),
  ];
  return applyProfileGate(items, profile);
}

function doneStorageKey(now) {
  return `pogo-today-done:${localDateKey(now)}`;
}

function loadDoneIds(storage, now) {
  try {
    const raw = JSON.parse(storage?.getItem?.(doneStorageKey(now)) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function isTodayTaskDone(taskId, storage, now = new Date()) {
  return loadDoneIds(storage, now).has(taskId);
}

// ponytail: one flat localStorage key per calendar day, no cleanup of past
// days — an orphaned "yesterday" key is a few harmless bytes, not worth a
// retention scheme for disposable daily UI state.
export function toggleTodayTask(taskId, storage, now = new Date()) {
  const done = loadDoneIds(storage, now);
  if (done.has(taskId)) done.delete(taskId);
  else done.add(taskId);
  storage?.setItem?.(doneStorageKey(now), JSON.stringify([...done]));
}

function todayTaskRow(item, done) {
  return `<li class="today-task-row${done ? " is-done" : ""}${item.locked ? " is-locked" : ""}">
    <button type="button" class="today-check" data-action="toggle-today-task" data-today-task-id="${escapeHtml(item.id)}" aria-pressed="${done}" aria-label="${done ? "Mark not done: " : "Mark done: "}${escapeHtml(item.title)}"><span aria-hidden="true">${done ? "☑" : "☐"}</span></button>
    <a class="today-task-body" href="${escapeHtml(item.href)}" data-today-task-link="${escapeHtml(item.id)}">
      <p class="today-task-title">${escapeHtml(item.title)}</p>
      <p class="today-task-detail">${escapeHtml(item.detail)}</p>
    </a>
  </li>`;
}

export function renderToday({
  data = {}, roster = {}, defenseLog = null, staleness = null, profile = null, now = new Date(), storage = null,
} = {}) {
  const items = buildTodayItems({ data, roster, defenseLog, staleness, profile, now });
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const doneIds = loadDoneIds(storage, now);
  const body = items.length
    ? `<ul class="today-task-list">${items.map((item) => todayTaskRow(item, doneIds.has(item.id))).join("")}</ul>`
    : `<p class="today-empty fallback-section">Nothing scheduled today — <a class="safe-escape" href="./#basics">Basics</a> or <a class="safe-escape" href="./#drill">Type Drill</a>?</p>`;
  return `<section class="today-view" aria-labelledby="today-view-title">
    <p class="status-kicker">${escapeHtml(dateLabel)}</p>
    <h2 id="today-view-title">Today</h2>
    ${body}
  </section>`;
}
