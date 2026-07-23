import { escapeHtml, shinyLuckyBadges } from "./home.js";
import { displayMoveName } from "./move-sheet.js";
import { instanceLevel, legalMoves } from "../instances.js";
import { instanceCardData } from "../share-card.js";


function ivInput(label, key, value) {
  return `<label class="instance-iv-input">${escapeHtml(label)}
    <input type="number" inputmode="numeric" min="0" max="15" step="1" data-instance-iv="${key}" value="${escapeHtml(value ?? "")}">
  </label>`;
}


function moveChip(moveId, selected, dataAttr) {
  return `<button type="button" class="move-chip${selected ? " is-selected" : ""}" aria-pressed="${selected}" data-${dataAttr}="${escapeHtml(moveId)}">${escapeHtml(displayMoveName(moveId))}</button>`;
}


// Lightweight "I changed this one" inline row: just a CP field, no moves —
// so a moveless Poke Genie import can be corrected without also picking
// moves. Composes reviseInstanceCp()'s CPM/IV re-validation (see instances.js).
function quickCpRow(instance, quickCp) {
  return `<div class="instance-quick-cp">
    <label class="instance-cp-input">New CP after power-up/level-up/trade
      <input type="number" inputmode="numeric" min="1" step="1" data-quick-cp-input value="${escapeHtml(quickCp.value ?? "")}">
    </label>
    ${quickCp.error ? `<p class="instance-sheet-error" role="alert">${escapeHtml(quickCp.error)}</p>` : ""}
    <div class="instance-sheet-actions">
      <button type="button" data-action="cancel-quick-cp">Cancel</button>
      <button type="button" data-action="save-quick-cp">Save CP</button>
    </div>
  </div>`;
}


function instanceRow(instance, form, quickCp) {
  const level = instanceLevel(form, instance);
  const quickCpActive = quickCp?.instanceId === instance.id;
  const badges = shinyLuckyBadges(instance);
  const canShare = instanceCardData(instance, form) !== null;
  return `<li class="instance-row" data-instance-id="${escapeHtml(instance.id)}">
    <div>
      <h4>${escapeHtml(instance.nickname || form.name)} ${badges}</h4>
      <p>CP ${escapeHtml(instance.cp)} · ${escapeHtml(instance.ivs.atk)}/${escapeHtml(instance.ivs.def)}/${escapeHtml(instance.ivs.sta)} IV${level !== null ? ` · Level ${escapeHtml(level)}` : ""}</p>
      <p>${instance.fastMove
        ? `${escapeHtml(displayMoveName(instance.fastMove))} + ${(instance.chargedMoves ?? []).map(displayMoveName).join(" / ")}`
        : `<span class="instance-moves-missing">Moves not set — tap Edit to add them.</span>`}</p>
    </div>
    ${quickCpActive ? quickCpRow(instance, quickCp) : `<div class="instance-row-actions">
      <button type="button" data-edit-instance-id="${escapeHtml(instance.id)}">Edit</button>
      <button type="button" data-quick-cp-instance-id="${escapeHtml(instance.id)}">I changed this one</button>
      <button type="button" data-delete-instance-id="${escapeHtml(instance.id)}">Delete</button>
      ${canShare ? `<button type="button" data-share-instance-id="${escapeHtml(instance.id)}">Share card</button>` : ""}
    </div>`}
  </li>`;
}


// Manual quick-add sheet for per-copy detail (CP, IVs, moves) on top of the
// binary owned-star roster. Move pickers are chips over the form's own
// release-data fast/charged move lists — never free text.
export function renderInstanceSheet({
  form, instances = [], draft = null, error = "", focusInstanceId = null, quickCp = null, shareMessage = "",
} = {}) {
  if (!form || !draft) return "";
  const legal = legalMoves(form);
  const existing = instances.filter((instance) => (
    instance.formId === form.form_id && (!focusInstanceId || instance.id === focusInstanceId)
  ));
  const chargedSelected = new Set(draft.chargedMoves ?? []);
  return `<div class="move-sheet-backdrop" data-instance-sheet-backdrop>
    <div class="move-sheet instance-sheet" role="dialog" aria-modal="true" aria-labelledby="instance-sheet-title">
      <button type="button" class="move-sheet-close" data-action="close-instance-sheet" aria-label="Close">✕</button>
      <h2 id="instance-sheet-title">${escapeHtml(form.name)} details</h2>
      <p>Everything below stays on this device. Exact CP/IVs/moves make raid and power-up guidance precise for this specific Pokémon instead of a general assumption.</p>
      ${shareMessage ? `<p class="triage-copy-status" role="status">${escapeHtml(shareMessage)}</p>` : ""}
      ${existing.length ? `<h3>Your ${escapeHtml(form.name)}s</h3><ul class="instance-list">${existing.map((instance) => instanceRow(instance, form, quickCp)).join("")}</ul>` : ""}
      <h3>${draft.editingId ? "Edit" : "Add"} an instance</h3>
      ${error ? `<p class="instance-sheet-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <label class="instance-cp-input">CP
        <input type="number" inputmode="numeric" min="1" step="1" data-instance-cp value="${escapeHtml(draft.cp ?? "")}">
      </label>
      <p class="instance-iv-hint">IVs (0-15 each) — tap Appraise in-game to see these.</p>
      <div class="instance-iv-row">
        ${ivInput("Attack", "atk", draft.ivs?.atk)}
        ${ivInput("Defense", "def", draft.ivs?.def)}
        ${ivInput("Stamina", "sta", draft.ivs?.sta)}
      </div>
      <p>Fast move</p>
      <div class="move-chip-row" role="group" aria-label="Fast move">${legal.fastMoves.map((moveId) => moveChip(moveId, draft.fastMove === moveId, "instance-fast-move")).join("")}</div>
      <p>Charged moves (pick 1-2)</p>
      <div class="move-chip-row" role="group" aria-label="Charged moves">${legal.chargedMoves.map((moveId) => moveChip(moveId, chargedSelected.has(moveId), "instance-charged-move")).join("")}</div>
      <label class="instance-nickname-input">Nickname (optional)
        <input type="text" maxlength="60" data-instance-nickname value="${escapeHtml(draft.nickname ?? "")}">
      </label>
      <div class="app-actions" role="group" aria-label="Shiny and lucky">
        <button type="button" class="collection-flag-toggle" data-instance-shiny-toggle aria-pressed="${Boolean(draft.isShiny)}">${draft.isShiny ? "★ Shiny" : "☆ Shiny"}</button>
        <button type="button" class="collection-flag-toggle" data-instance-lucky-toggle aria-pressed="${Boolean(draft.isLucky)}">${draft.isLucky ? "🍀 Lucky" : "Lucky"}</button>
      </div>
      <div class="instance-sheet-actions">
        ${draft.editingId ? `<button type="button" data-action="cancel-edit-instance">Cancel edit</button>` : ""}
        <button type="button" data-action="save-instance">${draft.editingId ? "Save changes" : "Add instance"}</button>
      </div>
    </div>
  </div>`;
}
