// "Hold off on evolving" advisor — a Community Day's featured species gets
// an exclusive move only on evolutions performed DURING the event window, so
// evolving a Nickit the day before Nickit Community Day forfeits that move
// for good. This surfaces which forms in the roster are worth holding, and
// flips the advice to "evolve now" once the window opens. Composes existing
// machinery only:
//   events feed        -> currentEvents.events (data/curated/current-events.json,
//                          kind "community-day" rows already carry the
//                          featured species' formId — no scraping, no guessing)
//   evolution chain     -> forms[].evolves_to (evolution.py's one-step edge
//                          list), walked upward the same way dex.js's
//                          evolvesFrom/evolutionAcquisition do, rather than a
//                          second copy of that chain-walk
//   local-day/time math -> boss-countdown.js/journal.js's part-wise Date()
//                          construction; startsAt/endsAt here are bare
//                          "YYYY-MM-DDTHH:mm:ss.SSS" local wall-clock
//                          strings with no zone suffix, so `new Date(str)`
//                          already parses them as local time — appending "Z"
//                          would be the bug, not the fix.
import { escapeHtml } from "./views/home.js";

// Every form whose evolves_to chain eventually reaches `formId`, closest
// stage last (so the array reads root -> ... -> immediate pre-evolution).
// Mirrors dex.js's evolvesFrom() (search every form for one whose evolves_to
// points at the current node) rather than requiring a reverse-edge index
// this data doesn't have. `visited` guards the same cycle case
// evolutionAcquisition() does — bad curated data degrades to a truncated
// chain, never a hang.
function preEvolutionsOf(formId, forms, visited = new Set([formId])) {
  const parent = Object.values(forms)
    .find((candidate) => (candidate.evolves_to ?? []).some((step) => step.formId === formId));
  if (!parent || visited.has(parent.form_id)) return [];
  visited.add(parent.form_id);
  return [...preEvolutionsOf(parent.form_id, forms, visited), parent.form_id];
}

// The featured form evolves further -> hold it too (evolving IT during the
// window still forfeits a later exclusive-move step); the featured form IS
// the final stage -> nothing to hold on it, only its pre-evolutions.
function holdFormIdsFor(featuredFormId, forms) {
  const pre = preEvolutionsOf(featuredFormId, forms);
  const featured = forms[featuredFormId];
  const evolvesFurther = (featured?.evolves_to ?? []).length > 0;
  return evolvesFurther ? [...pre, featuredFormId] : pre;
}

function ownedCountsFor(holdFormIds, roster) {
  const instances = roster?.instances ?? [];
  const counts = {};
  for (const formId of holdFormIds) {
    counts[formId] = instances.filter((instance) => instance.formId === formId).length;
  }
  return counts;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric" });
}

// The hedge in both lines is deliberate: the feed never names the exclusive
// move (or confirms one exists for this event) — this is the long-standing
// Community Day mechanic, not a data-backed move id, so the wording says
// "usually", never a specific move.
function lineFor({
  lineName, eventName, status, start, end,
}) {
  if (status === "live") {
    return `Evolve now: ${eventName} is live until ${formatTime(end)} — evolutions during the window usually get the exclusive move.`;
  }
  return `Hold evolutions in the ${lineName} line — ${eventName} on ${formatDate(start)} usually grants an exclusive move when you evolve during the event.`;
}

// [{eventId, eventName, featuredFormId, featuredName, startsAt, endsAt,
//   status, holdFormIds, ownedCounts, line}] — one row per upcoming/live
// Community Day in the feed. Past Community Days (endsAt already gone) are
// excluded, not shown as expired holds.
export function evolutionHolds({
  currentEvents, forms, roster, now,
} = {}) {
  const events = currentEvents?.events ?? [];
  return events
    .filter((event) => event.kind === "community-day" && event.formId)
    .map((event) => ({ event, start: new Date(event.startsAt), end: new Date(event.endsAt) }))
    .filter((row) => !Number.isNaN(row.start.valueOf()) && !Number.isNaN(row.end.valueOf()) && row.end > now)
    .map(({ event, start, end }) => {
      const featuredName = forms?.[event.formId]?.name ?? event.formId;
      const holdFormIds = holdFormIdsFor(event.formId, forms ?? {});
      const status = now >= start ? "live" : "upcoming";
      return {
        eventId: event.eventId,
        eventName: event.name,
        featuredFormId: event.formId,
        featuredName,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status,
        holdFormIds,
        ownedCounts: ownedCountsFor(holdFormIds, roster),
        line: lineFor({
          lineName: featuredName, eventName: event.name, status, start, end,
        }),
      };
    });
}

// The hold row covering a given dex entry's formId, or null — dex.js's
// per-form lookup (a form can only be held for one Community Day at a time
// in this feed, so the first match is the only match).
export function holdForFormId(holds, formId) {
  return (holds ?? []).find((row) => row.holdFormIds.includes(formId)) ?? null;
}

// Home briefing card, one row per evolutionHolds() entry. "" when nothing's
// held (silence, not a placeholder) — same empty-state contract as
// boss-countdown.js's renderCountdownChips.
export function renderEvolutionHoldsCard({ holds, forms } = {}) {
  if (!holds?.length) return "";
  return `<div class="fallback-section evolution-holds-card">
    <p class="status-kicker">Hold off on evolving</p>
    ${holds.map((row) => `<div class="evolution-holds-row" data-status="${escapeHtml(row.status)}">
      <h2>${escapeHtml(row.featuredName)}</h2>
      <p class="briefing-note">${escapeHtml(row.line)}</p>
    </div>`).join("")}
  </div>`;
}
