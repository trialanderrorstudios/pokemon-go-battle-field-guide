import { ATTACK_TYPES, effectiveness } from "../raid-target.js";
import { spriteHtml } from "../sprites.js";


export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
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


export function currentBossCard({ formId, tier, endsAt } = {}, { target, forms, now = new Date() } = {}) {
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


export function renderCurrentBosses({ currentBosses, raidTargetTool, forms, now = new Date() } = {}) {
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
    ${headliners
      ? `${bossTierRow("Legendary raids", legendary, cardFor)}${bossTierRow("Mega raids", mega, cardFor)}${bossTierRow("Other tiers", minor, cardFor)}`
      : `<div class="home-boss-grid">${bosses.map(cardFor).join("")}</div>`}
  </section>`;
}


function formatEventWhen(startsAt, endsAt) {
  // typeof guard first: new Date(null) is the 1970 epoch (a valid date, not
  // NaN), so a missing startsAt would otherwise render "Dec 31"/"Jan 1" 1970
  // instead of the blank line the sort guard already tolerates elsewhere.
  if (typeof startsAt !== "string") return "";
  const start = new Date(startsAt);
  if (Number.isNaN(start.valueOf())) return "";
  const options = { month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString("en-US", options);
  const end = new Date(endsAt);
  if (Number.isNaN(end.valueOf()) || end.toDateString() === start.toDateString()) return startLabel;
  return `${startLabel} – ${end.toLocaleDateString("en-US", options)}`;
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

function safeEventLink(link) {
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
    <p class="event-when">${escapeHtml(formatEventWhen(startsAt, endsAt))}</p>
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
    <h3 id="home-event-title">Upcoming events</h3>
    ${[...groups.entries()].map(([kind, group]) => eventTypeGroup(kind, group, { forms, now })).join("")}
  </section>`;
}


// "WED 6-7 PM" — shared by the Home Raid Hour banner and Weekly Coach's
// "worth raiding" fold-in, so both read the same clock the same way.
export function formatRaidHourWhen(startsAt, endsAt) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.valueOf())) return "";
  const day = start.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  // Split on any whitespace, not a literal space: ICU-72+ browser engines
  // (Chrome 110+, Safari 16.4+, Firefox 106+) emit U+202F (narrow no-break
  // space) between hour and AM/PM, which a plain " " split misses — Node's
  // ICU still uses a plain space, so the test suite can't catch that split.
  const [startNum, startPeriod] = start.toLocaleTimeString("en-US", { hour: "numeric" }).split(/\s/);
  const end = new Date(endsAt);
  if (Number.isNaN(end.valueOf())) return `${day} ${startNum} ${startPeriod}`;
  const [endNum, endPeriod] = end.toLocaleTimeString("en-US", { hour: "numeric" }).split(/\s/);
  return startPeriod === endPeriod
    ? `${day} ${startNum}-${endNum} ${endPeriod}`
    : `${day} ${startNum} ${startPeriod}-${endNum} ${endPeriod}`;
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
  const when = formatRaidHourWhen(event.startsAt, event.endsAt);
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
      <div data-search-results aria-live="polite"></div>
    </form>
    ${raidHourBanner({ currentEvents, forms })}
    <h3 class="home-section-title">What are you fighting?</h3>
    <div class="home-task-grid">
      ${continued}
      ${taskCard({ href: "./#triage", title: "Triage My Box", detail: "Keep, invest, battle, or transfer — one safe decision per Pokémon." })}
      ${taskCard({ href: "./#coach", title: "Weekly Coach", detail: "This week's raid picks, power-ups, buddy, and PvP team in one place." })}
      ${taskCard({ href: "./#raids", title: "Raid Target", detail: "Check hundo CP and the best counters." })}
      ${taskCard({ href: "./#gyms", title: "Gym Plan", detail: "Attack, stagger, or choose the next defender." })}
      ${taskCard({ href: "./#pvp", title: "PvP", detail: "Great, Ultra, and Master League picks." })}
      ${taskCard({ href: "./#swap", title: "Battle Swap", detail: "Facing someone now? Find your best lead." })}
      ${taskCard({ href: "./#drill", title: "Type Drill", detail: "Flashcard practice on type matchups." })}
    </div>
    ${whatsNewCard(whatsNew)}
    ${renderCurrentBosses({ currentBosses, raidTargetTool, forms })}
    <div class="home-task-grid home-task-grid-secondary">
      ${taskCard({ href: "./#more", title: "My Roster", detail: "Use the Pokémon you already own." })}
      ${taskCard({ href: "./#basics", title: "Battle Basics", detail: "New here? Start with the plain-language basics." })}
      ${taskCard({ href: "./#types", title: "Type Chart", detail: "Every type's strengths and weaknesses." })}
    </div>
    ${renderCurrentEvents({ currentEvents, forms })}
    <footer class="home-status-chips" aria-label="Field status">
      <span class="status-chip" aria-label="Data cutoff">Data through ${escapeHtml(cutoff ?? "unknown")}</span>
      <span class="status-chip" aria-label="Offline status">${escapeHtml(offlineStatus)}</span>
      <span class="status-chip" aria-label="Update status">${escapeHtml(updateStatus)}</span>
    </footer>
  </section>`;
}
