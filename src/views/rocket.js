// Team GO Rocket surface (round 14, lineups round 17). Composes three
// already-sourced release feeds — this app never forks their math or invents
// new ones:
//   - current-bosses.json's Shadow-tier rotation, rendered with the exact
//     same currentBossCard() Home uses (hundo CP / counters live behind the
//     same tap-through to Raid Target).
//   - current-events.json entries whose name flags them as Rocket/Shadow-Raid
//     flavored, rendered with the exact same eventCard() the Upcoming Events
//     section uses.
//   - rocket-lineups.json's battler lineups. This is a build-time-synced
//     ROTATION feed (data/curated/rocket-lineups.json, ScrapedDuck — a
//     maintained LeekDuck.com mirror — via scripts/sync-rocket.mjs), the same
//     lane as raids/events/eggs. It is deliberately NOT in
//     data/sources/manifest.json: that file is for frozen sources, not a
//     rotating feed, so this page's old "no such source exists" note was
//     wrong about where a lineup source would live.
// What the feed carries is exactly what this page renders: the pool of Pokémon
// each of the three battle slots can open with, each mon's isEncounter and
// canBeShiny flags, and a grunt's declared type. Counter types are derived
// client-side by applying web/src/type-chart.js to that declared type — the
// app's one type table, not a new ranking engine, no DPS and no simulation.
// Untyped battlers (Giovanni, the three leaders, the untyped grunts) get no
// counters line at all, because the feed makes no type claim for them.
// Still not claimed, because the feed doesn't carry it: per-battle odds, a
// guaranteed roster, CP, levels, and movesets. The feed's CDN image URLs are
// dropped at sync time (offline-first, plus public_safety.py's URL gate), so
// sprites are local; mons this dex can't resolve keep formId: null and render
// by name rather than being guessed at. Everything else here is a pointer to
// features that already exist (Glossary, Triage's shadow keep/purify advisor)
// rather than a duplicate of their logic.
import { escapeHtml, currentBossCard, eventCard } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { ATTACK_TYPES, weaknessesOf } from "../type-chart.js";
import { typeChip } from "./types.js";

const ROCKET_EVENT_PATTERN = /rocket|shadow raid/i;

export function shadowRaidBosses(currentBosses) {
  return (currentBosses?.bosses ?? []).filter((boss) => boss?.tier === "Shadow");
}

export function rocketFlavoredEvents(currentEvents) {
  return (currentEvents?.events ?? []).filter((event) => ROCKET_EVENT_PATTERN.test(event?.name ?? ""));
}

// ponytail: reuses the Egg Pool's row/badge classes (.egg-group/.egg-list/
// .egg-row/.egg-badge) rather than adding parallel .rocket-* CSS — same
// sprite + name + badges roster shape, zero duplicated declarations. Rename
// the shared classes if a second consumer ever needs to diverge visually.
function lineupBadges(mon) {
  const badges = [];
  if (mon.isEncounter) badges.push(`<span class="egg-badge">Catchable</span>`);
  if (mon.canBeShiny) badges.push(`<span class="egg-badge egg-badge-shiny">Can be shiny</span>`);
  return badges.length ? `<p class="egg-badges">${badges.join("")}</p>` : "";
}

// primaryType comes from the feed's own types[], not a forms lookup, so the
// same code path colors the fallback circle for a name-only (formId: null) row.
function lineupMonRow(mon, forms) {
  return `<li class="egg-row">
    ${spriteHtml(mon.formId, forms, mon.name, mon.types?.[0])}
    <span class="egg-row-body">
      <span class="egg-row-name">${escapeHtml(mon.name)}</span>
      ${lineupBadges(mon)}
    </span>
  </li>`;
}

// An empty slot is legal in the feed and renders as nothing, not an error.
function lineupSlot(mons, index, forms) {
  if (!mons?.length) return "";
  return `<p class="status-kicker">Slot ${index + 1}</p>
    <ul class="egg-list">${mons.map((mon) => lineupMonRow(mon, forms)).join("")}</ul>`;
}

// The app's one type chart applied to the grunt's declared type — no new
// ranking. The ATTACK_TYPES membership check is load-bearing: typeChip
// deliberately doesn't escape its input, so an unverified feed string must
// never reach it.
function countersLine(type) {
  const counters = ATTACK_TYPES.includes(type) ? weaknessesOf([type]).map((row) => row.type) : [];
  return counters.length ? `<p class="type-chip-list">Bring: ${counters.map(typeChip).join("")}</p>` : "";
}

