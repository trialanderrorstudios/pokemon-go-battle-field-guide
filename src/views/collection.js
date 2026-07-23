import { escapeHtml, shinyLuckyBadges } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { collectionProgress, livingDexRows } from "../collection.js";

const FILTERS = Object.freeze([
  { id: "all", label: "All" },
  { id: "missing", label: "Missing" },
  { id: "shiny", label: "Shiny" },
  { id: "lucky", label: "Lucky" },
]);


function progressLine(bucket) {
  return `<li class="collection-progress-row">
    <span>${escapeHtml(bucket.region ? `Gen ${bucket.gen} · ${bucket.region}` : "Unplaced")}</span>
    <span>${bucket.caught}/${bucket.total} caught · ${bucket.shiny} shiny · ${bucket.lucky} lucky</span>
  </li>`;
}


function dexCard(row, forms) {
  const badges = shinyLuckyBadges(row);
  return `<li class="collection-card${row.caught ? " is-caught" : " is-missing"}" data-form-id="${escapeHtml(row.formId)}">
    ${spriteHtml(row.formId, forms, row.name, row.primaryType)}
    <span class="collection-card-dex">#${row.dex}</span>
    <strong class="collection-card-name">${escapeHtml(row.name)}</strong>
    <span class="collection-card-status">${row.caught ? "Caught" : "Missing"}</span>
    ${badges}
  </li>`;
}


// Progress readouts (overall + per-generation) and a filterable, missing-
// first living-dex grid. Tracks only what the user has marked — no
// shiny-availability claims (see collection.js honesty note).
export function renderCollectionView(data = {}) {
  const forms = data.forms ?? {};
  const roster = data.roster ?? {};
  const query = String(data.collectionQuery ?? "");
  const filter = FILTERS.some((entry) => entry.id === data.collectionFilter) ? data.collectionFilter : "all";
  const progress = collectionProgress(forms, roster);
  const rows = livingDexRows(forms, roster, { query, filter });

  return `<section class="collection-view" data-more-list-view="collection" aria-labelledby="collection-title">
    <a class="safe-escape" href="./#more">Back to More</a>
    <p class="status-kicker">Collection guide</p>
    <h2 id="collection-title">Living Dex Collection</h2>
    <p>Tracks only what you've marked owned, shiny, or lucky on this device — there's no shiny-odds or availability data here.</p>
    <p class="collection-overall"><strong>${progress.overall.caught}/${progress.overall.total} caught</strong> · ${progress.overall.shiny} shiny · ${progress.overall.lucky} lucky</p>
    <ul class="collection-progress-list">${progress.byGeneration.map(progressLine).join("")}</ul>
    <label class="roster-search">Search any Pokémon, dex #, or region
      <input type="search" data-collection-search value="${escapeHtml(query)}" autocomplete="off">
    </label>
    <div class="app-actions" role="group" aria-label="Collection filter">
      ${FILTERS.map((entry) => `<button type="button" data-collection-filter="${entry.id}" aria-pressed="${entry.id === filter}">${entry.label}</button>`).join("")}
    </div>
    <p class="collection-count">${rows.length} ${rows.length === 1 ? "entry" : "entries"} · missing shown first</p>
    <ul class="collection-grid">${rows.length ? rows.map((row) => dexCard(row, forms)).join("") : '<li class="gym-empty">Nothing matches this search/filter.</li>'}</ul>
  </section>`;
}
