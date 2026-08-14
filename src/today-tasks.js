// Today strip (fun item 5): a tiny, honest checklist of what's worth doing
// right now, distinct from views/today.js's own full "Today" section
// (raid-hour/CD/gym/gap items, folded into Home separately). Pure — no DOM,
// no storage reads here; buildTodayTasks only ever composes already-synced
// data (currentBosses/currentMaxBattles/currentEvents/roster/forms) and the
// caller's own collection.js collectionProgress() result. Reuses home.js's
// pickMaxEvent/maxEventSubject/pickShowcaseEvent rather than reparsing the
// Max/showcase event feed a second way — home.js already imports
// renderToday from views/today.js, so a today-tasks.js <-> home.js cycle is
// the same established shape, just one directory hop over.
import { maxEventSubject, pickMaxEvent, pickShowcaseEvent } from "./views/home.js";

function dateOnly(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

// currentBosses/currentMaxBattles endsAt is a bare "YYYY-MM-DD" — the boss
// runs THROUGH that LOCAL calendar day, with no timezone of its own.
// `new Date("2026-08-13")` parses that as UTC midnight, which in any
// negative-UTC-offset zone (e.g. America/New_York) lands on the previous
// LOCAL day — the same footgun home.js's own endOfDay carries. Parsing the
// y/m/d digits straight into a local Date sidesteps it rather than
// inheriting that skew into a brand new module.
function localDateFromISO(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.valueOf()) ? null : date;
}

// Whole calendar days between `now` and `dateString` (date-only, no time-of-
// day) — null when dateString doesn't parse.
function daysUntil(dateString, now) {
  const target = localDateFromISO(dateString);
  if (!target) return null;
  return Math.round((target - dateOnly(now)) / 86400000);
}

// today/tomorrow/weekday name for a date up to 6 days out; null once it's
// past, or too far out to honestly call "soon".
function relativeDayLabel(dateString, now) {
  const diff = daysUntil(dateString, now);
  if (diff === null || diff < 0 || diff > 6) return null;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return localDateFromISO(dateString).toLocaleDateString("en-US", { weekday: "long" });
}

function maxEventRow({ currentEvents, roster, now }) {
  const event = pickMaxEvent(currentEvents?.events, now);
  if (!event) return null;
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const isLive = start <= now && (Number.isNaN(end.valueOf()) || end > now);
  const isToday = !Number.isNaN(start.valueOf()) && start.toDateString() === now.toDateString();
  if (!isLive && !isToday) return null; // upcoming-but-not-today: belongs to the rail's timeline, not Today
  const subject = maxEventSubject(event.name);
  const label = subject ? `${subject.modifier} ${subject.species}` : event.name;
  const kindLabel = event.kind === "max-mondays" ? "Max Monday" : "Max Battle";
  const readyCount = (roster?.instances ?? []).filter((instance) => instance.canDynamax || instance.canGigantamax).length;
  return {
    id: `today-max-${event.eventId ?? label}`,
    text: `${kindLabel} ${isLive ? "live now" : "tonight"} — you have ${readyCount} Max-ready`,
    href: event.formId ? `./?boss=${encodeURIComponent(event.formId)}#raids` : "./#raids",
    kind: "max-event",
  };
}

// Raid rotation boss leaving today or tomorrow — currentBosses.json, same
// bare-endsAt-date shape renderFieldBriefing's expiry filter reads.
function rotationEndingRow({ currentBosses, forms, now }) {
  const candidates = (currentBosses?.bosses ?? [])
    .map((boss) => ({ boss, diff: daysUntil(boss.endsAt, now) }))
    .filter((row) => row.diff === 0 || row.diff === 1)
    .sort((left, right) => left.diff - right.diff || left.boss.formId.localeCompare(right.boss.formId));
  const pick = candidates[0];
  if (!pick) return null;
  const name = forms?.[pick.boss.formId]?.name ?? pick.boss.formId;
  return {
    id: `today-rotation-${pick.boss.formId}`,
    text: `${name} leaves the rotation ${pick.diff === 0 ? "today" : "tomorrow"}`,
    href: `./?boss=${encodeURIComponent(pick.boss.formId)}#raids`,
    kind: "rotation-boss",
  };
}