function lineupGroup(entry, forms) {
  const groupId = `rocket-lineup-${escapeHtml(entry.name.replace(/\s+/g, "-"))}`;
  return `<section class="egg-group" aria-labelledby="${groupId}">
    <h3 id="${groupId}">${escapeHtml(entry.name)}</h3>
    <p class="egg-row-cp">${escapeHtml(entry.title)}</p>
    ${entry.quote ? `<p class="rocket-quote">“${escapeHtml(entry.quote)}”</p>` : ""}
    ${entry.type ? countersLine(entry.type) : ""}
    ${(entry.slots ?? []).map((mons, index) => lineupSlot(mons, index, forms)).join("")}
  </section>`;
}

export function renderRocket({
  currentBosses = null, currentEvents = null, raidTargetTool = null, forms = {}, raids = null,
  rocketLineups = null, now = new Date(),
} = {}) {
  const bosses = shadowRaidBosses(currentBosses);
  const events = rocketFlavoredEvents(currentEvents);
  const targetsByFormId = new Map((raidTargetTool?.targets ?? []).map((target) => [target.bossFormId, target]));

  const bossSection = bosses.length
    ? `<div class="home-boss-grid">${bosses
      .map((boss) => currentBossCard(boss, { target: targetsByFormId.get(boss.formId), forms, now, raids }))
      .join("")}</div>`
    : `<p class="gym-empty">No Shadow Raid bosses in this release's rotation.</p>`;

  // Order is frozen in the curated file at sync time (boss, leaders, type
  // grunts, untyped grunts) — this view never re-sorts it.
  const lineups = rocketLineups?.lineups ?? [];
  const lineupSection = lineups.length
    ? lineups.map((entry) => lineupGroup(entry, forms)).join("")
    : `<p class="gym-empty">Rocket lineup data isn't bundled in this release.</p>`;

  // These lines name no type, so hearing one tells you only that the taunt
  // won't narrow the lineup — worth saying rather than leaving the user to
  // hunt a quote that was never going to match.
  const decoyQuotes = rocketLineups?.decoyQuotes ?? [];
  const decoySection = decoyQuotes.length
    ? `<p class="gym-empty">Hear one of these instead — ${decoyQuotes
      .map((quote) => `“${escapeHtml(quote)}”`).join(", ")} — and the taunt names no type, so any lineup above is possible.</p>`
    : "";

  const eventSection = events.length
    ? `<div class="home-event-grid">${events.map((event) => eventCard(event, { forms, now })).join("")}</div>`
    : `<p class="gym-empty">No Rocket-flavored events in this release's rotation.</p>`;

  return `<div class="rocket-view">
    <a class="safe-escape" href="./#more">Back to More</a>
    <section class="more-section" aria-labelledby="rocket-bosses-title">
      <p class="status-kicker">Team GO Rocket</p>
      <h2 id="rocket-bosses-title">Shadow Raids right now</h2>
      <p>Tap a boss for hundo CP and counters, same as any raid target.</p>
      ${bossSection}
    </section>
    <section class="more-section" aria-labelledby="rocket-lineups-title">
      <h2 id="rocket-lineups-title">Who you'll face</h2>
      <p>The quoted line is what the grunt says when you tap them — that taunt is the only tell you get, since the type is never written on screen. Match the line, then read the slots below it. "Catchable" marks a Pokémon the feed flags as a possible post-battle encounter — the same battler can carry that flag in more than one slot, and the feed doesn't say which one you end up with.</p>
      ${lineupSection}
      ${decoySection}
    </section>
    <section class="more-section" aria-labelledby="rocket-events-title">
      <h2 id="rocket-events-title">Rocket-flavored events</h2>
      ${eventSection}
    </section>
    <section class="more-section" aria-labelledby="rocket-learn-title">
      <h2 id="rocket-learn-title">Shadow &amp; Purified, explained</h2>
      <p>Beating a Shadow Raid boss gives you a shot at catching a Shadow Pokémon. See the Glossary for what Shadow and Purified mean, and Triage My Box for a keep-or-purify call on ones you already own.</p>
      <a class="safe-escape" href="./#glossary">Shadow &amp; Purified in the Glossary</a>
      <a class="safe-escape" href="./#triage" data-route="triage">Keep-or-purify in Triage My Box</a>
    </section>
    <p class="gym-empty">Lineups are the pool of Pokémon a Rocket battle can open with in each slot, synced from LeekDuck at this app's data cutoff — not a live read of your game. The feed gives the possible Pokémon and their catch and shiny flags; it does not give per-battle odds, a guaranteed roster, CP, levels, or movesets, so this page doesn't claim any of those. Counter types come from this app's type chart applied to a grunt's declared type, not from a battle simulation.</p>
  </div>`;
}
