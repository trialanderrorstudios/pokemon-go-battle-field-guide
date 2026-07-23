// Team GO Rocket surface (round 14). Composes two already-sourced release
// feeds — this app never forks their math or invents new ones:
//   - current-bosses.json's Shadow-tier rotation, rendered with the exact
//     same currentBossCard() Home uses (hundo CP / counters live behind the
//     same tap-through to Raid Target).
//   - current-events.json entries whose name flags them as Rocket/Shadow-Raid
//     flavored, rendered with the exact same eventCard() the Upcoming Events
//     section uses.
// This app has no sourced Team GO Rocket grunt/leader lineup data (no such
// source is in data/sources/manifest.json), so this page never lists grunt
// teams, encounter odds, or "who to bring to a Rocket battle" — only what's
// genuinely sourced already: which Shadow Pokémon are in Shadow Raids right
// now, and which live events are Rocket-flavored. Everything else here is a
// pointer to features that already exist (Glossary, Triage's shadow
// keep/purify advisor) rather than a duplicate of their logic.
import { currentBossCard, eventCard } from "./home.js";

const ROCKET_EVENT_PATTERN = /rocket|shadow raid/i;

export function shadowRaidBosses(currentBosses) {
  return (currentBosses?.bosses ?? []).filter((boss) => boss?.tier === "Shadow");
}

export function rocketFlavoredEvents(currentEvents) {
  return (currentEvents?.events ?? []).filter((event) => ROCKET_EVENT_PATTERN.test(event?.name ?? ""));
}

export function renderRocket({
  currentBosses = null, currentEvents = null, raidTargetTool = null, forms = {}, raids = null, now = new Date(),
} = {}) {
  const bosses = shadowRaidBosses(currentBosses);
  const events = rocketFlavoredEvents(currentEvents);
  const targetsByFormId = new Map((raidTargetTool?.targets ?? []).map((target) => [target.bossFormId, target]));

  const bossSection = bosses.length
    ? `<div class="home-boss-grid">${bosses
      .map((boss) => currentBossCard(boss, { target: targetsByFormId.get(boss.formId), forms, now, raids }))
      .join("")}</div>`
    : `<p class="gym-empty">No Shadow Raid bosses in this release's rotation.</p>`;

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
    <p class="gym-empty">This app has no sourced Team GO Rocket grunt or leader lineup data, so it can't list which Pokémon to bring to a Rocket battle — only what's above.</p>
  </div>`;
}
