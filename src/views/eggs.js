// Eggs: reference-only per-distance egg pool. Composes existing modules —
// escapeHtml + spriteHtml, same as every other reference view (types.js,
// raids.js) — no new math. Data is state.currentEggs (lazy release chunk,
// see ROUTE_CHUNKS/CHUNK_FIELDS in app.js), synced build-time from
// ScrapedDuck's eggs.json (a maintained LeekDuck.com mirror) via
// scripts/sync-eggs.mjs; rows without a resolvable form (formId: null) still
// render by name with a type-colored fallback circle instead of a sprite.
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";

const EGG_TYPE_ORDER = ["1 km", "2 km", "5 km", "7 km", "10 km", "12 km"];

function cpRange(egg) {
  if (!Number.isFinite(egg.cpMin)) return "";
  return egg.cpMin === egg.cpMax ? `${egg.cpMin} CP` : `${egg.cpMin}–${egg.cpMax} CP`;
}

function eggBadges(egg) {
  const badges = [];
  if (egg.canBeShiny) badges.push(`<span class="egg-badge egg-badge-shiny">Shiny-eligible</span>`);
  if (egg.isAdventureSync) badges.push(`<span class="egg-badge">Adventure Sync</span>`);
  if (egg.isGiftExchange) badges.push(`<span class="egg-badge">Gift exchange</span>`);
  if (egg.isRegional) badges.push(`<span class="egg-badge">Regional</span>`);
  return badges.length ? `<p class="egg-badges">${badges.join("")}</p>` : "";
}

function eggRow(egg, forms) {
  const type = egg.formId ? forms?.[egg.formId]?.primary_type : null;
  return `<li class="egg-row">
    ${spriteHtml(egg.formId, forms, egg.name, type)}
    <span class="egg-row-body">
      <span class="egg-row-name">${escapeHtml(egg.name)}</span>
      <span class="egg-row-cp">${escapeHtml(cpRange(egg))}</span>
      ${eggBadges(egg)}
    </span>
  </li>`;
}

function eggGroup(eggType, eggs, forms) {
  const rows = eggs.filter((egg) => egg.eggType === eggType);
  if (!rows.length) return "";
  return `<section class="egg-group" aria-labelledby="egg-group-${escapeHtml(eggType.replace(/\s+/g, "-"))}">
    <h3 id="egg-group-${escapeHtml(eggType.replace(/\s+/g, "-"))}">${escapeHtml(eggType)}</h3>
    <ul class="egg-list">${rows.map((egg) => eggRow(egg, forms)).join("")}</ul>
  </section>`;
}

export function renderEggs({ currentEggs, forms } = {}) {
  const eggs = currentEggs?.eggs ?? [];
  const knownTypes = new Set(eggs.map((egg) => egg.eggType));
  const orderedTypes = [...EGG_TYPE_ORDER, ...[...knownTypes].filter((type) => !EGG_TYPE_ORDER.includes(type)).sort()];
  const body = eggs.length
    ? orderedTypes.map((eggType) => eggGroup(eggType, eggs, forms)).join("")
    : `<p class="fallback-section">Egg pool data isn't bundled in this release.</p>`;
  return `<div class="more-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    <section class="more-section" aria-labelledby="eggs-title">
      <p class="status-kicker">Reference</p>
      <h2 id="eggs-title">Egg Pool</h2>
      <p>What can hatch from each egg distance, with shiny eligibility and hatch CP. Data credit: LeekDuck.com, synced at this app's data cutoff — not live from the game.</p>
    </section>
    ${body}
  </div>`;
}
