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
  const start = new Date(startsAt);
  if (Number.isNaN(start.valueOf())) return "";
  const options = { month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString("en-US", options);
  const end = new Date(endsAt);
  if (Number.isNaN(end.valueOf()) || end.toDateString() === start.toDateString()) return startLabel;
  return `${startLabel} – ${end.toLocaleDateString("en-US", options)}`;
}


export function eventCard({ eventId, name, formId, startsAt, endsAt, action } = {}, { forms, now = new Date() } = {}) {
  const stale = typeof endsAt === "string" && !Number.isNaN(Date.parse(endsAt)) && new Date(endsAt) < now;
  return `<div class="fallback-section home-event-card" data-event-id="${escapeHtml(eventId)}">
    <div class="home-event-heading">${formId ? spriteHtml(formId, forms, name, forms?.[formId]?.primary_type) : ""}<h4>${escapeHtml(name)}</h4></div>
    <p class="event-when">${escapeHtml(formatEventWhen(startsAt, endsAt))}</p>
    <p class="event-action">${escapeHtml(action)}</p>
    ${stale ? `<p class="boss-stale">May be outdated — check in-game.</p>` : ""}
  </div>`;
}


export function renderCurrentEvents({ currentEvents, forms, now = new Date() } = {}) {
  const events = currentEvents?.events ?? [];
  if (!events.length) return "";
  return `<section class="home-event-section" aria-labelledby="home-event-title">
    <h3 id="home-event-title">Upcoming events</h3>
    <div class="home-event-grid">${events.map((event) => eventCard(event, { forms, now })).join("")}</div>
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


function startHereCard(showStartHere) {
  if (!showStartHere) return "";
  return `<div class="fallback-section whats-new-card start-here-card" role="note">
    <p><strong>New to battling? Start here</strong></p>
    <p>Raids are timed team fights against a giant boss Pokémon guarding a gym — beat it with other trainers before time runs out for a chance to catch it. Gyms hold defending Pokémon placed by other trainers; attack one to clear it, then place your own Pokémon to defend it. PvP means fighting another trainer's team of three Pokémon instead of the game's bosses and defenders. Each mode rewards different Pokémon and strategy, so it's worth learning the basics before you dive in. Start with the plain-language basics, the type chart, or the glossary below.</p>
    <p class="start-here-links"><a class="safe-escape" href="./#basics">Battle Basics</a> · <a class="safe-escape" href="./#types">Type Chart</a> · <a class="safe-escape" href="./#glossary">Glossary</a></p>
    <button type="button" data-action="dismiss-start-here">Got it</button>
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
  showStartHere = false,
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
      ${taskCard({ href: "./#coach", title: "Weekly Coach", detail: "This week's raid picks, power-ups, buddy, and PvP team in one place." })}
      ${taskCard({ href: "./#raids", title: "Raid Target", detail: "Check hundo CP and the best counters." })}
      ${taskCard({ href: "./#gyms", title: "Gym Plan", detail: "Attack, stagger, or choose the next defender." })}
      ${taskCard({ href: "./#pvp", title: "PvP", detail: "Great, Ultra, and Master League picks." })}
      ${taskCard({ href: "./#swap", title: "Battle Swap", detail: "Facing someone now? Find your best lead." })}
      ${taskCard({ href: "./#drill", title: "Type Drill", detail: "Flashcard practice on type matchups." })}
    </div>
    ${whatsNewCard(whatsNew)}
    ${renderCurrentBosses({ currentBosses, raidTargetTool, forms })}
    ${startHereCard(showStartHere)}
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
