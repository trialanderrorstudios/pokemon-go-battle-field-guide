import { ATTACK_TYPES, effectiveness } from "../raid-target.js";
import { spriteHtml } from "../sprites.js";
import { intersectRosterChanges, releaseDiffDismissedKey } from "../release-diff.js";
import { renderCommunityDayBriefCard } from "../cd-brief.js";
import { renderUpcomingSection, renderUpcomingTeaser } from "../upcoming.js";


export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
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


// Reuses the app's existing investment-tier vocabulary (see investment.py's
// TIER_RULES) rather than inventing a new "worth it" scale: S+, S, and A
// already mean "Build ASAP", "Strong Investment", and "Build for Coverage"
// everywhere else raid rows show up.
const PASS_WORTHY_TIERS = new Set(["S+", "S", "A"]);

function bestInvestmentTier(formId, raids) {
  const tierOrder = ["S+", "S", "A", "B", "C"];
  let best = null;
  for (const row of [...(raids?.regular ?? []), ...(raids?.shadow ?? [])]) {
    if (row.formId !== formId || !row.investmentTier) continue;
    if (best === null || tierOrder.indexOf(row.investmentTier) < tierOrder.indexOf(best)) best = row.investmentTier;
  }
  return best;
}

// "Worth your free daily pass" composes two signals this guide already
// computes elsewhere, rather than a new ranking: the Legendary/Mega
// headliner grouping below, and this form's own best raid investment tier
// (a Legendary/Mega catch is often also a top attacker). Raids without
// either signal get no hint — silence, not a "skip this" verdict, since
// most Tier 1/3 bosses are simply undocumented here either way.
function passWorthHint(tier, formId, raids) {
  const headliner = tier === "Tier 5" || tier === "Mega";
  const strongAttacker = PASS_WORTHY_TIERS.has(bestInvestmentTier(formId, raids));
  return headliner || strongAttacker;
}


