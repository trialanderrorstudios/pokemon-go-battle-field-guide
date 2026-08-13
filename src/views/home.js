import { ATTACK_TYPES, buildRaidPlan, effectiveness } from "../raid-target.js";
import { spriteHtml } from "../sprites.js";
import { intersectRosterChanges, releaseDiffDismissedKey } from "../release-diff.js";
import { renderCommunityDayBriefCard } from "../cd-brief.js";
import { raidPlanCardData } from "../share-card.js";
// A5: the field briefing + timeline superseded the old "Now and coming up"
// calendar (upcoming.js) as Home's one rendering of the events feed — see
// the deletion accounting note above renderFieldTimeline. Not imported here
// anymore; upcoming.js and its exports are otherwise untouched.
import { buildCoachSummary } from "../coach.js";
import { bestInstanceForForm } from "../instances.js";
import { showcaseEstimate } from "../showcase.js";
// Home absorbed Today and Weekly Coach. Both keep their own modules — this is
// a consolidation of routes and entrances, not of capability.
import { renderToday } from "./today.js";
import { renderCoachSections } from "./coach.js";


export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}


// The one renderer for "why this ranks here". Raids, gyms, PvP and the invest
// rows each used to style their own; the sentence that turns numbers into a
// decision should look the same wherever the app makes a recommendation.
export function whyLine(text, label = "") {
  if (!text) return "";
  const prefix = label ? `<strong>${escapeHtml(label)}</strong> ` : "";
  return `<p class="why-line">${prefix}${escapeHtml(text)}</p>`;
}


// Shiny odds. Every figure is a community estimate — Niantic publishes none, and
// no frozen source this app ingests carries one (see docs/shiny-odds-spike.md).
// So the band is always rendered WITH its provenance, never as a bare number:
// a "~1 in 50" sitting beside computed CP values would borrow credibility it has
// not earned, and unlike a wrong bit of prose a wrong rate here costs someone an
// afternoon of walking.
export function shinyOddsLine(band, { boosted = null } = {}) {
  if (!band) return "";
  if (band.confidence === "unknown") {
    return `<p class="shiny-odds"><strong>Shiny:</strong> possible — rate not known
      <span class="acq-flag">no data</span></p>`;
  }
  // A live boosted window is the one part of this that is real data: it comes
  // from the synced event calendar, not from an estimate.
  const live = boosted
    ? ` <span class="shiny-odds-live">${escapeHtml(boosted.name)} is running — better odds than usual</span>`
    : "";
  return `<p class="shiny-odds${band.boosted ? " is-boosted" : ""}">
    <strong>Shiny:</strong> ${escapeHtml(band.odds)} <span class="shiny-odds-label">${escapeHtml(band.label)}</span>
    <span class="acq-flag">community estimate</span>${live}</p>`;
}


// Where a recommendation comes from: what you actually catch, and what the climb
// costs. Every ranked list names the final evolution, which is the one form you
// cannot go out and find — and Candy is shared across the family, so the base
// form is the shopping-list entry. Shared by the raid, gym-attacker and defender
// lists, because the question does not change between them.
// Returns "" for a Pokemon that does not evolve; there is nothing to say.
export function originLine(origin, acquisition = null) {
  // Where it comes from when there is no chain to walk: a legendary is a raid, a
  // Mega is an energy grind. A Mega gets BOTH — the chain that produced the
  // Pokemon it Mega-evolves from, and the energy that does the Mega-evolving.
  const sourceLines = (acquisition ?? [])
    .map((note) => `<p class="origin-line"><strong>Source:</strong> ${escapeHtml(note)}</p>`)
    .join("");
  if (!origin?.base) return sourceLines;
  // "Catch" was wrong for a third of these: Happiny only comes out of an egg, and
  // the app syncs the egg pool, so the base form's real route is a lookup. The
  // hatch note is additive rather than exclusive — Gible hatches from 10 km AND
  // spawns wild, and this app has no wild-spawn data to rank the two.
  const base = origin.baseHatchesFrom
    ? `${origin.base} (${origin.baseHatchesFrom} eggs)`
    : origin.base;
  const chain = [base, ...(origin.steps ?? []).map((step) => step.to)];
  const parts = [chain.join(" → ")];
  if (origin.totalCandy) parts.push(`${origin.totalCandy} Candy total`);
  if (origin.items?.length) parts.push(`needs ${origin.items.join(" and ")}`);
  // A Lure is not spent from your bag — you have to be standing at an active one,
  // possibly someone else's — so it is worded as a place, not a purchase.
  if (origin.lures?.length) parts.push(`only at a ${origin.lures.join(" and ")}`);
  // "one step" rather than the whole climb: Machop → Machoke still costs 25 even
  // though the Machoke → Machamp half is free when it happens in a trade.
  if (origin.freeViaTrade) parts.push("one step free if traded");
  // Naming an item the reader may not have, without saying how to get one, is
  // half an instruction. Link the page that finishes it.
  const itemHelp = (origin.items?.length || origin.lures?.length)
    ? ` <a class="origin-item-help" href="./#basics/items" data-route="basics" data-view="items">how to get it</a>`
    : "";
  return `<p class="origin-line"><strong>Start from:</strong> ${escapeHtml(parts.join(" · "))}${itemHelp}</p>${sourceLines}`;
}


// The one content switcher. A segment is a link to #route/view, so the router
// owns history, scroll reset, the dex wipe and aria-current — the four steps
// the old hand-rolled button groups each re-implemented a different subset of.
// aria-current is stamped here as well as by markCurrent, because an in-view
// rerender (a filter chip, a checkbox) calls the renderer directly and never
// goes through router.render().
export function viewSegments(label, route, segments, current = "") {
  const links = segments.map(([view, text]) => {
    const active = view === current ? ' aria-current="page"' : "";
    return `<a href="./#${route}${view ? `/${view}` : ""}" data-route="${escapeHtml(route)}" data-view="${escapeHtml(view)}"${active}>${escapeHtml(text)}</a>`;
  }).join("");
  return `<div class="pvp-controls view-segments">
    <fieldset><legend>${escapeHtml(label)}</legend>${links}</fieldset>
  </div>`;
}


// Shared shiny/lucky badge markup for anything showing a roster instance
// or living-dex row (collection grid, instance sheet).
export function shinyLuckyBadges({ isShiny, isLucky } = {}) {
  return [
    isShiny ? '<span class="collection-badge collection-badge-shiny">Shiny</span>' : "",
    isLucky ? '<span class="collection-badge collection-badge-lucky">Lucky</span>' : "",
  ].filter(Boolean).join("");
}


export function ownedStarButton({ formId, name, owned, route = "raids" }) {
  return `<button type="button" class="owned-star${owned ? " is-owned" : ""}" data-owned-form-id="${escapeHtml(formId)}" data-owned-route="${escapeHtml(route)}" aria-pressed="${owned}" aria-label="I own ${escapeHtml(name)}"><span aria-hidden="true">${owned ? "★" : "☆"}</span></button>`;
}


function taskCard({ href, title, detail }) {
  return `<a class="fallback-section home-task-card" href="${href}">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(detail)}</p>
  </a>`;
}


const CONTINUE_ROUTES = new Set(["raids", "gyms", "pvp"]);


function topWeaknesses(bossTypes) {
  return ATTACK_TYPES
    .map((attackingType) => ({
      attackingType,
      effectiveness: effectiveness(attackingType, bossTypes[0], bossTypes[1]),
    }))
    .filter((row) => row.effectiveness > 1)
    .sort((left, right) => right.effectiveness - left.effectiveness
      || left.attackingType.localeCompare(right.attackingType))
    .slice(0, 4)
    .map((row) => row.attackingType);
}


// Cards here are whole-card <a> links (tapping anywhere opens the raid target),
// so this stays plain text tagged with the shared glossary term id rather than
// the interactive tap-to-reveal jargonTerm() control — nesting that control's
// checkbox/label inside an <a> would be invalid, dueling-tap-target markup.
function weatherChip(conditions) {
  if (!conditions?.length) return "";
  return `<p class="boss-weather-chip" data-jargon-term="weather-boost">Boosted in ${escapeHtml(conditions.join(", "))}: stronger boss, level-25 catch</p>`;
}


// No "worth your free daily pass" chip here. It was a second, independent
// implementation of that verdict (tier + investmentTier) that could disagree
// on screen with the checklist row above, which derives it from the raid
// band. One producer only: today.js's VERDICT_BY_BAND.
export function currentBossCard({ formId, tier, endsAt } = {}, {
  target, forms, now = new Date(),
} = {}) {
  const name = target?.boss ?? formId;
  const bossTypes = target?.bossTypes ?? [];
  const weaknesses = bossTypes.length ? topWeaknesses(bossTypes) : [];
  const stale = typeof endsAt === "string" && !Number.isNaN(Date.parse(endsAt)) && new Date(endsAt) < now;
  return `<a class="fallback-section home-boss-card" href="./?boss=${encodeURIComponent(formId)}#raids" data-form-id="${escapeHtml(formId)}">
    <div class="home-boss-heading">${spriteHtml(formId, forms, name, bossTypes[0])}<h3>${escapeHtml(name)}</h3></div>
    <p class="boss-tier">${escapeHtml(tier || "Raid boss")}</p>
    ${weaknesses.length ? `<p class="boss-weaknesses">Weak to ${weaknesses.map(escapeHtml).join(", ")}</p>` : ""}
    ${weatherChip(target?.weatherBoostConditions)}
    ${stale ? `<p class="boss-stale">May be outdated — check in-game.</p>` : ""}
  </a>`;
}


