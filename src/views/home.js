import { ATTACK_TYPES, effectiveness } from "../raid-target.js";
import { spriteHtml } from "../sprites.js";
import { intersectRosterChanges, releaseDiffDismissedKey } from "../release-diff.js";
import { renderCommunityDayBriefCard } from "../cd-brief.js";
import { renderUpcomingSection } from "../upcoming.js";
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
    ${renderToday({
    data, roster, defenseLog, storage, gapByFormId, investRows, futureProof, now, profile: { trainerLevel },
  })}
    ${renderCoachSections({ data, roster, now, trainerLevel, buddyPlan })}
    ${renderUpcomingSection({ currentEvents, forms, gapByFormId, now })}
    ${releaseDiffCard(releaseDiff, roster, storage)}
    ${renderCommunityDayBriefCard({ currentEvents, forms, now })}
    ${whatsNewCard(whatsNew)}
    ${renderCurrentBosses({ currentBosses, raidTargetTool, forms, now })}
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
