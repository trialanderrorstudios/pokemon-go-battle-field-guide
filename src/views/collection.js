import { escapeHtml, shinyLuckyBadges } from "./home.js";
import { spriteHtml } from "../sprites.js";
import {
  collectionProgress, collectionSuggestions, livingDexRows, speciesMarkState,
} from "../collection.js";

const FILTERS = Object.freeze([
  { id: "all", label: "All" },
  { id: "missing", label: "Missing" },
  { id: "owned", label: "Owned" },
  { id: "shiny", label: "Shiny" },
  { id: "lucky", label: "Lucky" },
]);


// §5 accent: overall completion ring for the grid header, computed from the
// same overall caught/total the text line already states — no new data
// source, a derived view of it (per E2's own cost note). Geometry only
// (dasharray/dashoffset are per-value, can't move to CSS); stroke color is
// app.css's via .i1-gen-ring-track/.i1-gen-ring-fill, kept out of markup.
function completionRing(caught, total) {
  const pct = total > 0 ? Math.round((caught / total) * 100) : 0;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return `<svg class="i1-gen-ring" width="36" height="36" viewBox="0 0 36 36" role="img" aria-label="${pct}% caught">
    <circle class="i1-gen-ring-track" cx="18" cy="18" r="${radius}" fill="none"/>
    <circle class="i1-gen-ring-fill" cx="18" cy="18" r="${radius}" fill="none" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 18 18)"/>
    <text class="i1-gen-ring-text" x="18" y="21" text-anchor="middle">${pct}%</text>
  </svg>`;
}


function progressLine(bucket) {
  return `<li class="collection-progress-row">
    <span>${escapeHtml(bucket.region ? `Gen ${bucket.gen} · ${bucket.region}` : "Unplaced")}</span>
    <span>${bucket.caught}/${bucket.total} caught · ${bucket.shiny} shiny · ${bucket.lucky} lucky</span>
  </li>`;
}


// I1: mode toggle + persistent banner + session tally. app.js owns
// [data-collection-mode-toggle]'s dispatch (flips ui.collectionMarkMode);
// tally is a plain session count app.js keeps in ui state and threads
// through as collectionMarkTally, same as collectionQuery/collectionFilter.
function modeBar(markMode, tally) {
  return `<div class="i1-modebar">
    <button type="button" class="i1-mode-toggle" data-collection-mode-toggle aria-pressed="${markMode}">
      <span aria-hidden="true">✓</span> Mark mode
    </button>
    <span class="i1-tally${markMode ? " is-visible" : ""}">+${tally} this session</span>
  </div>
  <div class="i1-banner"${markMode ? "" : " hidden"}>
    <strong>MARK MODE ON</strong> — tap any card to catch/release it · long-press for shiny &amp; lucky · taps no longer open the dex entry
  </div>`;
}


// I1 autocomplete row: matched substring wrapped in <mark>, each half of the
// name escaped independently so the highlight tag itself can't be escaped
// away.
function suggestItem(entry, query) {
  const lowerName = entry.name.toLowerCase();
  const index = lowerName.indexOf(query.toLowerCase());
  const label = index === -1
    ? escapeHtml(entry.name)
    : `${escapeHtml(entry.name.slice(0, index))}<mark>${escapeHtml(entry.name.slice(index, index + query.length))}</mark>${escapeHtml(entry.name.slice(index + query.length))}`;
  return `<li class="i1-suggest-item" role="option" data-collection-suggest-form-id="${escapeHtml(entry.formId)}"><span>${label}</span><span class="i1-suggest-dex">#${entry.dex}</span></li>`;
}


// Real [data-collection-search] field (matches name/dex/region, unchanged)
// plus the new autocomplete dropdown underneath it (name-only, ≤6 rows —
// see collectionSuggestions()). suggestOpen defaults open whenever there are
// matches; app.js can force it closed (blur, Escape, a suggestion just
// picked) via collectionSuggestOpen: false without touching the query.
function searchBlock(query, forms, suggestOpen) {
  const suggestions = collectionSuggestions(forms, query);
  const showSuggestions = suggestOpen !== false && suggestions.length > 0;
  return `<div class="i1-search-wrap">
    <label class="roster-search">Search any Pokémon, dex #, or region
      <input type="search" data-collection-search value="${escapeHtml(query)}" autocomplete="off" inputmode="search" enterkeyhint="search" role="combobox" aria-expanded="${showSuggestions}" aria-controls="collection-suggest" aria-autocomplete="list">
    </label>
    <ul class="i1-suggest" id="collection-suggest" role="listbox" aria-label="Name suggestions"${showSuggestions ? "" : " hidden"}>${suggestions.map((entry) => suggestItem(entry, query.trim())).join("")}</ul>
  </div>`;
}


// router.js redirects bare #dex here and the guide card calls this grid "that
// index", but it shipped 946 cells with zero anchors and no click handler — the
// search dropdown was the only way into a dex entry anywhere in the app. The
// name carries the link rather than the whole cell: .collection-card is the
// <li>'s own display:grid box, so wrapping the contents in an anchor would
// collapse every cell's internal layout into one inline run. Mark mode reuses
// this same anchor-bearing markup unmodified: app.js's existing delegated
// root click handler gets an early branch for ui.markMode (event.preventDefault
// + toggle) ahead of route dispatch, rather than a second per-card listener —
// data-form-id (already on the <li>) is all that early branch needs.
function dexCard(row, forms) {
  const badges = shinyLuckyBadges(row);
  const classes = ["collection-card", "i1-card", row.caught ? "is-caught" : "is-missing"];
  if (row.exiting) classes.push("card-exit");
  return `<li class="${classes.join(" ")}" data-form-id="${escapeHtml(row.formId)}">
    ${spriteHtml(row.formId, forms, row.name, row.primaryType)}
    <span class="collection-card-dex">#${row.dex}</span>
    <strong class="collection-card-name"><a href="./#dex/${encodeURIComponent(row.formId)}" data-route="dex">${escapeHtml(row.name)}</a></strong>
    <span class="collection-card-status">${row.caught ? "Caught" : "Missing"}</span>
    <span class="i1-badges">${badges}</span>
  </li>`;
}