// Legendary (Tier 5) and Mega are the week's headliners — surfaced as their
// own labeled rows above everything else (Shadow, other tiers) so the
// biggest raids aren't buried in a flat grid.
function bossTierRow(label, bosses, cardFor) {
  if (!bosses.length) return "";
  return `<div class="home-boss-tier-row">
    <p class="status-kicker home-boss-tier-label">${escapeHtml(label)}</p>
    <div class="home-boss-grid">${bosses.map(cardFor).join("")}</div>
  </div>`;
}


// Fact-checked (2026-07): one free Raid Pass per day from a Gym's Photo Disc;
// a trainer can't hold more than one free pass until it's used. Verified
// against Niantic's Help Center ("I have an issue with a Raid Pass"),
// cross-checked with the Pokemon GO Hub and Fandom wiki "Raid Passes" pages.
export function renderCurrentBosses({
  currentBosses, raidTargetTool, forms, now = new Date(),
} = {}) {
  const bosses = currentBosses?.bosses ?? [];
  if (!bosses.length) return "";
  const targetsByFormId = new Map((raidTargetTool?.targets ?? []).map((target) => [target.bossFormId, target]));
  const cardFor = (boss) => currentBossCard(boss, { target: targetsByFormId.get(boss.formId), forms, now });
  const legendary = bosses.filter((boss) => boss.tier === "Tier 5");
  const mega = bosses.filter((boss) => boss.tier === "Mega");
  const minor = bosses.filter((boss) => boss.tier !== "Tier 5" && boss.tier !== "Mega");
  const headliners = legendary.length > 0 || mega.length > 0;
  return `<section class="home-boss-section" aria-labelledby="home-boss-title">
    <h3 id="home-boss-title">This week's raid bosses</h3>
    <p class="raid-pass-teach-note">You get one free Raid Pass a day from spinning a Gym's Photo Disc (you can hold at most one unused free pass at a time).</p>
    ${headliners
      ? `${bossTierRow("Legendary raids", legendary, cardFor)}${bossTierRow("Mega raids", mega, cardFor)}${bossTierRow("Other tiers", minor, cardFor)}`
      : `<div class="home-boss-grid">${bosses.map(cardFor).join("")}</div>`}
  </section>`;
}


export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Relative-first date label shared by every event/raid-hour render (Home's
// week strip, event cards, and the raid-hour banner/Coach/Today fold-ins that
// compose formatRaidHourWhen/formatEventWhen): TODAY and TOMORROW keep the
// closest days scannable at a glance; anything further out spells out
// weekday + month + day (plus year, only when it crosses a year boundary from
// `now`) so "Kyurem next Wednesday" always resolves to one unambiguous date
// instead of a bare weekday that could mean this week or next.
function relativeDayLabel(date, now) {
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "TOMORROW";
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const year = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : "";
  return `${weekday} ${month} ${date.getDate()}${year}`;
}

// "6-7 PM" / "11 PM-12 AM" — collapses a shared AM/PM, split on the shared
// helper so formatRaidHourWhen and formatEventWhen's same-day branch render
// identical clock text.
function timeRange(start, end) {
  // Split on any whitespace, not a literal space: ICU-72+ browser engines
  // (Chrome 110+, Safari 16.4+, Firefox 106+) emit U+202F (narrow no-break
  // space) between hour and AM/PM, which a plain " " split misses — Node's
  // ICU still uses a plain space, so the test suite can't catch that split.
  const [startNum, startPeriod] = start.toLocaleTimeString("en-US", { hour: "numeric" }).split(/\s/);
  if (Number.isNaN(end.valueOf())) return `${startNum} ${startPeriod}`;
  const [endNum, endPeriod] = end.toLocaleTimeString("en-US", { hour: "numeric" }).split(/\s/);
  return startPeriod === endPeriod
    ? `${startNum}-${endNum} ${endPeriod}`
    : `${startNum} ${startPeriod}-${endNum} ${endPeriod}`;
}

export function formatEventWhen(startsAt, endsAt, now = new Date()) {
  // typeof guard first: new Date(null) is the 1970 epoch (a valid date, not
  // NaN), so a missing startsAt would otherwise render "Dec 31"/"Jan 1" 1970
  // instead of the blank line the sort guard already tolerates elsewhere.
  if (typeof startsAt !== "string") return "";
  const start = new Date(startsAt);
  if (Number.isNaN(start.valueOf())) return "";
  const dayLabel = relativeDayLabel(start, now);
  const end = new Date(endsAt);
  if (Number.isNaN(end.valueOf())) return dayLabel;
  if (end.toDateString() === start.toDateString()) return `${dayLabel} · ${timeRange(start, end)}`;
  const options = { month: "short", day: "numeric" };
  return `${dayLabel} – ${end.toLocaleDateString("en-US", options)}`;
}


function spawnsChip(hasSpawns) {
  return hasSpawns ? `<p class="event-spawns-chip">Boosted wild spawns during this event.</p>` : "";
}


// Mirrors src/pogo_encyclopedia/public_safety.py _ALLOWED_EVENT_LINK, but
// full-match (^...$): that guard only strips the allowlisted shape out of
// scanned text, it never confirms a `link` field IS nothing but that shape.
// A feed-supplied javascript:/data: URI has no phone/email/path/origin-URL/tel
// pattern to trip, so it sails through the build-time scan untouched and
// would otherwise land verbatim in this href — validate here, the one place
// that turns feed data into a live link, so every caller is covered.
const ALLOWED_EVENT_LINK = /^https:\/\/leekduck\.com\/events\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/?$/i;

export function safeEventLink(link) {
  return typeof link === "string" && ALLOWED_EVENT_LINK.test(link) ? link : null;
}


// Rich cards (formId resolved) keep the beginner action line. Generic cards
// (feed doesn't carry a subject Pokemon for this type) show only what the
// feed itself provides, plus a link out — no scraping, no guessing.
export function eventCard({ eventId, name, formId, startsAt, endsAt, action, hasSpawns, link } = {}, { forms, now = new Date() } = {}) {
  const stale = typeof endsAt === "string" && !Number.isNaN(Date.parse(endsAt)) && new Date(endsAt) < now;
  const safeLink = safeEventLink(link);
  return `<div class="fallback-section home-event-card" data-event-id="${escapeHtml(eventId)}">
    <div class="home-event-heading">${formId ? spriteHtml(formId, forms, name, forms?.[formId]?.primary_type) : ""}<h4>${escapeHtml(name)}</h4></div>
    <p class="event-when">${escapeHtml(formatEventWhen(startsAt, endsAt, now))}</p>
    ${action ? `<p class="event-action">${escapeHtml(action)}</p>` : ""}
    ${!action && safeLink ? `<p class="event-action"><a class="event-external-link" href="${escapeHtml(safeLink)}" target="_blank" rel="noopener">Full details ↗ (leaves the app)</a></p>` : ""}
    ${spawnsChip(hasSpawns)}
    ${stale ? `<p class="boss-stale">May be outdated — check in-game.</p>` : ""}
  </div>`;
}


// "TODAY · 6-7 PM" / "WED JUL 29 · 6-7 PM" — shared by the Home Raid Hour
// banner and the checklist's fold-ins, so every surface reads the same clock
// the same way and dates a Raid Hour instead of leaving its weekday ambiguous
// between this week and next.
export function formatRaidHourWhen(startsAt, endsAt, now = new Date()) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.valueOf())) return "";
  const day = relativeDayLabel(start, now);
  const end = new Date(endsAt);
  return `${day} · ${timeRange(start, end)}`;
}


// Nearest Raid Hour: prefers one that hasn't ended yet; falls back to the
// earliest past one (stale-honest — flagged, not hidden) when every seeded
// Raid Hour has already lapsed.
export function nextRaidHour(events, now = new Date()) {
  const raidHours = (events ?? []).filter((event) => event.kind === "raid-hour");
  if (!raidHours.length) return null;
  const upcoming = raidHours.filter((event) => new Date(event.endsAt) >= now);
  const pool = upcoming.length ? upcoming : raidHours;
  return [...pool].sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))[0];
}


export function raidHourBanner({ currentEvents, forms, now = new Date() } = {}) {
  const event = nextRaidHour(currentEvents?.events, now);
  if (!event) return "";
  const bossName = forms?.[event.formId]?.name ?? event.name.replace(/ Raid Hour$/, "");
  const when = formatRaidHourWhen(event.startsAt, event.endsAt, now);
  const stale = new Date(event.endsAt) < now;
  return `<a class="fallback-section raid-hour-banner" href="./?boss=${encodeURIComponent(event.formId)}#raids" data-event-id="${escapeHtml(event.eventId)}">
    <p class="raid-hour-kicker">⏰ RAID HOUR${when ? ` · ${escapeHtml(when)}` : ""}</p>
    <p class="raid-hour-detail"><strong>${escapeHtml(bossName)}</strong> — ${escapeHtml(event.action)}</p>
    ${stale ? `<p class="boss-stale">May be outdated — check in-game.</p>` : ""}
  </a>`;
}