export function currentBossCard({ formId, tier, endsAt } = {}, {
  target, forms, now = new Date(), raids = null,
} = {}) {
  const name = target?.boss ?? formId;
  const bossTypes = target?.bossTypes ?? [];
  const weaknesses = bossTypes.length ? topWeaknesses(bossTypes) : [];
  const stale = typeof endsAt === "string" && !Number.isNaN(Date.parse(endsAt)) && new Date(endsAt) < now;
  const worthPass = passWorthHint(tier, formId, raids);
  return `<a class="fallback-section home-boss-card" href="./?boss=${encodeURIComponent(formId)}#raids" data-form-id="${escapeHtml(formId)}">
    <div class="home-boss-heading">${spriteHtml(formId, forms, name, bossTypes[0])}<h3>${escapeHtml(name)}</h3></div>
    <p class="boss-tier">${escapeHtml(tier || "Raid boss")}</p>
    ${weaknesses.length ? `<p class="boss-weaknesses">Weak to ${weaknesses.map(escapeHtml).join(", ")}</p>` : ""}
    ${weatherChip(target?.weatherBoostConditions)}
    ${worthPass ? `<p class="boss-pass-worth">Worth your free daily pass</p>` : ""}
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
  currentBosses, raidTargetTool, forms, now = new Date(), raids = null,
} = {}) {
  const bosses = currentBosses?.bosses ?? [];
  if (!bosses.length) return "";
  const targetsByFormId = new Map((raidTargetTool?.targets ?? []).map((target) => [target.bossFormId, target]));
  const cardFor = (boss) => currentBossCard(boss, { target: targetsByFormId.get(boss.formId), forms, now, raids });
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


// Beginner one-liner per event TYPE — static, fact-checked teach copy, not
// scraped per-event content. Shown once per type group, not per card.
// Unknown/future types fall back to a generic blurb (forward-compat).
const EVENT_TYPE_INFO = {
  "pokemon-spotlight-hour": { badge: "Spotlight Hour", blurb: "One species gets a catch bonus for a single hour." },
  "community-day": { badge: "Community Day", blurb: "Boosted spawns of one species for a few hours, often with an exclusive move if it evolves during the window." },
  "raid-hour": { badge: "Raid Hour", blurb: "One raid boss gets an extra hour of raids in the evening." },
  "max-battles": { badge: "Max Battles", blurb: "A featured Dynamax/Gigantamax boss at Power Spots for the day." },
  "max-mondays": { badge: "Max Mondays", blurb: "A featured Dynamax boss at Power Spots all Monday." },
  "raid-battles": { badge: "Raid Rotation", blurb: "The regular raid rotation window for a boss — not a special event, just when it's active." },
  "raid-day": { badge: "Raid Day", blurb: "A themed day of extra-boosted raids for one boss, often with a costume or shiny bump." },
  "go-battle-league": { badge: "GO Battle League", blurb: "The current PvP season's active league lineup." },
  "go-pass": { badge: "GO Pass", blurb: "A monthly pass with timed research and rewards." },
  "pokemon-go-fest": { badge: "GO Fest", blurb: "Niantic's flagship event — usually ticketed or global, with themed spawns and raids." },
  "choose-your-path": { badge: "Choose Your Path", blurb: "A themed event where picking a path or team changes its bonuses." },
  "season": { badge: "Season", blurb: "The multi-month season backdrop — sets ongoing spawns, bonuses, and research." },
  "event": { badge: "Event", blurb: "A themed event — check the link for its specific bonuses." },
};

function eventTypeInfo(kind, fallbackLabel) {
  return EVENT_TYPE_INFO[kind] ?? { badge: fallbackLabel ?? kind ?? "Event", blurb: "Check the link for details." };
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


// Groups by feed eventType so beginners see a type badge + one plain-language
// line about what that TYPE of event is, once, above its cards — instead of
// a flat list mixing raid hours with GO Fest with seasons.
function eventTypeGroup(kind, events, { forms, now }) {
  const info = eventTypeInfo(kind, events[0]?.typeLabel);
  return `<div class="home-event-type-group">
    <p class="event-type-heading"><span class="event-type-badge">${escapeHtml(info.badge)}</span></p>
    <p class="event-type-blurb">${escapeHtml(info.blurb)}</p>
    <div class="home-event-grid">${events.map((event) => eventCard(event, { forms, now })).join("")}</div>
  </div>`;
}


// Collapsed by default: the week strip above already surfaces every one of
// these within the next ~7 days, dated — this full listing (every event in
// the release's feed, weeks out) is reference detail beginners open on
// purpose, not a wall they scroll past by accident (the "football field"
// the week strip exists to fix). Native <details>/<summary>, same pattern as
// the app's other accordions (pvp-full-rankings, source-details).
export function renderCurrentEvents({ currentEvents, forms, now = new Date() } = {}) {
  const events = currentEvents?.events ?? [];
  if (!events.length) return "";
  const groups = new Map();
  for (const event of events) {
    const key = event.kind ?? "event";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return `<section class="home-event-section" aria-labelledby="home-event-title">
    <details id="home-event-details" class="home-event-details">
      <summary id="home-event-title">Upcoming events</summary>
      ${[...groups.entries()].map(([kind, group]) => eventTypeGroup(kind, group, { forms, now })).join("")}
      <p class="home-event-tricks-seed"><a class="safe-escape" href="./#tricks">See community tricks →</a></p>
    </details>
  </section>`;
}


// ── At-a-glance week strip ──────────────────────────────────────────────
// Same currentEvents data renderCurrentEvents groups below — this just
// re-sorts it soonest-first and caps it, so the raid hour/spotlight
// hour/Community Day the operator actually needs today doesn't require
// scrolling past every multi-week backdrop event first.
const WEEK_STRIP_WINDOW_DAYS = 7;
const WEEK_STRIP_CAP = 6;

// Always-on rotations/passes/seasons/multi-day themed backdrops aren't single
// dated occurrences — the same distinction EVENT_TYPE_INFO already draws for
// raid-battles ("not a special event, just when it's active") applies to
// these other backdrop kinds too, so they'd otherwise crowd out the week's
// actual occurrences (a Raid Hour, Community Day, or Spotlight Hour).
const WEEK_STRIP_EXCLUDED_KINDS = new Set([
  "season", "go-pass", "go-battle-league", "raid-battles", "choose-your-path",
]);

function daysUntil(date, now) {
  return Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
}

function weekStripEvents(events, now) {
  return (events ?? [])
    .filter((event) => {
      if (WEEK_STRIP_EXCLUDED_KINDS.has(event.kind)) return false;
      const start = new Date(event.startsAt);
      if (Number.isNaN(start.valueOf())) return false;
      const diff = daysUntil(start, now);
      return diff >= 0 && diff <= WEEK_STRIP_WINDOW_DAYS;
    })
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))
    .slice(0, WEEK_STRIP_CAP);
}

// Boss target when the feed names one (raid hour, spotlight hour, most
// Community Days) — same deep link currentBossCard/eventCard already use.
// Otherwise the feed's own vetted leekduck link, same allowlist eventCard
// validates against. Neither present -> no href; the row instead reveals
// the full "Upcoming events" detail below (still this same data, just
// ungrouped and undated further out).
function weekStripHref(event) {
  if (event.formId) return `./?boss=${encodeURIComponent(event.formId)}#raids`;
  return safeEventLink(event.link);
}

function weekStripRow(event, { forms, now }) {
  const info = eventTypeInfo(event.kind, event.typeLabel);
  const name = forms?.[event.formId]?.name ?? event.name;
  const when = formatEventWhen(event.startsAt, event.endsAt, now);
  const href = weekStripHref(event);
  const body = `<span class="week-strip-badge">${escapeHtml(info.badge)}</span>
    <span class="week-strip-when">${escapeHtml(when)}</span>
    <span class="week-strip-name">${escapeHtml(name)}</span>`;
  return href
    ? `<a class="week-strip-row" href="${escapeHtml(href)}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""} data-event-id="${escapeHtml(event.eventId)}">${body}</a>`
    : `<button type="button" class="week-strip-row" data-action="reveal-events" data-event-id="${escapeHtml(event.eventId)}">${body}</button>`;
}

