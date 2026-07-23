// Coming up: a 14-day forward calendar over the same currentEvents feed
// home.js/today.js/cd-brief.js already read (data/curated/current-events.json,
// synced from ScrapedDuck). No new data source, no fabricated future
// bosses — only what the feed itself states: future raid/spotlight hours
// (with their resolved boss), Community Day, and other one-off dated
// events, grouped by calendar day, plus a 5-star-rotation boundary hint
// derived from raid-battles event start/end boundaries in that same feed.
import { escapeHtml, formatEventWhen, safeEventLink, startOfDay } from "./views/home.js";

const HORIZON_DAYS = 14;
const TEASER_CAP = 3;

// Same backdrop kinds Home's week strip already excludes — a season/pass/
// league/choose-your-path isn't a single dated occurrence. raid-battles is
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
    ? `<p class="event-action">${escapeHtml(item.gap.headline)} — <a class="safe-escape" href="${escapeHtml(item.gap.href)}">See Build Next →</a></p>`
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

function dayGroup(group) {
  return `<div class="home-event-type-group">
    <p class="event-type-heading"><span class="event-type-badge">${escapeHtml(dayHeaderLabel(group.date))}</span></p>
    <div class="home-event-grid">${group.items.map(itemRow).join("")}</div>
  </div>`;
}

// Collapsed by default, same pattern as renderCurrentEvents's "Upcoming
// events" accordion — id used by app.js's reveal-upcoming action.
export function renderUpcomingSection({
  currentEvents, forms, now = new Date(), gapByFormId = null,
} = {}) {
  const days = buildUpcomingCalendar({ currentEvents, forms, now, gapByFormId });
  const body = days.length
    ? days.map(dayGroup).join("")
    : `<p class="event-type-blurb">Nothing scheduled in the next 14 days yet — check back after the next data refresh.</p>`;
  return `<section class="home-event-section" aria-labelledby="upcoming-title">
    <details id="upcoming-details" class="home-event-details">
      <summary id="upcoming-title">Coming up (next 14 days)</summary>
      ${body}
    </details>
  </section>`;
}

function teaserRow(item) {
  return `<a class="week-strip-row" href="${escapeHtml(item.href)}"${item.external ? ' target="_blank" rel="noopener"' : ""} data-event-id="${escapeHtml(item.id)}">
    <span class="week-strip-badge">${escapeHtml(item.badge)}</span>
    <span class="week-strip-when">${escapeHtml(item.when)}</span>
    <span class="week-strip-name">${escapeHtml(item.name)}</span>
  </a>`;
}

// Compact next-3 teaser for Home, next to the week strip — only linkable
// rows (a boss row or a safe external link); rotation hints and unlinkable
// generic events show up in the full Coming Up section below instead.
export function renderUpcomingTeaser({ currentEvents, forms, now = new Date() } = {}) {
  const days = buildUpcomingCalendar({ currentEvents, forms, now });
  const items = days.flatMap((day) => day.items).filter((item) => item.href).slice(0, TEASER_CAP);
  if (!items.length) return "";
  return `<section class="home-week-strip fallback-section" aria-labelledby="upcoming-teaser-title">
    <h3 id="upcoming-teaser-title" class="home-section-title">Coming up</h3>
    <div class="week-strip-list">${items.map(teaserRow).join("")}</div>
    <button type="button" class="week-strip-all-link" data-action="reveal-upcoming">Next 14 days →</button>
  </section>`;
}