function whatsNewCard(whatsNew) {
  if (!whatsNew?.notes) return "";
  return `<div class="fallback-section whats-new-card" role="note">
    <p><strong>Updated ${escapeHtml(whatsNew.dataCutoff ?? "")} — what's new</strong></p>
    <p>${escapeHtml(whatsNew.notes)}</p>
    <button type="button" data-action="dismiss-whats-new" data-release-id="${escapeHtml(whatsNew.releaseId)}">Dismiss</button>
  </div>`;
}


const LEAGUE_LABELS = Object.freeze({ great: "Great", ultra: "Ultra", master: "Master" });

function describeRosterChange(entry) {
  const league = LEAGUE_LABELS[entry.league] ?? entry.league;
  const parts = [];
  if (entry.isNew) parts.push(`Your ${entry.pokemon} is a new ${league} League pick (rank #${entry.rank.current}).`);
  else if (entry.rank) parts.push(`Your ${entry.pokemon}'s ${league} League pick moved #${entry.rank.previous}→#${entry.rank.current}.`);
  if (entry.moveset) parts.push(`${entry.isNew || entry.rank ? "Its" : `Your ${entry.pokemon}'s`} optimal moveset changed.`);
  return parts.join(" ");
}

// "What changed" — same dismissible fallback-section + per-release-id
// dismissal pattern as whatsNewCard above, for the computed structural diff
// (release-diff.js) instead of the release's own release-notes prose.
function releaseDiffCard(diff, roster, storage) {
  if (!diff?.available) return "";
  const { bossRotation, newSpecies } = diff;
  const yours = intersectRosterChanges(diff, roster).slice(0, 3);
  const hasNews = yours.length || bossRotation.added.length || bossRotation.removed.length || newSpecies.length;
  if (!hasNews) return "";
  if (storage?.getItem?.(releaseDiffDismissedKey(diff.currentReleaseId)) === "1") return "";
  const headline = [];
  if (bossRotation.added.length) headline.push(`${bossRotation.added.length} raid boss${bossRotation.added.length === 1 ? "" : "es"} rotated in`);
  if (newSpecies.length) headline.push(`${newSpecies.length} new Pokémon added`);
  return `<div class="fallback-section release-diff-card" role="note">
    <p><strong>What changed since your last visit</strong></p>
    ${yours.length ? `<ul>${yours.map((entry) => `<li>${escapeHtml(describeRosterChange(entry))}</li>`).join("")}</ul>` : ""}
    ${headline.length ? `<p>${escapeHtml(headline.join(" · "))}</p>` : ""}
    <p><a href="./#more/delta" data-route="more" data-view="delta">See everything that changed →</a></p>
    <button type="button" data-action="dismiss-release-diff" data-release-id="${escapeHtml(diff.currentReleaseId)}">Dismiss</button>
  </div>`;
}


// ══════════════════════════════════════════════════════════════════════
// A5 — Field briefing + timeline (mockup: docs/mockups/delight-2026-08-11/
// A5-briefing-plus-timeline.html). The briefing is the timeline's NOW node;
// one rail runs through both, in one wrapping `.tl` list. Reimplemented
// against this app's real state/render model — the mockup's JS is reference
// behaviour only, not portable code.
//
// Data constraint: raids.json (the per-boss ranked-attacker rows, split into
// raids-regular.json/raids-shadow.json) is deliberately NOT eager on Home
// (ROUTE_CHUNKS.home / app.js) — it's the single biggest release file and it
// chain-loads after Home's other four chunks land. The featured boss below
// (pickFeaturedBoss/attackerRankRows) reads those ranked rows directly, so a
// boss is simply not resolvable as "featured" until that deferred chunk
// lands and Home re-renders (the existing onRouteVisit chaining home()
// already relies on) — UNLESS it's a Mega/Primal, in which case
// extras.json's megasPrimals (eager on Home) carries the same rows already
// and the featured card can resolve on the first paint. This is a fact about
// the BOSS (is it worth building?), never gated on the roster — buildRaidPlan()/
// beatability() is a separate, roster-dependent signal that only ever
// affects the "bring these" slot inside the card and the skip log below it.
//
// Deletion accounting (spec §3 point 5 — the briefing supersedes, it does
// not stack):
//   - renderCurrentBosses() ("This week's raid bosses" grid) is no longer
//     called from renderHome. Every current-rotation boss it listed is now
//     covered by the briefing's featured boss + skip log (worked from the
//     same currentBosses feed). The function stays exported — other
//     surfaces/tests may still reference it — Home just stops calling it.
//   - renderUpcomingSection() ("Now and coming up (next 14 days)", from
//     upcoming.js) is no longer called from renderHome. Its two halves
//     (happening-now backdrops, day-grouped future events) are re-rendered
//     directly here as the timeline's active-now/starting-tonight/this-week
//     buckets, in the shared rail markup, instead of a second unrelated
//     calendar widget underneath.
//   Not touched (out of this lane's files, cross-lane follow-up only):
//   today.js's "Worth your free daily pass?" row and views/coach.js's
//   "This week's raids (N more)" <details> both read the exact same
//   worthRaiding list this briefing does and now say the same thing twice
//   on the page. De-duplicating those needs edits inside today.js/
//   views/coach.js, which are outside the home lane's file allowlist.

const BRIEFING_BAND_STAMP = Object.freeze({
  "solo-able": "Solo-able",
  duoable: "Ready",
  "bring-3-4": "Bring friends",
  "full-lobby": "Full lobby",
  "not-enough-data": "Skip for now",
});

// Bounded display counts — the rotation and the events feed are both
// unbounded in principle, and the mockup's own "+9 more" footnote pattern
// is the honest way to keep the DOM budget flat instead of one row per item.
const SKIP_ROW_DISPLAY_LIMIT = 5;
const BRING_CARD_LIMIT = 4;
const THIS_WEEK_HORIZON_DAYS = 7;
const THIS_WEEK_DISPLAY_LIMIT = 6;
const ACTIVE_NOW_DISPLAY_LIMIT = 3;
const STARTING_TONIGHT_DISPLAY_LIMIT = 3;
const ENDING_TODAY_DISPLAY_LIMIT = 3;

// Collapse persistence is keyed on the rotation's own content, not the date —
// a stable, sorted join of today's boss formIds. Doesn't need to be a real
// hash: it only has to change when the set of bosses changes and stay put
// otherwise, and a canonical joined string already does that in one line.
export function rotationFingerprint(currentBosses) {
  return (currentBosses?.bosses ?? [])
    .map((boss) => boss.formId)
    .filter(Boolean)
    .sort()
    .join(",");
}

export function briefingCollapsedKey(fingerprint) {
  return `pogo-briefing-collapsed:${fingerprint}`;
}

// Per-lane-card collapse (operator ask 2026-08-12: the Shadow and Tier 5
// cards collapse on their own, not riding the Mega's card or the whole
// briefing). Raw key is "<fingerprint>::<formId>" so a dismissed card stays
// dismissed for this rotation only — a new rotation re-opens everything,
// same contract as the briefing-level key above.
export function briefingCardCollapsedKey(raw) {
  return `pogo-briefing-card-collapsed:${raw}`;
}

function bossTierKey(tier) {
  const key = String(tier ?? "").toLowerCase().replace(/\s+/g, "");
  return key || "standard";
}

// Real CP when the trainer has logged a detailed roster instance for this
// counter; "Owned" (never a guessed CP) when they've only starred the
// species. The type-edge line is always real: it's the same effectiveness
// multiplier buildRaidPlan already computed to rank this counter.
function briefingBringCard(counter, roster, forms) {
  const name = forms?.[counter.formId]?.name ?? counter.pokemon ?? counter.formId;
  const instance = bestInstanceForForm(roster?.instances, counter.formId);
  const cpLine = instance?.cp ? `CP ${instance.cp}` : "Owned";
  const multiplier = Number.isFinite(counter.effectiveness)
    ? `${Math.round(counter.effectiveness * 10) / 10}× ${counter.attackingType ?? ""}`.trim()
    : "";
  return `<div class="bring-card" role="listitem">
    ${spriteHtml(counter.formId, forms, name, forms?.[counter.formId]?.primary_type)}
    <span class="bring-card-name">${escapeHtml(name)}</span>
    <span class="bring-card-cp">${escapeHtml(cpLine)}</span>
    ${multiplier ? `<span class="bring-card-edge">${escapeHtml(multiplier)}</span>` : ""}
  </div>`;
}

// With no owned counters, every not-enough-data row shares the exact same
// headline (raid-target.js's beatability() has nothing roster-dependent to
// say) — repetitive across N rows. This adds the one thing that IS boss-
// specific and needs no roster at all: the boss's own tier and its real
// type-chart weaknesses (topWeaknesses, same helper the degraded "bring
// these" card above already uses for the identical rosterless case).
function rosterlessSkipHint(row, forms, tierByFormId) {
  const form = forms?.[row.formId];
  const bossTypes = [form?.primary_type, form?.secondary_type].filter(Boolean);
  const weak = bossTypes.length ? topWeaknesses(bossTypes).slice(0, 3) : [];
  const tier = tierByFormId?.get(row.formId);
  if (!weak.length) return tier ?? "";
  return `${tier ? `${tier} · ` : ""}bring ${weak.join("/")}`;
}

// One line per rest-of-rotation boss — never a fabricated tier, always the
// same real beatability() headline Today/Coach already show for it.
function skipRow(row, forms, tierByFormId) {
  const hint = row.band === "not-enough-data" ? rosterlessSkipHint(row, forms, tierByFormId) : "";
  return `<li class="skip-row">
    ${spriteHtml(row.formId, forms, row.name, forms?.[row.formId]?.primary_type)}
    <span class="skip-stamp${row.band === "not-enough-data" ? " is-low" : ""}">${escapeHtml(BRIEFING_BAND_STAMP[row.band] ?? "Check")}</span>
    <span class="skip-row-text">
      <p class="skip-row-title">${escapeHtml(row.name)}</p>
      <p class="skip-row-why">${escapeHtml(row.headline)}${hint ? ` · ${escapeHtml(hint)}` : ""}</p>
    </span>
  </li>`;
}

function briefingSkipSection(restRows, forms, bosses) {
  if (!restRows.length) return "";
  const tierByFormId = new Map((bosses ?? []).map((boss) => [boss.formId, boss.tier]));
  const shown = restRows.slice(0, SKIP_ROW_DISPLAY_LIMIT);
  const overflow = restRows.length - shown.length;
  return `<div class="briefing-skip">
    <p class="briefing-skip-title">Filed as skip — rest of the rotation, one line each</p>
    <ul class="skip-list">${shown.map((row) => skipRow(row, forms, tierByFormId)).join("")}</ul>
    ${overflow > 0 ? `<p class="briefing-footer">+${overflow} more in today's rotation, none ranked better than “${escapeHtml(BRIEFING_BAND_STAMP[shown[shown.length - 1].band] ?? "skip")}.”</p>` : ""}
  </div>`;
}

const INVEST_TIER_ORDER = Object.freeze({
  "S+": 0, S: 1, A: 2, B: 3, C: 4,
});

// Every ranked-attacker row for this boss's own formId, across attacking
// types — deduped by attackingType (raids.regular/shadow and extras.json's
// megasPrimals can carry the same row twice once both have landed; dedupe
// keeps whichever copy claims the better rank), sorted best-first. This is
// the boss's OWN verdict as something to build ("is this worth my time") —
// a different question from beatability()'s roster-dependent "can my team
// beat it in a raid".
function attackerRowsFor(formId, rows) {
  const byType = new Map();
  for (const row of rows) {
    if (row.formId !== formId) continue;
    const existing = byType.get(row.attackingType);
    if (!existing || row.rank < existing.rank) byType.set(row.attackingType, row);
  }
  return [...byType.values()].sort((left, right) => left.rank - right.rank);
}

// raids.regular/raids.shadow (raids-regular.json/raids-shadow.json) are the
// deliberately-deferred chunk — see the file-top note; empty until that
// second fetch lands and Home re-renders. extras.json's megasPrimals is
// eager on Home, so a Mega headliner's real verdict can resolve on the
// FIRST paint even before raids.json arrives.
function attackerRankRows(data) {
  const raids = data?.raids ?? {};
  return [...(raids.regular ?? []), ...(raids.shadow ?? []), ...(data?.megasPrimals ?? [])];
}

// The featured boss: the one rotation boss with the best real ranked-attacker
// verdict (lowest investment tier, then rank). A boss with no ranked row at
// all (most Tier 5 legendaries, most wild-caught Shadow raids) never gets a
// featured slot — honest skip-log material instead, never a fabricated tier.
// Operator ask (2026-08-12): the Mega, the main Tier 5 legendary, and the
// Shadow raid target each get their own briefing card — not one winner and a
// skip log. Within a lane: the ranked-verdict comparator first; with no
// ranked boss in the lane, prefer a dated rotation window (the curated/hotfix
// current boss) over the undated evergreen pool, then feed order.
// ponytail: prefix regexes cover ScrapedDuck's tier vocabulary today
// ("Mega", "Tier 5", "Shadow"); a new tier spelling means a new lane entry.
const BRIEFING_LANES = Object.freeze([
  ["mega", (tier) => /^mega/i.test(tier)],
  ["legendary", (tier) => /^tier 5/i.test(tier)],
  ["shadow", (tier) => /^shadow/i.test(tier)],
]);

function pickLaneBosses(bosses, rankedRows) {
  const picks = [];
  for (const [lane, matches] of BRIEFING_LANES) {
    const laneBosses = bosses.filter((boss) => typeof boss.tier === "string" && matches(boss.tier));
    if (!laneBosses.length) continue;
    const ranked = pickFeaturedBoss(laneBosses, rankedRows);
    if (ranked) { picks.push({ lane, ...ranked }); continue; }
    const boss = laneBosses.find((row) => typeof row.endsAt === "string") ?? laneBosses[0];
    picks.push({ lane, boss, rows: [], topRow: null });
  }
  return picks;
}

function pickFeaturedBoss(bosses, rankedRows) {
  let best = null;
  for (const boss of bosses) {
    const rows = attackerRowsFor(boss.formId, rankedRows);
    if (!rows.length) continue;
    const topRow = rows[0];
    const better = !best
      || (INVEST_TIER_ORDER[topRow.investmentTier] ?? 9) < (INVEST_TIER_ORDER[best.topRow.investmentTier] ?? 9)
      || ((INVEST_TIER_ORDER[topRow.investmentTier] ?? 9) === (INVEST_TIER_ORDER[best.topRow.investmentTier] ?? 9)
        && topRow.rank < best.topRow.rank);
    if (better) best = { boss, rows, topRow };
  }
  return best;
}

// ── Max lane card (operator ask 2026-08-13) — a fourth briefing lane card,
// after Shadow. Sourced from currentEvents (kind "max-mondays"/"max-battles"),
// not currentBosses — there is no Max boss ROTATION in any feed this app
// ingests, only scheduled Max Monday/Max Battle Day windows, so this card
// never claims to know which boss is up next after the one the feed names.
const MAX_EVENT_KINDS = new Set(["max-mondays", "max-battles"]);
const MAX_LANE_LABEL = Object.freeze({
  "max-mondays": "Max Monday",
  "max-battles": "Max Battle Day",
});
// ScrapedDuck bakes the subject into the event name itself (same gap as
// raid-hour) — "Dynamax <species> during Max Monday" / "Gigantamax <species>
// Max Battle Day". scripts/sync-rotation.mjs's maxBattleSubject does the same
// extraction build-side (to resolve formId); this is the client-side mirror
// for display — today.js already established the modifier word must survive,
// since the dex has no separate Gmax form and a plain resolved species name
// alone would drop the only word that says which fight this is.
const MAX_SUBJECT_PATTERN = /^(Dynamax|Gigantamax)\s+(.+?)\s+(?:during Max Monday|Max Battle Day)$/i;

export function maxEventSubject(name) {
  const match = String(name ?? "").match(MAX_SUBJECT_PATTERN);
  return match ? { modifier: match[1], species: match[2] } : null;
}

// Live-first, else nearest upcoming — same "what do I do right now, else
// what's next" contract as nextRaidHour above.
export function pickMaxEvent(events, now = new Date()) {
  const candidates = (events ?? [])
    .filter((event) => MAX_EVENT_KINDS.has(event.kind))
    .map((event) => ({ ...event, start: new Date(event.startsAt), end: new Date(event.endsAt) }))
    .filter((event) => !Number.isNaN(event.start.valueOf()));
  if (!candidates.length) return null;
  const live = candidates.filter((event) => event.start <= now
    && (Number.isNaN(event.end.valueOf()) || event.end > now));
  if (live.length) return [...live].sort((left, right) => left.start - right.start)[0];
  const upcoming = candidates.filter((event) => event.start > now)
    .sort((left, right) => left.start - right.start);
  return upcoming[0] ?? null;
}

// canDynamax/canGigantamax (instances.js's I2 quick-add fields) are only ever
// present when true (omit-when-false convention) — count either flag, this
// isn't scoped to the featured event's own modifier, just "how many of my
// Pokemon are Max-ready at all".
function maxReadyLine(instances) {
  const count = (instances ?? []).filter((instance) => instance.canDynamax || instance.canGigantamax).length;
  return count > 0 ? `You have ${count} Max-ready Pokémon` : "None flagged yet — mark them in quick-add";
}

function maxLaneCardHtml({
  event, forms, roster, storage, now,
}) {
  const subject = maxEventSubject(event.name);
  const displayName = subject ? `${subject.modifier} ${subject.species}` : event.name;
  const formId = event.formId ?? null;
  const sprite = formId
    ? spriteHtml(formId, forms, displayName, forms?.[formId]?.primary_type)
    : `<span class="tl-glyph" aria-hidden="true">&#9670;</span>`;
  const linkedName = formId
    ? `<a href="./?boss=${encodeURIComponent(formId)}#raids">${escapeHtml(displayName)}</a>`
    : escapeHtml(displayName);
  const laneLabel = MAX_LANE_LABEL[event.kind] ?? "Max event";
  const key = "max-lane";
  const collapsed = storage?.getItem?.(briefingCardCollapsedKey(key)) === "1";
  const inner = `<div class="briefing-section">
    <div class="briefing-boss-head">
      ${sprite}
      <div class="briefing-boss-heading">
        <p class="briefing-eyebrow-row"><span class="tier-pill" data-tier="max">${escapeHtml(laneLabel)}</span></p>
        <h3>${linkedName}</h3>
      </div>
    </div>
    <p class="briefing-note">${escapeHtml(formatEventWhen(event.startsAt, event.endsAt, now))}</p>
    <p class="briefing-note">${escapeHtml(maxReadyLine(roster?.instances))}</p>
    <p class="briefing-note">Boss rotation isn't in the data feed — this card tracks scheduled Max events.</p>
  </div>`;
  return `<div class="briefing-lane-card${collapsed ? " is-collapsed" : ""}">
    <button type="button" class="briefing-collapsed-line" data-action="toggle-briefing-card" data-briefing-card-key="${escapeHtml(key)}" aria-label="Reopen the Max card">
      ${sprite}
      <span class="briefing-collapsed-text"><strong>${escapeHtml(displayName)}</strong><span>${escapeHtml(laneLabel)} · dismissed</span></span>
      <span class="briefing-reopen">Reopen ⌃</span>
    </button>
    <button type="button" class="briefing-dismiss briefing-lane-dismiss" data-action="toggle-briefing-card" data-briefing-card-key="${escapeHtml(key)}" aria-expanded="${!collapsed}">Dismiss ⌄</button>
    <div class="briefing-lane-body">${inner}</div>
  </div>`;
}

// ── Showcase advisor (item 7) — PokeStop Showcases carry no ScrapedDuck
// event kind of their own (unlike Max/Community Day/Spotlight above), so the
// feed never resolves a formId for one; the only signal is the event's own
// name. Exact, case-insensitive match against a form's display name only —
// no fuzzy matching, so an unparseable name degrades to the honest generic
// line below instead of guessing a species.
// Plain includes(), not a regex literal — the public-safety scanner reads
// /showcase/ as an absolute path (the 2026-08-11 slash-comment class).
const isShowcaseName = (name) => String(name ?? "").toLowerCase().includes("showcase");

function pickShowcaseEvent(events, now = new Date()) {
  const candidates = (events ?? [])
    .filter((event) => isShowcaseName(event?.name))
    .map((event) => ({ ...event, end: new Date(event.endsAt) }))
    .filter((event) => Number.isNaN(event.end.valueOf()) || event.end >= now);
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))[0];
}

