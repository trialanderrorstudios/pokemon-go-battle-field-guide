// Compare view — two pickers + a head-to-head result, reusing the exact
// search-by-name picker pattern swap.js's opponentStep already ships
// (data-*-query input, result cards) and the two-column raid-lanes layout
// raids.js's counter lanes use (stacked on phone, side-by-side at 42rem —
// app.css, no new CSS needed here). compareForms (../compare.js) does all
// the data work; this file only renders its output.
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { searchOpponentForms } from "../swap.js";

const RESULT_CAP = 40;

function pickedCardHtml(side, form, forms) {
  return `<div class="fallback-section compare-picked">
    ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
    <span>${escapeHtml(form.name)}</span>
    <button type="button" data-action="compare-pick" data-compare-side="${side}" data-compare-form-id="">Change</button>
  </div>`;
}

function resultsHtml(side, query, forms) {
  const results = searchOpponentForms(query, forms).slice(0, RESULT_CAP);
  if (!results.length) {
    return query ? `<p class="pvp-empty">No Pokémon match that search — check the spelling or try just the first few letters.</p>` : "";
  }
  const cards = results.map((form) => `<button type="button" class="fallback-section swap-opponent-card" data-action="compare-pick" data-compare-side="${side}" data-compare-form-id="${escapeHtml(form.form_id)}">
    ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
    <span>${escapeHtml(form.name)}</span>
  </button>`).join("");
  const more = results.length === RESULT_CAP ? "<p>Keep typing to narrow the list.</p>" : "";
  return `${more}<div class="home-task-grid swap-opponent-grid">${cards}</div>`;
}

function pickerHtml(side, label, form, query, forms) {
  if (form) return `<div class="compare-picker">${pickedCardHtml(side, form, forms)}</div>`;
  return `<div class="compare-picker">
    <label class="swap-search">${escapeHtml(label)}
      <input type="search" data-compare-query="${side}" value="${escapeHtml(query ?? "")}" placeholder="Search by name" autocomplete="off">
    </label>
    ${resultsHtml(side, query, forms)}
  </div>`;
}

// comparison is only populated once both sides are picked, so the
// zero/one-picked states are read straight off the resolved formA/formB
// (not comparison) — otherwise a one-picked state with comparison still
// null would fall through to the generic "pick two" guidance below.
function guidanceHtml(comparison, formA, formB) {
  if (comparison?.selfCompare) return "<p>Pick two different Pokémon to compare.</p>";
  if (!formA || !formB) {
    return formA || formB
      ? "<p>Pick a second Pokémon to compare.</p>"
      : "<p>Pick two Pokémon to compare head-to-head.</p>";
  }
  return "";
}

function rowsHtml(comparison) {
  const listFor = (side) => comparison.rows.map((row) => `<li class="raid-card${row[side].winner ? " is-owned" : ""}"><b>${escapeHtml(row.label)}:</b> ${escapeHtml(row[side].text)}</li>`).join("");
  return `<div class="raid-lanes compare-lanes">
    <div class="raid-lane">
      <h3>${escapeHtml(comparison.a.form.name)}</h3>
      <ul class="raid-card-list">${listFor("a")}</ul>
    </div>
    <div class="raid-lane">
      <h3>${escapeHtml(comparison.b.form.name)}</h3>
      <ul class="raid-card-list">${listFor("b")}</ul>
    </div>
  </div>`;
}

// renderCompareView({ comparison, forms, selection }) — comparison is
// compareForms()'s return value (or null/undefined before both sides are
// picked); selection is the coordinator's ui state: { formIdA, formIdB,
// queryA, queryB } (see this file's WIRING CONTRACT for the full shape).
export function renderCompareView({ comparison, forms = {}, selection = {} }) {
  // Falls back to a direct forms[] lookup by selected id so a one-picked
  // state renders its picked card even when the coordinator only calls
  // compareForms (and thus only populates `comparison`) once both sides
  // are set — see this file's fix note in the WIRING CONTRACT below.
  const formA = comparison?.a?.form ?? forms[selection.formIdA] ?? null;
  const formB = comparison?.b?.form ?? forms[selection.formIdB] ?? null;
  const pickers = `<div class="raid-lanes compare-pickers">
    ${pickerHtml("a", "Pokémon A", formA, selection.queryA, forms)}
    ${pickerHtml("b", "Pokémon B", formB, selection.queryB, forms)}
  </div>`;
  const body = comparison && !comparison.selfCompare && formA && formB
    ? rowsHtml(comparison)
    : guidanceHtml(comparison, formA, formB);
  return `<section class="compare-view" aria-labelledby="compare-title">
    <h2 id="compare-title">Compare</h2>
    ${pickers}
    ${body}
  </section>`;
}
