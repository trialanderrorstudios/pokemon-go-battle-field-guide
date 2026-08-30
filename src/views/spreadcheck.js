// Spread Checker view — species picker (compare.js's own search-by-name
// picker pattern: data-*-query input, result cards) plus three IV selects
// and a stacked-line result readout (event-evolve-advisor.js's own
// "ev-adv-rank-line" per-role-line pattern). checkSpread (../spread-checker.js)
// does all the data work; this file only renders its output. See this file's
// WIRING CONTRACT (bottom) for the coordinator-side state/dispatch this view
// expects.
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { searchOpponentForms } from "../swap.js";

const RESULT_CAP = 40;
const LEAGUE_LABEL = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });
const IV_FIELDS = Object.freeze([["atk", "Attack"], ["def", "Defense"], ["sta", "Stamina"]]);

function resultsHtml(query, forms) {
  const results = searchOpponentForms(query, forms).slice(0, RESULT_CAP);
  if (!results.length) {
    return query ? `<p class="pvp-empty">No Pokémon match that search — check the spelling or try just the first few letters.</p>` : "";
  }
  const cards = results.map((form) => `<button type="button" class="fallback-section swap-opponent-card" data-action="spreadcheck-pick" data-spreadcheck-form-id="${escapeHtml(form.form_id)}">
    ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
    <span>${escapeHtml(form.name)}</span>
  </button>`).join("");
  const more = results.length === RESULT_CAP ? "<p>Keep typing to narrow the list.</p>" : "";
  return `${more}<div class="home-task-grid swap-opponent-grid">${cards}</div>`;
}

function pickerHtml(form, query, forms) {
  if (form) {
    return `<div class="spreadcheck-picker fallback-section">
      ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
      <span>${escapeHtml(form.name)}</span>
      <button type="button" data-action="spreadcheck-pick" data-spreadcheck-form-id="">Change</button>
    </div>`;
  }
  return `<div class="spreadcheck-picker">
    <label class="swap-search">Pick a species
      <input type="search" data-spreadcheck-query value="${escapeHtml(query ?? "")}" placeholder="Search by name" autocomplete="off">
    </label>
    ${resultsHtml(query, forms)}
  </div>`;
}

function ivSelectHtml(stat, label, value) {
  const options = [];
  for (let iv = 0; iv <= 15; iv += 1) options.push(`<option value="${iv}"${iv === value ? " selected" : ""}>${iv}</option>`);
  return `<label class="spreadcheck-iv-field">${escapeHtml(label)}
    <select data-spreadcheck-iv="${stat}">${options.join("")}</select>
  </label>`;
}

function ivFormHtml(ivs) {
  const fields = IV_FIELDS.map(([stat, label]) => ivSelectHtml(stat, label, ivs?.[stat] ?? 0)).join("");
  return `<div class="spreadcheck-ivs">${fields}</div>`;
}

function leagueLineHtml(entry) {
  if (!entry.eligible) {
    return `<p class="ev-adv-rank-line is-pvp">${escapeHtml(LEAGUE_LABEL[entry.league])}: ${escapeHtml(entry.reason)}</p>`;
  }
  const buddy = entry.bestBuddyRequired ? " (Best Buddy)" : "";
  return `<p class="ev-adv-rank-line is-pvp">${escapeHtml(`${LEAGUE_LABEL[entry.league]}: #${entry.rank} of ${entry.total} · ${entry.percentile}th percentile — CP ${entry.cp} @ L${entry.level}${buddy}`)}</p>`;
}

function speciesContextLineHtml(league, row) {
  if (!row) return "";
  return `<p class="ev-adv-rank-line is-pvp">${escapeHtml(`${LEAGUE_LABEL[league]} species rank: #${row.rank}`)}</p>`;
}

function raidRoleLineHtml(role) {
  return `<p class="ev-adv-rank-line is-raid">${escapeHtml(`${role.shadow ? "Shadow " : ""}${role.attackingType} raids: #${role.rank}${role.tier ? ` (${role.tier} tier)` : ""}`)}</p>`;
}

function gymRankLineHtml(gymRank) {
  if (!gymRank) return "";
  return `<p class="ev-adv-rank-line is-gym">${escapeHtml(`Gym defense: #${gymRank.rank} of ${gymRank.of}${gymRank.tier ? ` (${gymRank.tier} tier)` : ""}`)}</p>`;
}

