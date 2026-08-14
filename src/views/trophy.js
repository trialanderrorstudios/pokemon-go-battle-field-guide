// Trophy case view (fun item 2) — the "Hundo Wall": a shelf per brag-worthy
// category, sourced straight from trophy.js's trophyCase(). No new math here,
// just presentation.
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { trophyCase } from "../trophy.js";

const SHELVES = Object.freeze([
  {
    key: "hundos", title: "Hundo Wall", singular: "hundo", plural: "hundos",
    badgeLabel: "Hundo", badgeClass: "collection-badge-hundo",
    empty: "No hundos recorded yet — scan or add one and it lands here.",
  },
  {
    key: "shinies", title: "Shinies", singular: "shiny", plural: "shinies",
    badgeLabel: "Shiny", badgeClass: "",
    empty: "No shinies recorded yet — scan or add one and it lands here.",
  },
  {
    key: "luckies", title: "Luckies", singular: "lucky", plural: "luckies",
    badgeLabel: "Lucky", badgeClass: "collection-badge-lucky",
    empty: "No luckies recorded yet — scan or add one and it lands here.",
  },
  {
    key: "giants", title: "Giants", singular: "giant", plural: "giants",
    badgeLabel: "XXL", badgeClass: "collection-badge-giant",
    empty: "No giants recorded yet — scan or add one and it lands here.",
  },
  {
    key: "minis", title: "Minis", singular: "mini", plural: "minis",
    badgeLabel: "XXS", badgeClass: "collection-badge-mini",
    empty: "No minis recorded yet — scan or add one and it lands here.",
  },
]);

function summaryHeader(counts) {
  const parts = SHELVES
    .filter((shelf) => counts[shelf.key] > 0)
    .map((shelf) => `${counts[shelf.key]} ${counts[shelf.key] === 1 ? shelf.singular : shelf.plural}`);
  return parts.length ? parts.join(" · ") : "Nothing on the wall yet — scan or add a Pokémon to start filling it in.";
}

function trophyCardHtml(entry, shelf) {
  const { form, instance } = entry;
  return `<div class="fallback-section trophy-card">
    ${spriteHtml(form.form_id, { [form.form_id]: form }, form.name, form.primary_type)}
    <p class="trophy-card-name">${escapeHtml(instance.nickname?.trim() || form.name)}</p>
    <p class="trophy-card-cp">CP ${escapeHtml(instance.cp)}</p>
    <span class="${["collection-badge", shelf.badgeClass].filter(Boolean).join(" ")}">${shelf.badgeLabel}</span>
    ${entry.estimate ? `<p class="trophy-card-estimate">Showcase ${escapeHtml(entry.estimate.label)}</p>` : ""}
  </div>`;
}

function shelfHtml(shelf, entries) {
  const body = entries.length
    ? `<div class="trophy-grid">${entries.map((entry) => trophyCardHtml(entry, shelf)).join("")}</div>`
    : `<p class="trophy-empty">${escapeHtml(shelf.empty)}</p>`;
  return `<section class="trophy-shelf" aria-labelledby="trophy-shelf-${shelf.key}">
    <div class="trophy-shelf-heading">
      <h3 id="trophy-shelf-${shelf.key}">${escapeHtml(shelf.title)}</h3>
      <span class="trophy-count-chip">${entries.length}</span>
    </div>
    ${body}
  </section>`;
}

export function renderTrophyView({ roster, forms } = {}) {
  const trophies = trophyCase({ roster, forms });
  const hasAny = Object.values(trophies.counts).some((count) => count > 0);
  return `<section class="trophy-view" aria-labelledby="trophy-view-title">
    <p class="status-kicker">Trophy case</p>
    <h2 id="trophy-view-title">Hundo Wall</h2>
    <p class="trophy-summary">${escapeHtml(summaryHeader(trophies.counts))}</p>
    ${hasAny ? `<button type="button" class="briefing-share-card" data-action="share-trophy-card">Share my trophy case</button>` : ""}
    ${SHELVES.map((shelf) => shelfHtml(shelf, trophies[shelf.key])).join("")}
  </section>`;
}
