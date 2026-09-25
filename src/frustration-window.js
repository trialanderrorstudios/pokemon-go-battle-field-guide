// Frustration removal window — the one Charged-TM decision with a hard
// deadline. A Shadow Pokemon's Frustration can ONLY be cleared during a Team
// GO Rocket "Taken Over" event, so a shadow sitting on it is a one-charge-move
// mon until the next window opens, and an Elite TM spent before the window is
// spent next to a dead slot.
//
// Composes existing machinery only:
//   window dates  -> currentEvents rows (ScrapedDuck-fed, never hand-typed)
//   the bonus     -> the curated `bonuses` merged onto that row by
//                    assemble.py's _load_event_bonuses (the feed carries no
//                    bonus data at all)
//   which shadows -> the roster's own instances; a shadow is "blocked" only
//                    when its logged moves actually include FRUSTRATION, never
//                    inferred from being a shadow.
import { escapeHtml } from "./views/home.js";

const FRUSTRATION = "FRUSTRATION";

function parse(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

// Roster instances whose logged charge moves include Frustration, newest
// first by nothing in particular — order is the roster's own.
export function shadowsOnFrustration(roster, forms) {
  return (roster?.instances ?? [])
    .filter((instance) => (instance?.chargedMoves ?? []).includes(FRUSTRATION))
    .map((instance) => ({
      instanceId: instance.id,
      formId: instance.formId,
      name: forms?.[instance.formId]?.name ?? instance.formId,
      cp: instance.cp ?? null,
    }));
}

// {status, event, startsAt, endsAt, daysUntil, blocked} — or null when no
// event in the feed carries the bonus at all. status is:
//   'open'     the window is live right now
//   'upcoming' announced, not started
// A window that has already ended is not reported as anything: it is past,
// and a stale "you missed it" banner is noise, not information.
export function frustrationWindow({ currentEvents, roster, forms, now = new Date() } = {}) {
  const rows = (currentEvents?.events ?? [])
    .filter((event) => event?.bonuses?.frustrationRemovable)
    .map((event) => ({ event, startsAt: parse(event.startsAt), endsAt: parse(event.endsAt) }))
    .filter((row) => row.startsAt && row.endsAt && row.endsAt >= now)
    .sort((left, right) => left.startsAt - right.startsAt);
  if (!rows.length) return null;

  const { event, startsAt, endsAt } = rows[0];
  const open = now >= startsAt;
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    status: open ? "open" : "upcoming",
    event,
    startsAt,
    endsAt,
    daysUntil: open ? 0 : Math.round((startOfDay(startsAt) - startOfDay(now)) / 86400000),
    blocked: shadowsOnFrustration(roster, forms),
  };
}

function dayLabel(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Briefing card. Silent (empty string) when no window is announced — the same
// silence-not-placeholder contract the other briefing cards use.
export function renderFrustrationWindowCard(result) {
  if (!result) return "";
  const { status, event, startsAt, endsAt, daysUntil, blocked } = result;
  const when = status === "open"
    ? `Open now, through ${escapeHtml(dayLabel(endsAt))}`
    : `${escapeHtml(dayLabel(startsAt))}–${escapeHtml(dayLabel(endsAt))} · ${daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}`;
  // Naming the actual mons is the point: "a window is coming" is a calendar
  // entry, "your three shadows are waiting on it" is a decision.
  const list = blocked.length
    ? `<p class="briefing-note">${blocked.length === 1 ? "1 Shadow is" : `${blocked.length} Shadows are`} stuck on Frustration: ${blocked
      .map((row) => escapeHtml(row.cp ? `${row.name} (${row.cp})` : row.name)).join(", ")}</p>`
    : `<p class="briefing-note">No logged Shadow is carrying Frustration right now.</p>`;
  return `<div class="fallback-section frustration-window-card" data-frustration-status="${escapeHtml(status)}">
    <p class="status-kicker">Frustration removal</p>
    <h2>${escapeHtml(event.name)}</h2>
    <p class="briefing-note"><strong>${when}</strong> — ${escapeHtml(event.bonuses.summary)}</p>
    ${list}
    <p class="briefing-note">Clear Frustration with a regular Charged TM first, then spend any Elite TM. An Elite TM used before the window buys a move that sits next to a dead slot.</p>
  </div>`;
}
