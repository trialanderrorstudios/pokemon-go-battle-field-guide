// Coming up: a 14-day forward calendar over the same currentEvents feed
// home.js/today.js/cd-brief.js already read (data/curated/current-events.json,
// synced from ScrapedDuck). No new data source, no fabricated future
// bosses — only what the feed itself states: future raid/spotlight hours
// (with their resolved boss), Community Day, and other one-off dated
// events, grouped by calendar day, plus a 5-star-rotation boundary hint
// derived from raid-battles event start/end boundaries in that same feed.
import { escapeHtml, formatEventWhen, safeEventLink, startOfDay } from "./views/home.js";

const HORIZON_DAYS = 14;

// Always-on backdrops: a season/pass/league/choose-your-path isn't a single
// dated occurrence, and would crowd out the week's real ones. raid-battles is
// excluded from the per-day cards too; it's handled separately below for
// the 5-star rotation-boundary hint instead.
const DAY_EXCLUDED_KINDS = new Set([
  "season", "go-pass", "go-battle-league", "choose-your-path", "raid-battles",
]);

function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function dayHeaderLabel(date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// ── 5-star rotation-boundary hints ──────────────────────────────────────
const FIVE_STAR_SUFFIX = / in 5-star Raid Battles$/i;

function fiveStarWindows(events) {
  return (events ?? [])
    .filter((event) => event.kind === "raid-battles" && FIVE_STAR_SUFFIX.test(event.name ?? ""))
    .map((event) => ({ ...event, start: new Date(event.startsAt), end: new Date(event.endsAt) }))
    .filter((event) => !Number.isNaN(event.start.valueOf()) && !Number.isNaN(event.end.valueOf()))
    .sort((left, right) => left.start - right.start);
}

function fiveStarBossName(event) {
  return event.name.replace(FIVE_STAR_SUFFIX, "");
}

// One hint per 5-star window in the feed: "confirmed" whenever the feed
// already lists that window's boss + start date (the normal case —
// ScrapedDuck usually publishes next week's rotation ahead of time, which
// is exactly how "Kyurem next Wednesday" is knowable here: the feed's own
// Kyurem 5-star Raid Battles start date). "Likely" only covers the
// CURRENT window's own end date, and only when the feed hasn't listed any
// window after it yet — inferred from that boundary, never a guessed boss.
export function rotationBoundaryHints(events, now, horizonEnd) {
  const windows = fiveStarWindows(events);
  const hints = [];
  for (const event of windows) {
    if (event.start > now && event.start <= horizonEnd) {
      hints.push({
        date: event.start,
        confirmed: true,
        text: `5-star rotation changes to ${fiveStarBossName(event)} — feed-listed start date.`,
      });
    }
  }
  const current = windows.find((event) => event.start <= now && now < event.end);
  const hasAnyNext = current && windows.some((event) => event.start > current.start);
  if (current && !hasAnyNext && current.end > now && current.end <= horizonEnd) {
    hints.push({
      date: current.end,
      confirmed: false,
      text: "5-star rotation likely changes here — the feed lists the current window ending this date, but hasn't posted next week's boss yet.",
    });
  }
  return hints;
}

// ── happening now ────────────────────────────────────────────────────────
// An event already running has a start date in the past, so the day calendar
// below can never reach it — and that includes every DAY_EXCLUDED_KINDS
// backdrop, which is always in progress by definition. This group is the app's
// only surface for either since Home's all-events accordion was retired.
// raid-battles stays out: the current-bosses grid on the same page already
// answers "what's in raids right now", and the rotation hints cover the rest.
export function happeningNowEvents(events, now) {
  return (events ?? [])
    .filter((event) => event.kind !== "raid-battles")
    .map((event) => ({ ...event, start: new Date(event.startsAt), end: new Date(event.endsAt) }))
    .filter((event) => !Number.isNaN(event.start.valueOf())
      && event.start <= now
      && (Number.isNaN(event.end.valueOf()) || event.end > now))
    .sort((left, right) => left.end - right.end);
}

// ── per-day items ────────────────────────────────────────────────────────
function boundedFutureEvents(events, now, horizonEnd) {
  return (events ?? [])
    .filter((event) => !DAY_EXCLUDED_KINDS.has(event.kind))
    .map((event) => ({ ...event, start: new Date(event.startsAt) }))
    .filter((event) => !Number.isNaN(event.start.valueOf()) && event.start > now && event.start <= horizonEnd)
    .sort((left, right) => left.start - right.start);
}

// gapByFormId is an optional lookup from a sibling "you lack strong
// counters" gap analyzer — { [formId]: { headline, href } }. That lane
// hasn't shipped yet, so this stays undefined/no-op until it does.
function eventItem(event, forms, now, gapByFormId) {
  const name = forms?.[event.formId]?.name ?? event.name;
  const href = event.formId ? `./?boss=${encodeURIComponent(event.formId)}#raids` : safeEventLink(event.link);
  return {
    id: `upcoming-${event.eventId}`,
    badge: event.typeLabel ?? event.kind ?? "Event",
    name,
    when: formatEventWhen(event.startsAt, event.endsAt, now),
    href,
    external: !event.formId && Boolean(href),
    prepNudge: Boolean(event.formId),
    gap: event.formId ? (gapByFormId?.[event.formId] ?? null) : null,
  };
}

function hintItem(hint) {
  return {
    id: `upcoming-rotation-${dateKey(startOfDay(hint.date))}-${hint.confirmed ? "confirmed" : "likely"}`,
    badge: hint.confirmed ? "5-star rotation" : "5-star rotation (likely)",
    name: hint.text,
    when: "",
    href: null,
    external: false,
    prepNudge: false,
    gap: null,
  };
}

// Day-grouped calendar: [{ dateKey, date, items }, ...] sorted soonest
// first. Empty array is the honest empty-horizon state — nothing in the
// feed falls inside the window.
export function buildUpcomingCalendar({
  currentEvents, forms = {}, now = new Date(), horizonDays = HORIZON_DAYS, gapByFormId = null,
} = {}) {
  const events = currentEvents?.events ?? [];
  const horizonEnd = addDays(now, horizonDays);
  const byDay = new Map();
  const addTo = (date, item) => {
    const key = dateKey(startOfDay(date));
    if (!byDay.has(key)) byDay.set(key, { dateKey: key, date: startOfDay(date), items: [] });
    byDay.get(key).items.push(item);
  };
  for (const event of boundedFutureEvents(events, now, horizonEnd)) {
    addTo(event.start, eventItem(event, forms, now, gapByFormId));
  }
  for (const hint of rotationBoundaryHints(events, now, horizonEnd)) {
    addTo(hint.date, hintItem(hint));
  }
  return [...byDay.values()].sort((left, right) => left.date - right.date);
}

// ── rendering ────────────────────────────────────────────────────────────
function itemRow(item) {
  const gapLine = item.gap
    ? `<p class="event-action">${escapeHtml(item.gap.headline)} — <a class="safe-escape" href="${escapeHtml(item.gap.href)}">See Roster Gaps →</a></p>`
    : "";
  const prepLine = item.prepNudge ? `<p class="event-action">Prep your counters early →</p>` : "";
  const body = `<p class="event-type-badge">${escapeHtml(item.badge)}</p>
    ${item.when ? `<p class="event-when">${escapeHtml(item.when)}</p>` : ""}
    <h4>${escapeHtml(item.name)}</h4>
    ${prepLine}${gapLine}`;
  if (item.href) {
    return `<a class="home-event-card" href="${escapeHtml(item.href)}"${item.external ? ' target="_blank" rel="noopener"' : ""} data-event-id="${escapeHtml(item.id)}">${body}</a>`;
  }
  return `<div class="home-event-card" data-event-id="${escapeHtml(item.id)}">${body}</div>`;
}

function group(label, items) {
  return `<div class="home-event-type-group">
    <p class="event-type-heading"><span class="event-type-badge">${escapeHtml(label)}</span></p>
    <div class="home-event-grid">${items.map(itemRow).join("")}</div>
  </div>`;
}

function dayGroup(day) {
  return group(dayHeaderLabel(day.date), day.items);
}

// Collapsed by default: the one rendering of the events feed on Home —
// what's running right now, then the next 14 days.
export function renderUpcomingSection({
  currentEvents, forms, now = new Date(), gapByFormId = null,
} = {}) {
  const days = buildUpcomingCalendar({ currentEvents, forms, now, gapByFormId });
  // prepNudge off: "Prep your counters early" is advice for something that
  // hasn't started yet.
  const running = happeningNowEvents(currentEvents?.events, now)
    .map((event) => ({ ...eventItem(event, forms, now, gapByFormId), prepNudge: false }));
  const nowGroup = running.length ? group("Happening now", running) : "";
  const body = days.length || running.length
    ? nowGroup + days.map(dayGroup).join("")
    : `<p class="event-type-blurb">Nothing scheduled in the next 14 days yet — check back after the next data refresh.</p>`;
  return `<section class="home-event-section" aria-labelledby="upcoming-title">
    <details id="upcoming-details" class="home-event-details">
      <summary id="upcoming-title">Now and coming up (next 14 days)</summary>
      ${body}
    </details>
  </section>`;
}