function showcaseSpeciesFormId(eventName, forms) {
  const stripped = String(eventName ?? "").replace(/\s*showcase.*$/i, "").trim();
  if (!stripped) return null;
  const lowered = stripped.toLowerCase();
  const match = Object.values(forms ?? {}).find((form) => form?.name?.toLowerCase() === lowered);
  return match?.form_id ?? null;
}

function hasRecordedSize(instance) {
  return Number.isFinite(instance?.heightM) && instance.heightM > 0
    && Number.isFinite(instance?.weightKg) && instance.weightKg > 0;
}

// A single line, not a card — spliced into the timeline rail. "" when there's
// no showcase running/upcoming, or the roster has no sized instances at all.
export function showcaseAdvisorLine({
  currentEvents, forms, roster, now = new Date(),
} = {}) {
  const event = pickShowcaseEvent(currentEvents?.events, now);
  if (!event) return "";
  const sized = (roster?.instances ?? []).filter(hasRecordedSize);
  if (!sized.length) return "";
  const formId = showcaseSpeciesFormId(event.name, forms);
  if (formId) {
    const form = forms?.[formId];
    const best = sized
      .filter((instance) => instance.formId === formId)
      .map((instance) => ({ instance, estimate: showcaseEstimate(form, instance) }))
      .filter((row) => row.estimate)
      .sort((left, right) => right.estimate.score - left.estimate.score)[0];
    if (best) {
      return `<p class="briefing-note showcase-advisor-line">Your ${escapeHtml(String(best.instance.heightM))}m ${escapeHtml(form?.name ?? event.name)} scores ${escapeHtml(best.estimate.label)}</p>`;
    }
  }
  const live = typeof event.startsAt === "string" && new Date(event.startsAt) <= now;
  return `<p class="briefing-note showcase-advisor-line">Showcase ${live ? "running" : "upcoming"} — you have ${sized.length} Pokémon with recorded sizes.</p>`;
}