// Operator-curated Max Battle boss leaving soon — data/curated/max-battles.json
// (currentMaxBattles), the same feed home.js's liveMaxBosses/"Now in Max
// Battle spots" note reads.
function maxBossEndingRow({ currentMaxBattles, forms, now }) {
  const candidates = (currentMaxBattles?.bosses ?? [])
    .map((boss) => ({ boss, label: relativeDayLabel(boss.endsAt, now) }))
    .filter((row) => row.label)
    .sort((left, right) => daysUntil(left.boss.endsAt, now) - daysUntil(right.boss.endsAt, now)
      || left.boss.formId.localeCompare(right.boss.formId));
  const pick = candidates[0];
  if (!pick) return null;
  const name = forms?.[pick.boss.formId]?.name ?? pick.boss.formId;
  return {
    id: `today-maxboss-${pick.boss.formId}`,
    text: `${name} leaves Max spots ${pick.label}`,
    href: `./#dex/${encodeURIComponent(pick.boss.formId)}`,
    kind: "max-boss",
  };
}

// Nearest-to-done generation, collectionProgress-derived (collection.js) —
// threshold <=3 remaining, 0 remaining excluded (already complete, nothing
// to nudge).
function collectionCompletionRow({ collectionProgress }) {
  const candidates = (collectionProgress?.byGeneration ?? [])
    .map((bucket) => ({ ...bucket, remaining: bucket.total - bucket.caught }))
    .filter((bucket) => bucket.remaining > 0 && bucket.remaining <= 3)
    .sort((left, right) => left.remaining - right.remaining || (left.gen ?? 0) - (right.gen ?? 0));
  const pick = candidates[0];
  if (!pick) return null;
  return {
    id: `today-collection-gen-${pick.gen}`,
    text: `${pick.remaining} mark${pick.remaining === 1 ? "" : "s"} from finishing Gen ${pick.gen}`,
    href: "./#more/collection",
    kind: "collection",
  };
}

// Live-or-starts-today PokéStop Showcase, only when the roster actually has
// a sized instance to enter — same "no roster, no claim" contract as
// home.js's showcaseAdvisorLine, which this deliberately doesn't call
// directly (that renders an HTML <p>, this needs a plain {text, href} row).
function showcaseRow({ currentEvents, roster, now }) {
  const event = pickShowcaseEvent(currentEvents?.events, now);
  if (!event) return null;
  const start = new Date(event.startsAt);
  const isLive = !Number.isNaN(start.valueOf()) && start <= now;
  const isToday = !Number.isNaN(start.valueOf()) && start.toDateString() === now.toDateString();
  if (!isLive && !isToday) return null;
  const sizedCount = (roster?.instances ?? [])
    .filter((instance) => Number.isFinite(instance?.heightM) && instance.heightM > 0
      && Number.isFinite(instance?.weightKg) && instance.weightKg > 0).length;
  if (!sizedCount) return null;
  return {
    id: `today-showcase-${event.eventId}`,
    text: `Showcase ${isLive ? "running" : "starting today"} — you have ${sizedCount} Pokémon with recorded sizes`,
    href: null,
    kind: "showcase",
  };
}

// One-time-feel nudge — only fires while the roster is truly empty, never
// again once a single instance exists (not a recurring "did you scan today").
function scanNudgeRow({ roster }) {
  if ((roster?.instances ?? []).length > 0) return null;
  return {
    id: "today-scan-nudge",
    text: "Scan your recent catches to get started",
    href: "./#more/roster",
    kind: "scan-nudge",
  };
}

const MAX_TASKS = 5;

export function buildTodayTasks({
  currentBosses = null, currentMaxBattles = null, currentEvents = null, roster = null, forms = {},
  collectionProgress = null, now = new Date(),
} = {}) {
  const rows = [
    maxEventRow({ currentEvents, roster, now }),
    rotationEndingRow({ currentBosses, forms, now }),
    maxBossEndingRow({ currentMaxBattles, forms, now }),
    collectionCompletionRow({ collectionProgress }),
    showcaseRow({ currentEvents, roster, now }),
    scanNudgeRow({ roster }),
  ].filter(Boolean);
  return rows.slice(0, MAX_TASKS);
}

// Local (not UTC) calendar-day key — mirrors views/today.js's own
// localDateKey so a late-evening UTC rollover doesn't strike today's checks
// early for US timezones. Not imported from today.js (that helper isn't
// exported) — this is the one small duplication, not a re-derivation of any
// real logic.
export function todayDateISO(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// One flat localStorage key per (day, task id) — same set/remove flip
// contract as app.js's toggle-briefing-card, not views/today.js's single
// per-day JSON array (that module's toggleTodayTask is a different feature,
// see home.js's Today strip section).
export function todayTaskKey(dateISO, taskId) {
  return `pogo-today-strip-done:${dateISO}:${taskId}`;
}