export function renderWeekStrip({ currentEvents, forms, now = new Date() } = {}) {
  const rows = weekStripEvents(currentEvents?.events, now);
  if (!rows.length) return "";
  return `<section class="home-week-strip fallback-section" aria-labelledby="home-week-strip-title">
    <h3 id="home-week-strip-title" class="home-section-title">This week at a glance</h3>
    <div class="week-strip-list">${rows.map((event) => weekStripRow(event, { forms, now })).join("")}</div>
    <button type="button" class="week-strip-all-link" data-action="reveal-events">All events →</button>
  </section>`;
}


// "TODAY · 6-7 PM" / "WED JUL 29 · 6-7 PM" — shared by the Home Raid Hour
// banner, the week strip, and Weekly Coach's/Today's fold-ins, so every
// surface reads the same clock the same way and dates a Raid Hour instead of
// leaving its weekday ambiguous between this week and next.
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
    <p><a href="./#delta">See everything that changed →</a></p>
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
  raids = null,
  whatsNew = null,
  releaseDiff = null,
  roster = null,
  storage = null,
  gapByFormId = null,
} = {}) {
  const continueRoute = CONTINUE_ROUTES.has(continueTask?.route)
    ? continueTask.route
    : null;
  const continued = continueRoute
    ? taskCard({
      href: `./#${continueRoute}`,
      title: continueTask.label ?? "Continue",
      detail: continueTask.detail ?? "Resume your last task.",
    })
    : "";
  return `<section class="home-view" aria-labelledby="home-view-title">
    <h2 id="home-view-title">Ready for the next battle</h2>
    <form class="fallback-section" role="search" data-global-search>
      <label for="global-search">Search Pokémon, move, type, or raid boss</label>
      <input id="global-search" name="q" type="search" autocomplete="off">
      <div class="search-recents" data-search-recents></div>
      <div data-search-results aria-live="polite"></div>
    </form>
    ${renderWeekStrip({ currentEvents, forms })}
    ${renderUpcomingTeaser({ currentEvents, forms })}
    ${releaseDiffCard(releaseDiff, roster, storage)}
    ${renderCommunityDayBriefCard({ currentEvents, forms })}
    <h3 class="home-section-title">What are you fighting?</h3>
    <div class="home-task-grid">
      ${taskCard({ href: "./#today", title: "Today", detail: "Raid/Spotlight Hour, gym status, and today's picks — one checklist." })}
      ${continued}
      ${taskCard({ href: "./#triage", title: "Triage My Box", detail: "Keep, invest, battle, or transfer — one safe decision per Pokémon." })}
      ${taskCard({ href: "./#coach", title: "Weekly Coach", detail: "This week's raid picks, power-ups, buddy, and PvP team in one place." })}
      ${taskCard({ href: "./#raids", title: "Raid Target", detail: "Check hundo CP and the best counters." })}
      ${taskCard({ href: "./#gyms", title: "Gym Plan", detail: "Attack, stagger, or choose the next defender." })}
      ${taskCard({ href: "./#leaderboard", title: "Gym Leaderboard", detail: "Track your longest defenses, compete with friends." })}
      ${taskCard({ href: "./#pvp", title: "PvP", detail: "Great, Ultra, and Master League picks." })}
      ${taskCard({ href: "./#swap", title: "Battle Swap", detail: "Facing someone now? Find your best lead." })}
      ${taskCard({ href: "./#drill", title: "Type Drill", detail: "Flashcard practice on type matchups." })}
    </div>
    ${whatsNewCard(whatsNew)}
    ${renderCurrentBosses({ currentBosses, raidTargetTool, forms, raids })}
    <div class="home-task-grid home-task-grid-secondary">
      ${taskCard({ href: "./#more", title: "My Roster", detail: "Use the Pokémon you already own." })}
      ${taskCard({ href: "./#basics", title: "Battle Basics", detail: "New here? Start with the plain-language basics." })}
      ${taskCard({ href: "./#types", title: "Type Chart", detail: "Every type's strengths and weaknesses." })}
      ${taskCard({ href: "./#eggs", title: "Egg Pool", detail: "What can hatch from each egg distance." })}
      ${taskCard({ href: "./#rocket", title: "Team GO Rocket", detail: "Shadow Raid bosses and Rocket-flavored events in rotation." })}
      ${taskCard({ href: "./#hundo", title: "Hundo Priority", detail: "Which hundos are worth chasing right now, and which aren't." })}
    </div>
    ${renderUpcomingSection({ currentEvents, forms, gapByFormId })}
    ${renderCurrentEvents({ currentEvents, forms })}
    <footer class="home-status-chips" aria-label="Field status">
      <span class="status-chip" aria-label="Data cutoff">Data through ${escapeHtml(cutoff ?? "unknown")}</span>
      <span class="status-chip" aria-label="Offline status">${escapeHtml(offlineStatus)}</span>
      <span class="status-chip" aria-label="Update status">${escapeHtml(updateStatus)}</span>
    </footer>
  </section>`;
}