// "Bring these": a fact about the ROSTER, not the boss — owned counters when
// the roster has them, else the honest type-chart-plus-intake-pointer
// degrade (spec §3 point 4), scoped to just this slot inside the featured
// card rather than replacing the whole verdict.
function bringSection({
  featured, plan, forms, roster, ownedCount,
}) {
  if (ownedCount > 0) {
    const bringCounters = (plan?.ownedCounters ?? []).slice(0, BRING_CARD_LIMIT);
    if (!bringCounters.length) return "";
    return `<p class="briefing-bring-label">Bring these — your owned counters</p>
    <div class="bring-row" role="list" aria-label="Your owned counters for ${escapeHtml(featured.name)}">
      ${bringCounters.map((counter) => briefingBringCard(counter, roster, forms)).join("")}
    </div>`;
  }
  const bossTypes = plan?.target?.bossTypes
    ?? [forms?.[featured.formId]?.primary_type, forms?.[featured.formId]?.secondary_type].filter(Boolean);
  const weaknesses = bossTypes.length ? topWeaknesses(bossTypes) : [];
  const intakeLink = `<p><a class="safe-escape" href="./#more/roster" data-route="more" data-view="roster">Add the Pokémon you own →</a></p>`;
  return `<p class="briefing-bring-label">Bring these</p>
    <p class="briefing-note">${weaknesses.length
    ? `No roster yet — type chart says bring <strong>${weaknesses.map(escapeHtml).join(", ")}</strong>-type attackers.`
    : "No roster yet."}</p>
    ${intakeLink}`;
}


// The catch-screen numbers, on the card you read while walking to the raid
// (operator ask, 2026-08-12): hundo and floor CP for both encounter bands,
// straight from the same raid-target data the hundo checker uses — including
// the per-band IV floor (6/6/6 for Shadow raids). raid-targets.json is eager
// on Home, so this renders on first paint; a boss without a target row (or a
// plan that failed to build) renders nothing rather than a guess.
function briefingCatchLine(plan) {
  const normal = plan?.target?.normal;
  if (!normal?.hundoCP) return "";
  const boosted = plan?.target?.weatherBoosted;
  const floor = Number.isFinite(normal.minimumIV) ? normal.minimumIV : 10;
  return `<p class="briefing-catch">Catch: hundo <strong>${escapeHtml(normal.hundoCP)}</strong>` +
    `${boosted?.hundoCP ? ` (${escapeHtml(boosted.hundoCP)} weather-boosted)` : ""}` +
    ` · floor ${escapeHtml(`${floor}/${floor}/${floor}`)}: ${escapeHtml(normal.minimumRaidIVCP)}</p>`;
}

function featuredBossCard({
  featured, plan, currentBosses, forms, roster, ownedCount, now, shareMessage = "", showShare = true,
}) {
  const boss = (currentBosses?.bosses ?? []).find((row) => row.formId === featured.formId);
  // The share handler (share-raid-plan-card) recomputes the single overall
  // pick via currentRaidPlanCardData, so only the card matching that pick may
  // render the button — a button on a lane card would share a different boss.
  const shareCard = showShare && featured.topRow ? raidPlanCardData(featured, plan, boss, roster, forms) : null;
  const bossTypes = plan?.target?.bossTypes
    ?? [forms?.[featured.formId]?.primary_type, forms?.[featured.formId]?.secondary_type].filter(Boolean);
  const endsToday = typeof boss?.endsAt === "string" && !Number.isNaN(Date.parse(boss.endsAt))
    && new Date(boss.endsAt).toDateString() === now.toDateString();
  // A lane card without a ranked-attacker verdict (most Tier 5 legendaries,
  // wild-caught Shadow raids) still earns its briefing slot — catch numbers
  // and counters are boss facts — but never a fabricated tier/rank.
  const top = featured.topRow;
  const rankLine = top ? featured.rows.map((row) => `Rank #${row.rank} ${row.attackingType}`).join(", ") : "";
  const detail = top && Number.isFinite(top.matchups)
    ? ` ${top.matchups} winning ${top.attackingType} matchups.${top.resourceBurden ? ` Build cost: ${top.resourceBurden}.` : ""}`
    : "";
  return `<div class="briefing-section">
    <div class="briefing-boss-head">
      ${spriteHtml(featured.formId, forms, featured.name, bossTypes[0])}
      <div class="briefing-boss-heading">
        <p class="briefing-eyebrow-row">
          ${boss?.tier ? `<span class="tier-pill" data-tier="${escapeHtml(bossTierKey(boss.tier))}">${escapeHtml(boss.tier)}</span>` : ""}
          ${endsToday ? `<span class="ends-today">Ends today</span>` : ""}
        </p>
        <h3>${escapeHtml(featured.name)}</h3>
        ${bossTypes.length ? `<p class="briefing-eyebrow-row briefing-boss-types">${bossTypes.map((type) => `<span class="type-chip" data-type="${escapeHtml(type)}">${escapeHtml(type)}</span>`).join("")}</p>` : ""}
      </div>
    </div>
    ${top ? `<p class="briefing-eyebrow-row">
      <span class="invest-pill">${escapeHtml(top.investmentTier)} · ${escapeHtml(top.recommendation)}</span>
      <span class="acq-flag">ranked attacker</span>
    </p>
    <p class="briefing-note">${escapeHtml(rankLine)} attacker.${escapeHtml(detail)}</p>` : `<p class="briefing-note">Not a ranked attacker in this release — catch it for the dex, don't build it.</p>`}
    ${briefingCatchLine(plan)}
    ${bringSection({
    featured, plan, forms, roster, ownedCount,
  })}
    ${shareCard ? `<button type="button" class="briefing-share-card" data-action="share-raid-plan-card">Share tonight's plan</button>` : ""}
    ${shareMessage ? `<p class="briefing-share-status" role="status">${escapeHtml(shareMessage)}</p>` : ""}
  </div>`;
}

function briefingVerdictLine(featured, fallbackHeadline) {
  if (featured) {
    const top = featured.topRow;
    return `One raid worth your time today: <strong>${escapeHtml(featured.name)}</strong> — ${escapeHtml(top.investmentTier)} · ${escapeHtml(top.recommendation)} (rank #${escapeHtml(top.rank)} ${escapeHtml(top.attackingType)})`;
  }
  return escapeHtml(fallbackHeadline ?? "Nothing rises above “not enough data” yet in today’s rotation — add owned counters to get a real verdict.");
}