function sheetMarkButton(mark, label, pressed) {
  return `<button type="button" data-collection-sheet-mark="${mark}" aria-pressed="${pressed}">${label}</button>`;
}


// I1 long-press mini-sheet: Caught/Shiny/Lucky for one species. Render-only —
// app.js opens it on a ~500ms pointerdown hold over a card (mark mode only),
// tracks which formId is open (collectionSheetFormId), and applies
// nextMarkState() (collection.js) on a [data-collection-sheet-mark] tap.
// Hidden entirely (returns "") when no sheet is open, matching the rest of
// this view's honest-empty convention.
//
// §5 accent hook (not rendered here — it's transient, same shape as
// .sprite.just-caught): when a [data-collection-sheet-mark="shiny"] tap
// turns shiny on, app.js should add .i1-shiny-flash to that card's .sprite
// after the next render and let the one-shot CSS animation clear it, never
// replaying on a re-render that finds it already shiny.
//
// Species-level, not form-level: the card this sheet was long-pressed from
// renders its caught/shiny/lucky state at the species level (any owned form
// counts, see collection.js's speciesIsCaught/speciesIsFlagged) — reading
// this formId's own flags here would let the sheet disagree with the card
// whenever the owned form isn't the species' representative form (e.g. only
// an alt/costume form is marked).
function collectionSheet(formId, forms, roster) {
  const form = formId ? forms?.[formId] : null;
  if (!form) return "";
  const { caught, isShiny, isLucky } = speciesMarkState(formId, forms, roster);
  return `<div class="i1-sheet-backdrop" data-collection-sheet-backdrop data-collection-sheet-form-id="${escapeHtml(formId)}">
    <div class="i1-sheet" role="dialog" aria-modal="true" aria-labelledby="collection-sheet-title">
      <p class="i1-sheet-eyebrow">#${form.dex}</p>
      <h3 id="collection-sheet-title">${escapeHtml(form.name)}</h3>
      <div class="i1-sheet-options">
        ${sheetMarkButton("caught", "✓ Caught", caught)}
        ${sheetMarkButton("shiny", "✨ Shiny", isShiny)}
        ${sheetMarkButton("lucky", "🍀 Lucky", isLucky)}
      </div>
      <button type="button" class="i1-sheet-close" data-action="close-collection-sheet">Close</button>
    </div>
  </div>`;
}


// Progress readouts (overall + per-generation), I1 grid mark mode (toggle,
// banner, tally, search+autocomplete, long-press sheet), and a filterable,
// missing-first living-dex grid. Tracks only what the user has marked — no
// shiny-availability claims (see collection.js honesty note).
export function renderCollectionView(data = {}) {
  const forms = data.forms ?? {};
  const roster = data.roster ?? {};
  const query = String(data.collectionQuery ?? "");
  const filter = FILTERS.some((entry) => entry.id === data.collectionFilter) ? data.collectionFilter : "all";
  const markMode = Boolean(data.collectionMarkMode);
  const tally = Number.isInteger(data.collectionMarkTally) ? data.collectionMarkTally : 0;
  const progress = collectionProgress(forms, roster);
  const rows = livingDexRows(forms, roster, { query, filter, exitingFormIds: data.collectionExitingFormIds });

  return `<section class="collection-view" data-more-list-view="collection" aria-labelledby="collection-title">
    <a class="safe-escape" href="./#more" data-route="more" data-view="">Back to More</a>
    <p class="status-kicker">Collection guide</p>
    <h2 id="collection-title">Living Dex Collection</h2>
    <p>Tracks only what you've marked owned, shiny, or lucky on this device — there's no shiny-odds or availability data here.</p>
    ${modeBar(markMode, tally)}
    <div class="i1-overall-head">
      ${completionRing(progress.overall.caught, progress.overall.total)}
      <p class="collection-overall"><strong>${progress.overall.caught}/${progress.overall.total} caught</strong> · ${progress.overall.shiny} shiny · ${progress.overall.lucky} lucky</p>
    </div>
    <ul class="collection-progress-list">${progress.byGeneration.map(progressLine).join("")}</ul>
    ${searchBlock(query, forms, data.collectionSuggestOpen)}
    <div class="app-actions" role="group" aria-label="Collection filter">
      ${FILTERS.map((entry) => `<button type="button" data-collection-filter="${entry.id}" aria-pressed="${entry.id === filter}">${entry.label}</button>`).join("")}
    </div>
    <p class="collection-count">${rows.length} ${rows.length === 1 ? "entry" : "entries"} · missing shown first</p>
    <ul class="collection-grid">${rows.length ? rows.map((row) => dexCard(row, forms)).join("") : '<li class="gym-empty">Nothing matches this search/filter.</li>'}</ul>
    ${collectionSheet(data.collectionSheetFormId, forms, roster)}
  </section>`;
}
