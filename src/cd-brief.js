// Community Day prep brief — composes the existing events feed (data.currentEvents,
// same shape home.js/today.js already read) into one beginner-facing summary:
// featured Pokemon + sprite, exclusive move (or the honest "not in our data yet"
// line — see CD_EXCLUSIVE_MOVE_UNKNOWN_NOTE), the evolve-during-window rule, a
// static prep checklist, and a Today day-of row. No new math, no fetched data.
import { escapeHtml, formatEventWhen } from "./views/home.js";
import { spriteHtml } from "./sprites.js";

// Fact-checked 2026-07 against core Pokemon GO mechanics (not event-specific,
// so this never goes stale event to event): Pinap Berries double the Candy
// from a catch; evolving a Pokemon costs Candy only, never Stardust; Power Up
// costs Candy + Stardust.
export const CD_PREP_CHECKLIST = Object.freeze([
  "Restock Poke Balls (and Ultra Balls if you have them) — Community Day spawn rates burn through them fast.",
  "Save a stack of Pinap Berries — they double the Candy from a catch, useful if you're grinding for extra evolutions.",
  "Stock Stardust ahead if you plan to power up your best catch afterward — Power Up costs Candy + Stardust, but evolving costs Candy only.",
  "Clear Pokemon storage space before it starts — boosted spawns fill your box fast; transfer duplicates you don't need.",
]);

// Fact-checked 2026-07 against Niantic's own Community Day format (standard
// since 2019): evolving the featured Pokemon ALL THE WAY to its FINAL
// evolution WHILE the event is active teaches it that Community Day's
// exclusive charged move. For three-stage families (most classic CDs) that
// means evolving the middle stage too, not just the featured Pokemon's first
// evolution — Niantic's own event pages say "evolve [middle stage] into
// [final stage] during the event." Niantic sometimes also honors a short
// bonus window right after the event ends, but that window's length varies
// event to event and isn't in this app's data — no guessed number here,
// check the event's own page for it. Missed both windows? An Elite Charged
// TM can still teach the move directly to the already-evolved Pokemon later,
// no re-evolving required.
export const CD_EVOLVE_WINDOW_NOTE = "Evolve it all the way to its final evolution while the event is active to get the exclusive move — for three-stage families that means evolving the middle stage too, not just the featured Pokemon. Niantic sometimes extends a short bonus window right after the event ends too — the exact length varies, so check this event's own page for that number. Missed both? An Elite Charged TM can teach the move to it directly later, no re-evolving needed.";

// No move-family/exclusive-move data source exists in this app yet — raid,
// PvP, and move data are all keyed by formId, not by "which move a species
// gets from evolving during a specific event". So this is always the honest
// fallback today, never a guess.
// ponytail: single hardcoded honesty line, no lookup table, because no data
// source to look up ever populates one yet. Upgrade to a real per-event
// exclusiveMove field/branch once sync-rotation.mjs or current-events.json
// carries one.
export const CD_EXCLUSIVE_MOVE_UNKNOWN_NOTE = "This event's exclusive move isn't in our data yet — it gets added here after the event, once the evolved Pokemon and its moveset are confirmed.";

const CD_BRIEF_WINDOW_MS = 7 * 86400000;

function isCommunityDay(event) {
  return event?.kind === "community-day";
}

function isSameDay(left, right) {
  return left.toDateString() === right.toDateString();
}

// A Community Day counts as "featured" once it's within a week of starting
// (This Week's own horizon) and hasn't ended yet — covers both "starts in a
// few days" and "running right now". Reused by both the This Week card and
// Today's day-of row so there's one place this window is defined.
export function findFeaturedCommunityDay(events, now = new Date()) {
  const candidates = (events ?? [])
    .filter(isCommunityDay)
    .filter((event) => {
      const start = new Date(event.startsAt);
      const end = new Date(event.endsAt);
      if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return false;
      return end >= now && start.getTime() - now.getTime() <= CD_BRIEF_WINDOW_MS;
    });
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))[0];
}

function featuredName(event, forms) {
  return forms?.[event.formId]?.name ?? event.name.replace(/ Community Day$/, "");
}

export function buildCommunityDayBrief(event, { forms = {} } = {}) {
  if (!event) return null;
  return {
    eventId: event.eventId,
    formId: event.formId ?? null,
    name: featuredName(event, forms),
    primaryType: forms?.[event.formId]?.primary_type,
    when: formatEventWhen(event.startsAt, event.endsAt),
    action: event.action ?? null,
    checklist: CD_PREP_CHECKLIST,
    evolveWindowNote: CD_EVOLVE_WINDOW_NOTE,
    exclusiveMoveNote: CD_EXCLUSIVE_MOVE_UNKNOWN_NOTE,
  };
}

// Card for This Week/events — only rendered when a Community Day is within
// the featured window (see findFeaturedCommunityDay); empty string otherwise
// (the no-CD-scheduled empty state — silence, not a placeholder card).
export function renderCommunityDayBriefCard({ currentEvents, forms, now = new Date() } = {}) {
  const brief = buildCommunityDayBrief(findFeaturedCommunityDay(currentEvents?.events, now), { forms });
  if (!brief) return "";
  return `<section class="cd-brief fallback-section" aria-labelledby="cd-brief-title" data-event-id="${escapeHtml(brief.eventId)}">
    <p class="event-type-badge">Community Day prep</p>
    <div class="home-event-heading">${brief.formId ? spriteHtml(brief.formId, forms, brief.name, brief.primaryType) : ""}<h4 id="cd-brief-title">${escapeHtml(brief.name)}</h4></div>
    <p class="event-when">${escapeHtml(brief.when)}</p>
    ${brief.action ? `<p class="event-action">${escapeHtml(brief.action)}</p>` : ""}
    <p class="event-action">${escapeHtml(brief.exclusiveMoveNote)}</p>
    <p class="event-action">${escapeHtml(brief.evolveWindowNote)}</p>
    <ul class="cd-brief-checklist">${brief.checklist.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
  </section>`;
}

// Today's day-of row — same {id, title, detail, href} shape as today.js's
// other buildTodayItems entries, so today.js can splice this straight in.
// Only fires the actual calendar day the Community Day starts.
export function communityDayTodayItem(events, forms, now = new Date()) {
  const event = findFeaturedCommunityDay(events, now);
  if (!event) return null;
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.valueOf()) || !isSameDay(start, now)) return null;
  return {
    id: `cd-brief-${event.eventId}`,
    title: `Community Day: ${featuredName(event, forms)}`,
    detail: `${formatEventWhen(event.startsAt, event.endsAt, now)} — ${event.action ?? "Boosted spawns today."}`,
    href: event.formId ? `./?boss=${encodeURIComponent(event.formId)}#raids` : "./#today",
  };
}