// The field briefing card itself — date-stamped header, one-line verdict,
// featured boss (only a boss with a real ranked-attacker verdict — see
// pickFeaturedBoss above), "bring these" from the roster (or the honest
// type-chart degrade), stamped skip log, collapsible to one filed line.
// Exported standalone (not just via renderFieldTimeline) so it's directly
// unit-testable against fixture rotation data.
// endsAt in the rotation feed is a bare date — the boss runs THROUGH that
// day (Blaziken "2026-08-11" ended 22:00 local on the 11th). Comparing the
// bare date against `now` would expire a boss at midnight at the START of its
// last day, so expiry is end-of-day.
function endOfDay(dateString) {
  const parsed = new Date(dateString);
  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

// The same featured/plan/boss triple featuredBossCard derives its share card
// from, recomputed standalone so app.js's share-card click handler (which
// doesn't have renderFieldBriefing's locals in scope) can reuse the exact
// same pick without re-deriving pickFeaturedBoss/buildRaidPlan itself. Null
// when there's no rotation, no featured boss, or the guard rejects the data
// (see raidPlanCardData) — same "no data, no button" contract as every other
// card type.
export function currentRaidPlanCardData({
  currentBosses, forms, roster, data, trainerLevel, now = new Date(),
} = {}) {
  const bosses = (currentBosses?.bosses ?? []).filter((boss) => !(typeof boss.endsAt === "string"
    && !Number.isNaN(Date.parse(boss.endsAt))
    && endOfDay(boss.endsAt) < now));
  const pick = pickFeaturedBoss(bosses, attackerRankRows(data));
  if (!pick) return null;
  const featured = {
    formId: pick.boss.formId,
    name: forms?.[pick.boss.formId]?.name ?? pick.boss.formId,
    rows: pick.rows,
    topRow: pick.topRow,
  };
  let plan = null;
  try {
    plan = buildRaidPlan({
      targetFormId: featured.formId, ownedFormIds: roster?.ownedFormIds, roster, trainerLevel,
    }, data);
  } catch {
    plan = null; // not in this release's raid target tool — nothing to detail
  }
  const boss = bosses.find((row) => row.formId === featured.formId);
  return raidPlanCardData(featured, plan, boss, roster, forms);
}

export function renderFieldBriefing({
  currentBosses, currentEvents, raidTargetTool, forms, roster, data, storage, trainerLevel, now = new Date(), shareMessage = "",
} = {}) {
  const allBosses = currentBosses?.bosses ?? [];
  // A boss whose endsAt has passed is not in "today's rotation", full stop —
  // it must never be featured or filed as a live option. The rotation feed
  // lags the game (2026-08-12: Mega Blaziken, ended the 11th, was still the
  // featured verdict while Groudon ran in-game), and the client cannot know
  // what replaced an expired boss — but it always knows the date. Expired
  // rows drop here, and when any dropped, the header carries an honest
  // rotation-refresh note instead of implying now-ness the data cannot back.
  const bosses = allBosses.filter((boss) => !(typeof boss.endsAt === "string"
    && !Number.isNaN(Date.parse(boss.endsAt))
    && endOfDay(boss.endsAt) < now));
  const expiredCount = allBosses.length - bosses.length;
  if (!bosses.length) return "";
  const fingerprint = rotationFingerprint(currentBosses);
  const collapsed = storage?.getItem?.(briefingCollapsedKey(fingerprint)) === "1";
  const ownedCount = roster?.ownedFormIds?.length ?? 0;

  // "Is this boss worth my time" is a fact about the BOSS: its own shipped
  // ranked-attacker verdict, picked below — never gated on the roster
  // existing, and never a fabricated tier for a boss with no ranked row.
  const pick = pickFeaturedBoss(bosses, attackerRankRows(data));
  const featured = pick ? {
    formId: pick.boss.formId,
    name: forms?.[pick.boss.formId]?.name ?? pick.boss.formId,
    rows: pick.rows,
    topRow: pick.topRow,
  } : null;

  // The roster's own beatability() list — "what do I bring" — is a
  // different, roster-dependent question. It still powers the skip log's
  // per-boss one-liners (unaffected by the change above) and, only as a
  // fallback, the verdict line when nothing in the rotation has a real
  // built verdict yet.
  // Not gated on ownedCount: buildCoachSummary handles an empty roster and
  // returns honest per-boss "not enough data" headlines — the gate was a
  // leftover of the r99 all-or-nothing verdict path, and it left the skip log
  // EMPTY for exactly the users the header promised "N bosses in today's
  // rotation" to (operator-visible on fresh installs, 2026-08-12).
  const summary = buildCoachSummary({
    data, roster: roster ?? { ownedFormIds: [], ownedFormCounts: {} }, now, trainerLevel,
  });
  // The summary reads data.currentBosses internally and so bypasses the
  // expiry filter above — restRows must re-apply it, or the expired boss
  // re-enters through the skip log (my own regression test caught this).
  const liveIds = new Set(bosses.map((boss) => boss.formId));
  const liveRows = (summary?.worthRaiding ?? []).filter((row) => liveIds.has(row.formId));
  const bestRow = liveRows[0] ?? null;

  // One card per lane (Mega / Tier 5 legendary / Shadow), operator ask
  // 2026-08-12. The overall featured pick keeps the verdict line, collapsed
  // name, and share button; if it somehow falls outside every lane (e.g. a
  // ranked Tier 3), it gets its own card ahead of the lanes.
  const lanePicks = pickLaneBosses(bosses, attackerRankRows(data));
  const laneCards = lanePicks.map((pick) => ({
    lane: pick.lane,
    featured: {
      formId: pick.boss.formId,
      name: forms?.[pick.boss.formId]?.name ?? pick.boss.formId,
      rows: pick.rows,
      topRow: pick.topRow,
    },
  }));
  if (featured && !laneCards.some((card) => card.featured.formId === featured.formId)) {
    laneCards.unshift({ lane: "featured", featured });
  }
  const cardFormIds = new Set(laneCards.map((card) => card.featured.formId));
  const restRows = liveRows.filter((row) => !cardFormIds.has(row.formId));

  const planFor = (formId) => {
    try {
      return buildRaidPlan({
        targetFormId: formId, ownedFormIds: roster?.ownedFormIds, roster, trainerLevel,
      }, data);
    } catch {
      return null; // not in this release's raid target tool — nothing to detail
    }
  };
  const plan = featured ? planFor(featured.formId) : null;

  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const bossCountLabel = `${bosses.length} boss${bosses.length === 1 ? "" : "es"} in today's rotation`
    + (expiredCount ? ` · ${expiredCount} ended — rotation data awaiting refresh` : "");
  const cardsHtml = laneCards.map((card) => {
    const cardKey = `${fingerprint}::${card.featured.formId}`;
    const cardCollapsed = storage?.getItem?.(briefingCardCollapsedKey(cardKey)) === "1";
    const boss = bosses.find((row) => row.formId === card.featured.formId);
    const inner = featuredBossCard({
      featured: card.featured,
      plan: card.featured.formId === featured?.formId ? plan : planFor(card.featured.formId),
      currentBosses, forms, roster, ownedCount, now,
      shareMessage: card.featured.formId === featured?.formId ? shareMessage : "",
      showShare: card.featured.formId === featured?.formId,
    });
    return `<div class="briefing-lane-card${cardCollapsed ? " is-collapsed" : ""}">
      <button type="button" class="briefing-collapsed-line" data-action="toggle-briefing-card" data-briefing-card-key="${escapeHtml(cardKey)}" aria-label="Reopen the ${escapeHtml(card.featured.name)} card">
        ${spriteHtml(card.featured.formId, forms, card.featured.name, forms?.[card.featured.formId]?.primary_type)}
        <span class="briefing-collapsed-text"><strong>${escapeHtml(card.featured.name)}</strong><span>${escapeHtml(boss?.tier ?? "")} · dismissed for this rotation</span></span>
        <span class="briefing-reopen">Reopen ⌃</span>
      </button>
      <button type="button" class="briefing-dismiss briefing-lane-dismiss" data-action="toggle-briefing-card" data-briefing-card-key="${escapeHtml(cardKey)}" aria-expanded="${!cardCollapsed}">Dismiss ⌄</button>
      <div class="briefing-lane-body">${inner}</div>
    </div>`;
  }).join("");
  // Max lane card (operator ask 2026-08-13) — after Shadow, sourced from
  // currentEvents rather than the boss rotation this whole function is
  // otherwise scoped to (see the block's own comment above). Still gated on
  // the same `!bosses.length` return above: a Max Monday with no other
  // rotation up doesn't get a briefing shell of its own today.
  const maxEvent = pickMaxEvent(currentEvents?.events, now);
  const maxCardHtml = maxEvent ? maxLaneCardHtml({
    event: maxEvent, forms, roster, storage, now,
  }) : "";
  const body = `${cardsHtml || maxCardHtml
    ? `${cardsHtml}${maxCardHtml}`
    : `<div class="briefing-section"><p class="briefing-note">${escapeHtml(bestRow?.headline ?? "Not enough data yet — star more Pokémon you own.")}</p></div>`}
    <hr class="briefing-divider">
    ${briefingSkipSection(restRows, forms, bosses)}`;

  const collapsedName = featured?.name ?? (ownedCount === 0 ? "No roster yet" : "Nothing worth a lobby today");
  return `<div class="field-briefing${collapsed ? " is-collapsed" : ""}" id="fieldBriefing">
    <button type="button" class="briefing-collapsed-line" data-action="toggle-field-briefing" data-briefing-key="${escapeHtml(fingerprint)}" aria-label="Reopen today's field briefing">
      ${featured ? spriteHtml(featured.formId, forms, featured.name, plan?.target?.bossTypes?.[0]) : ""}
      <span class="briefing-collapsed-text"><strong>Briefing: ${escapeHtml(collapsedName)}.</strong><span>${escapeHtml(dateLabel)} · filed for this rotation</span></span>
      <span class="briefing-reopen">Reopen ⌃</span>
    </button>
    <div class="briefing-head">
      <div class="briefing-head-text">
        <p class="briefing-kicker">Field briefing</p>
        <p class="briefing-date">${escapeHtml(dateLabel)}</p>
        <p class="briefing-docid">${escapeHtml(bossCountLabel)}</p>
      </div>
      <button type="button" class="briefing-dismiss" data-action="toggle-field-briefing" data-briefing-key="${escapeHtml(fingerprint)}" aria-expanded="${!collapsed}" aria-controls="fieldBriefing">Dismiss ⌄</button>
    </div>
    <div class="briefing-body">
      <div class="briefing-verdict">
        <p class="briefing-verdict-eyebrow">The verdict</p>
        <p class="briefing-verdict-line">${briefingVerdictLine(featured, bestRow?.headline)}</p>
      </div>
      <hr class="briefing-divider">
      ${body}
    </div>
  </div>`;
}

// ── Timeline: everything the briefing above doesn't answer — sourced
// entirely from current-events data (never raids.json). raid-battles is
// excluded throughout: that's the weekly boss-rotation signal the briefing
// above already files, and re-listing it here would double-pin it.
export function buildTimelineBuckets(events, now = new Date()) {
  const list = (events ?? [])
    .filter((event) => event.kind !== "raid-battles")
    .map((event) => ({ ...event, start: new Date(event.startsAt), end: new Date(event.endsAt) }))
    .filter((event) => !Number.isNaN(event.start.valueOf()));

  const horizonEnd = new Date(now.getTime() + (THIS_WEEK_HORIZON_DAYS * 86400000));
  const endingToday = [];
  const startingTonight = [];
  const activeNow = [];
  const thisWeek = [];

  for (const event of list) {
    const hasEnd = !Number.isNaN(event.end.valueOf());
    const running = event.start <= now && (!hasEnd || event.end > now);
    if (running) {
      if (hasEnd && event.end.toDateString() === now.toDateString()) endingToday.push(event);
      else activeNow.push(event);
    } else if (event.start > now) {
      if (event.start.toDateString() === now.toDateString()) startingTonight.push(event);
      else if (event.start <= horizonEnd) thisWeek.push(event);
    }
  }
  endingToday.sort((left, right) => left.end - right.end);
  startingTonight.sort((left, right) => left.start - right.start);
  activeNow.sort((left, right) => {
    const leftOpen = Number.isNaN(left.end.valueOf());
    const rightOpen = Number.isNaN(right.end.valueOf());
    if (leftOpen !== rightOpen) return leftOpen ? 1 : -1;
    return leftOpen ? 0 : left.end - right.end;
  });
  thisWeek.sort((left, right) => left.start - right.start);
  return {
    endingToday, startingTonight, activeNow, thisWeek,
  };
}

function timelineItem(contentHtml, stateClass = "") {
  return `<div class="tl-item${stateClass ? ` ${stateClass}` : ""}">
    <div class="tl-rail"><div class="tl-dot"></div><div class="tl-line"></div></div>
    <div class="tl-content">${contentHtml}</div>
  </div>`;
}

function timelineNowItem(contentHtml) {
  return `<div class="tl-item is-now">
    <div class="tl-rail"><div class="tl-dot-now"></div><div class="tl-line"></div></div>
    <div class="tl-content">${contentHtml}</div>
  </div>`;
}

// A row's own destination depends on what it names, same split upcoming.js's
// eventItem() already draws: a row with a formId names a Pokemon this app has
// a raid-target answer for, so it goes straight there via the plain deep-link
// form app.js's search suggestions use (?boss=<formId>#raids, no data-route —
// that hash-only href never round-trips through the router's data-route
// click handler). A row without one is a generic feed event — its only
// destination is the source article, tucked behind a <details> disclosure
// rather than surfacing raw leekduck.com hrefs on tap, and only when it
// clears ALLOWED_EVENT_LINK (safeEventLink).
function timelineDetails(event, verdictClass) {
  const safeLink = safeEventLink(event.link);
  if (!safeLink) return "";
  return `<details class="tl-details">
    <summary>Details</summary>
    <p class="${verdictClass}"><a class="event-external-link" href="${escapeHtml(safeLink)}" target="_blank" rel="noopener">Full details ↗ (leaves the app)</a></p>
  </details>`;
}

function timelineCard(event, forms, { badgeClass, badgeText }) {
  const name = forms?.[event.formId]?.name ?? event.name;
  const sprite = event.formId
    ? spriteHtml(event.formId, forms, name, forms?.[event.formId]?.primary_type)
    : `<span class="tl-glyph" aria-hidden="true">&#9670;</span>`;
  const cardClass = `tl-card${badgeClass === "is-ending" ? " is-urgent" : ""}`;
  const body = `<div class="tl-card-head">${sprite}
      <div>
        <p class="tl-eyebrow"><span class="tl-badge ${badgeClass}">${escapeHtml(badgeText)}</span></p>
        <h3>${escapeHtml(name)}</h3>
      </div>
    </div>
    ${event.action ? `<p class="tl-verdict">${escapeHtml(event.action)}</p>` : ""}`;
  if (event.formId) {
    return `<a class="${cardClass}" href="./?boss=${encodeURIComponent(event.formId)}#raids">${body}</a>`;
  }
  return `<div class="${cardClass}">${body}${timelineDetails(event, "tl-verdict")}</div>`;
}

// gapByFormId (gap-analyzer.js, same lookup upcoming.js's day cards used to
// carry): { [formId]: { headline, href } } for a boss this roster has no
// strong counter for. Threaded through so the timeline keeps the one gap
// teaser Home had — it doesn't invent a new one.
function timelineRow(event, forms, now, gapByFormId) {
  const name = forms?.[event.formId]?.name ?? event.name;
  const when = formatEventWhen(event.startsAt, event.endsAt, now);
  const gap = event.formId ? gapByFormId?.[event.formId] ?? null : null;
  const body = `<p class="tl-row-title">${when ? `<span class="tl-row-time">${escapeHtml(when)}</span>` : ""}<strong>${escapeHtml(name)}</strong></p>
    ${event.action ? `<p class="tl-row-note">${escapeHtml(event.action)}</p>` : ""}`;
  // gap note is a sibling after the row, never inside it — nesting it inside
  // the boss row's own <a class="tl-row"> would put an <a> inside an <a>,
  // which the parser force-closes (dropping the note out of the row box).
  const gapNote = gap ? `<p class="tl-row-note"><a class="safe-escape" href="${escapeHtml(gap.href)}">${escapeHtml(gap.headline)} — See Roster Gaps →</a></p>` : "";
  if (event.formId) {
    return `<a class="tl-row" href="./?boss=${encodeURIComponent(event.formId)}#raids">${body}</a>${gapNote}`;
  }
  return `<div class="tl-row">${body}${gapNote}${timelineDetails(event, "tl-row-note")}</div>`;
}

// The overflow past `limit` used to point at "the events calendar" —
// upcoming.js's renderUpcomingSection(), which A5's deletion accounting
// (see the file-top note) retired from renderHome. Nothing on Home renders
// that surface anymore, so a link/mention of it is a dead end, not a lazy
// disclosure. The items themselves are still real data the feed already
// carries, so the overflow line names them directly — a <details> disclosure
// the reader can open right here, each name linking to its own raid target
// when it has a formId, same rule as every other row in this rail.
function overflowNames(overflowItems, forms) {
  return overflowItems.map((event) => {
    const name = escapeHtml(forms?.[event.formId]?.name ?? event.name);
    return event.formId ? `<a href="./?boss=${encodeURIComponent(event.formId)}#raids">${name}</a>` : name;
  }).join(", ");
}

// Renders one bucket's items as tl-items, section heading on the first row
// only, capped at `limit` with a folded "+N more" disclosure row past that —
// the same shape as the mockup's own active-now tail, kept flat instead of
// letting a long rotation/events feed grow Home's DOM without bound.
function timelineBucket({
  label, items, limit, stateClass = "", urgent = false, forms, now, render,
}) {
  if (!items.length) return "";
  const shown = items.slice(0, limit);
  const overflowItems = items.slice(shown.length);
  const rows = shown.map((event, index) => {
    const heading = index === 0 ? `<p class="tl-section${urgent ? " is-urgent" : ""}">${escapeHtml(label)}</p>` : "";
    return timelineItem(`${heading}${render(event, forms, now)}`, stateClass);
  });
  if (overflowItems.length > 0) {
    rows.push(timelineItem(`<details class="tl-footnote">
      <summary><strong>+${overflowItems.length} more</strong></summary>
      <p>${overflowNames(overflowItems, forms)}</p>
    </details>`, stateClass));
  }
  return rows.join("");
}

// The whole NOW-anchored rail: the briefing as the fixed NOW node (when
// there's a rotation to anchor it on), then ending-today (beyond the
// rotation), starting-tonight, active-now, this-week - each sourced from
// current-events only. The events buckets don't depend on the rotation
// existing — an empty currentBosses (still possible mid-refresh, or in a
// release with nothing up) shouldn't also blank out real events data.
// Returns "" only when there is genuinely nothing to show.
export function renderFieldTimeline({
  currentBosses, currentEvents, raidTargetTool, forms, roster, data, storage, trainerLevel, gapByFormId = null, now = new Date(), briefingShareMessage = "",
} = {}) {
  const briefingHtml = renderFieldBriefing({
    currentBosses, currentEvents, raidTargetTool, forms, roster, data, storage, trainerLevel, now, shareMessage: briefingShareMessage,
  });
  const buckets = buildTimelineBuckets(currentEvents?.events, now);
  const hasEvents = buckets.endingToday.length || buckets.startingTonight.length
    || buckets.activeNow.length || buckets.thisWeek.length;
  if (!briefingHtml && !hasEvents) return "";

  const items = briefingHtml ? [timelineNowItem(briefingHtml)] : [];
  items.push(timelineBucket({
    label: "Ending today · beyond the rotation",
    items: buckets.endingToday,
    limit: ENDING_TODAY_DISPLAY_LIMIT,
    stateClass: "is-urgent",
    urgent: true,
    forms,
    now,
    render: (event, formsArg, nowArg) => timelineCard(event, formsArg, {
      badgeClass: "is-ending", badgeText: `Ends · ${formatEventWhen(event.startsAt, event.endsAt, nowArg)}`,
    }),
  }));
  items.push(timelineBucket({
    label: "Starting tonight",
    items: buckets.startingTonight,
    limit: STARTING_TONIGHT_DISPLAY_LIMIT,
    stateClass: "is-soon",
    forms,
    now,
    render: (event, formsArg, nowArg) => timelineRow(event, formsArg, nowArg, gapByFormId),
  }));
  items.push(timelineBucket({
    label: "Active now · no scheduled end",
    items: buckets.activeNow,
    limit: ACTIVE_NOW_DISPLAY_LIMIT,
    stateClass: "is-open",
    forms,
    now,
    render: (event, formsArg, nowArg) => timelineRow(event, formsArg, nowArg, gapByFormId),
  }));
  items.push(timelineBucket({
    label: "This week",
    items: buckets.thisWeek,
    limit: THIS_WEEK_DISPLAY_LIMIT,
    forms,
    now,
    render: (event, formsArg, nowArg) => timelineRow(event, formsArg, nowArg, gapByFormId),
  }));

  const nowLabel = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  // Showcase advisor (item 7) — one honest line, not a bucket item; it
  // doesn't compete with the rail's own sectioning above.
  const showcaseLine = showcaseAdvisorLine({
    currentEvents, forms, roster, now,
  });
  return `<div class="tl-now"><span class="tl-now-chip"><span class="tl-now-dot" aria-hidden="true"></span>NOW · ${escapeHtml(nowLabel)}</span></div>
  ${showcaseLine}
  <div class="tl">${items.join("")}</div>
  <p class="tl-honesty">Filed for this rotation — the briefing re-files when the rotation changes, not on every open. End times come straight from today's release data; nothing above is a live clock.</p>`;
}


export function renderHome({
  cutoff,
  offlineStatus = "Offline setup incomplete",
  updateStatus = "Update status unavailable",
  continueTask = null,
  currentBosses = null,
  currentEvents = null,
  raidTargetTool = null,
  forms = {},
  whatsNew = null,
  releaseDiff = null,
  roster = null,
  storage = null,
  gapByFormId = null,
  // Today + Weekly Coach fold-ins. `data` is the whole release state, the
  // same shape buildCoachSummary/buildTodayItems already take.
  data = {},
  defenseLog = null,
  investRows = [],
  futureProof = null,
  buddyPlan = null,
  trainerLevel = null,
  now = new Date(),
  briefingShareMessage = "",
} = {}) {
  const continueRoute = CONTINUE_ROUTES.has(continueTask?.route)
    ? continueTask.route
    : null;
  const continued = continueRoute
    ? taskCard({
      href: `./#${continueRoute}${continueTask.view ? `/${continueTask.view}` : ""}`,
      title: continueTask.label ?? "Continue",
      detail: continueTask.detail ?? "Resume your last task.",
    })
    : "";
  return `<section class="home-view" aria-labelledby="today-view-title">
    <form class="fallback-section" role="search" data-global-search>
      <label for="global-search">Search Pokémon, move, type, or raid boss</label>
      <input id="global-search" name="q" type="search" autocomplete="off">
      <div class="search-recents" data-search-recents></div>
      <div data-search-results></div>
    </form>
    ${renderFieldTimeline({
    currentBosses, currentEvents, raidTargetTool, forms, roster, data, storage, trainerLevel, gapByFormId, now, briefingShareMessage,
  })}
    ${renderToday({
    data, roster, defenseLog, storage, gapByFormId, investRows, futureProof, now, profile: { trainerLevel },
  })}
    ${renderCoachSections({ data, roster, now, trainerLevel, buddyPlan })}
    ${releaseDiffCard(releaseDiff, roster, storage)}
    ${renderCommunityDayBriefCard({ currentEvents, forms, now })}
    ${whatsNewCard(whatsNew)}
    <h3 class="home-section-title">Where to next?</h3>
    <div class="home-task-grid">
      ${continued}
      ${taskCard({ href: "./#raids", title: "Raids", detail: "Counters, hundo CP, and which bosses are worth a pass." })}
      ${taskCard({ href: "./#gyms", title: "Gyms", detail: "Attack, stagger, or choose the next defender." })}
      ${taskCard({ href: "./#pvp", title: "PvP", detail: "League picks, anti-meta, and your best lead right now." })}
      ${taskCard({ href: "./#triage", title: "My Box", detail: "Keep, invest, battle, or transfer — one decision per Pokémon." })}
      ${taskCard({ href: "./#basics", title: "Learn", detail: "Plain-language basics, type chart, glossary, and drills." })}
      ${taskCard({ href: "./#leaderboard", title: "Gym Leaderboard", detail: "Track your longest defenses, compete with friends." })}
      ${taskCard({ href: "./#rocket", title: "Team GO Rocket", detail: "Shadow Raid bosses, Rocket events, and grunt lineups." })}
      ${taskCard({ href: "./#eggs", title: "Egg Pool", detail: "What can hatch from each egg distance." })}
      ${taskCard({ href: "./#more", title: "More", detail: "Your roster, settings, attacker lists, and this build." })}
    </div>
    <footer class="home-status-chips" aria-label="Field status">
      <span class="status-chip" aria-label="Data cutoff">Data through ${escapeHtml(cutoff ?? "unknown")}</span>
      <span class="status-chip" aria-label="Offline status">${escapeHtml(offlineStatus)}</span>
      <span class="status-chip" aria-label="Update status">${escapeHtml(updateStatus)}</span>
    </footer>
  </section>`;
}