// One evaluated form's full result block (leagues + species context + raid
// roles + gym rank + verdict). Shared by the primary block and, for a
// branching evolution family, each "As <Name>" sub-block below it.
function resultBlockHtml(evaluated) {
  const leagueLines = evaluated.leagues.map((entry) => `${leagueLineHtml(entry)}${speciesContextLineHtml(entry.league, evaluated.speciesContext[entry.league])}`).join("");
  const raidLines = evaluated.raidRoles.map(raidRoleLineHtml).join("");
  const gymLine = gymRankLineHtml(evaluated.gymRank);
  return `<div class="spreadcheck-result-block">
    ${leagueLines}
    ${raidLines}
    ${gymLine}
    <p class="spreadcheck-verdict">${escapeHtml(evaluated.verdict)}</p>
  </div>`;
}

function evolutionNoteHtml(result) {
  if (result.primary !== "evolution") return "";
  return `<p class="spreadcheck-evolution-note">As ${escapeHtml(result.asName)} — its final evolution, since IVs carry through evolution.</p>`;
}

function branchesHtml(result) {
  if (result.primary !== "branches") return "";
  return result.evolutions.map((evo) => `<h4>As ${escapeHtml(evo.name)}</h4>${resultBlockHtml(evo)}`).join("");
}

function resultHtml(result) {
  if (!result) return "";
  return `<div class="spreadcheck-results">
    ${evolutionNoteHtml(result)}
    ${resultBlockHtml(result)}
    ${branchesHtml(result)}
  </div>`;
}

// renderSpreadCheckView({state, result, forms}) — state is the coordinator's
// ui state ({formId, query, ivs: {atk, def, sta}} — see this file's WIRING
// CONTRACT below); result is checkSpread()'s return value (null before a
// species is picked).
export function renderSpreadCheckView({ state = {}, result = null, forms = {} }) {
  const form = forms[state.formId] ?? null;
  const guidance = !form ? "<p>Pick a species to check its spread.</p>" : "";
  return `<section class="spreadcheck-view" aria-labelledby="spreadcheck-title">
    <h2 id="spreadcheck-title">Spread Checker</h2>
    ${pickerHtml(form, state.query, forms)}
    ${form ? ivFormHtml(state.ivs ?? {}) : ""}
    ${guidance}
    ${resultHtml(result)}
  </section>`;
}

// --- WIRING CONTRACT (app.js/router.js/views/more.js — coordinator-only,
// out of this lane's allowlist) ---
//
// Route: add "spreadcheck" to router.js's ROUTE_VIEWS.more array (same
// sub-view family as "compare"), reachable at #more/spreadcheck.
//
// Menu label: add an entry to views/more.js's MORE_LIST entries near the
// existing `["./#more/compare", "Compare — two Pokémon head-to-head"]` row,
// e.g. `["./#more/spreadcheck", "Spread Checker — pick a species, set IVs, get the verdict"]`.
//
// UI state shape (app.js's `ui` object, alongside `ui.compare`):
//   ui.spreadcheck = { formId: null, query: "", ivs: { atk: 0, def: 0, sta: 0 } }
//
// View dispatch (views/more.js, mirroring its `if (view === "compare")`
// block):
//   if (view === "spreadcheck") {
//     const sel = data.spreadcheckSelection ?? {};
//     const result = sel.formId
//       ? checkSpread({
//           formId: sel.formId, ivs: sel.ivs, forms: data.forms,
//           pvp: data.pvp, raids: data.raids, gym: data.gym,
//         })
//       : null;
//     return `<div class="more-view">${BACK_TO_MORE}${renderSpreadCheckView({ state: sel, result, forms: data.forms })}</div>`;
//   }
//   (checkSpread import from "../spread-checker.js"; pass `data.compareSelection`'s
//   sibling `data.spreadcheckSelection: ui.spreadcheck` alongside the existing
//   `compareSelection: ui.compare` in whatever object assembles `data` for
//   renderMore — mirrors the exact compareSelection wiring already there.)
//
// Dispatch handlers needed (app.js's action switch, mirroring compare-pick/
// the compare-query input handler):
//   action "spreadcheck-pick": side-less version of "compare-pick" —
//     ui.spreadcheck.formId = actionEl.dataset.spreadcheckFormId || null;
//     if (!formId) ui.spreadcheck.query = ""; rerenderCurrent().
//   input[data-spreadcheck-query]: same pattern as the existing
//     `[data-compare-query]` handler (cursor-position preservation included) —
//     ui.spreadcheck.query = String(event.target.value ?? "").slice(0, 60);
//     rerenderCurrent(), then restore focus/selection on
//     `[data-spreadcheck-query]`.
//   change on select[data-spreadcheck-iv]: stat = select.dataset.spreadcheckIv
//     ("atk"|"def"|"sta"); ui.spreadcheck.ivs[stat] = Number(select.value);
//     rerenderCurrent().
