// Dupe Advisor view — "which of my duplicate copies of this species should I
// keep?" Props in, HTML out: dupeGroups() (dupe-advisor.js) does all the
// scoring/ranking, this file only renders its result. Per-instance Remove
// reuses the existing app-root data-delete-instance-id delegation (already
// wired with a confirm) — no new dispatch wiring here.
import { escapeHtml } from "./home.js";
import { displayMoveName } from "./move-sheet.js";
import { spriteHtml } from "../sprites.js";
import { dupeGroups } from "../dupe-advisor.js";

function movesLine(instance) {
  if (!instance.fastMove) return `<span class="dupe-moves-missing">Moves not set</span>`;
  const charged = (instance.chargedMoves ?? []).map((move) => escapeHtml(displayMoveName(move))).join(" / ");
  return `${escapeHtml(displayMoveName(instance.fastMove))} + ${charged}`;
}

function badges(instance) {
  const chips = [];
  if (instance.isShiny) chips.push(`<span class="chip">Shiny</span>`);
  if (instance.isLucky) chips.push(`<span class="chip">Lucky</span>`);
  if (instance.sizeClass) chips.push(`<span class="chip">${escapeHtml(instance.sizeClass.toUpperCase())}</span>`);
  if (instance.buddyLevel) chips.push(`<span class="chip">${escapeHtml(instance.buddyLevel)} buddy</span>`);
  return chips.join("");
}

function instanceRowHtml(row, form) {
  const { instance, verdict } = row;
  const name = escapeHtml(instance.nickname || form?.name || "Unknown");
  return `<li class="dupe-instance-row" data-keep="${verdict.keep}">
    ${form ? spriteHtml(form.form_id, { [form.form_id]: form }, form.name, form.primary_type) : ""}
    <div class="dupe-instance-body">
      <h4>${name}</h4>
      <p>CP ${escapeHtml(instance.cp)} · ${escapeHtml(instance.ivs.atk)}/${escapeHtml(instance.ivs.def)}/${escapeHtml(instance.ivs.sta)} IV</p>
      <p>${movesLine(instance)}</p>
      <p class="dupe-badges">${badges(instance)}</p>
      <p class="dupe-verdict-chip" data-keep="${verdict.keep}">${verdict.keep ? "Keep" : "Transfer"}</p>
      <p class="dupe-verdict-why">${escapeHtml(verdict.why)}</p>
      <button type="button" class="instance-remove-btn" data-delete-instance-id="${escapeHtml(instance.id)}">Remove</button>
    </div>
  </li>`;
}

function groupHtml(group) {
  const name = group.form?.name ?? group.formId;
  return `<li class="dupe-group">
    <h3>${escapeHtml(name)} <span class="dupe-group-count">${group.instances.length} copies</span></h3>
    <ul class="dupe-instance-list">${group.instances.map((row) => instanceRowHtml(row, group.form)).join("")}</ul>
  </li>`;
}

// renderDupesView({ roster, forms, optimalMoves }) -> HTML. optimalMoves is
// the optional precomputed-moveset signal dupeGroups() accepts — see
// dupe-advisor.js's module doc for why this view never computes it itself.
export function renderDupesView({ roster = {}, forms = {}, optimalMoves = {} } = {}) {
  const groups = dupeGroups({ roster, forms, optimalMoves });
  if (!groups.length) {
    return `<section class="dupes-view" aria-labelledby="dupes-title">
      <p class="status-kicker">Duplicate Advisor</p><h2 id="dupes-title">Dupe Advisor</h2>
      <div class="dupes-empty card"><p>No duplicates recorded — every species in your roster has just one copy.</p></div>
    </section>`;
  }
  return `<section class="dupes-view" aria-labelledby="dupes-title">
    <p class="status-kicker">Duplicate Advisor</p><h2 id="dupes-title">Dupe Advisor</h2>
    <ul class="dupe-group-list">${groups.map(groupHtml).join("")}</ul>
  </section>`;
}
