import { escapeHtml } from "./home.js";
import { moveRoleLabel, ownedMoveUsers } from "../moves.js";


export function displayMoveName(moveId) {
  return String(moveId ?? "Unknown move").toLowerCase().split("_")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}


// One shared renderer for "move name + optional Elite TM badge" — this used
// to be reimplemented per view (app.js, pvp.js, gyms.js, more.js all had
// their own copy). Wrapping the name in a button wires the move sheet up
// everywhere at once via the existing app-root click delegation.
export function moveLink(moveId, { elite = false, kind = "Fast" } = {}) {
  if (!moveId) return "";
  return `<button type="button" class="move-link" data-move-id="${escapeHtml(moveId)}">${escapeHtml(displayMoveName(moveId))}</button>${elite ? ` <small class="elite-tm">Elite ${escapeHtml(kind)} TM</small>` : ""}`;
}


export function renderMoveSheet({ moveId, catalog = {}, moveIndex, roster = {}, forms = {} } = {}) {
  const entry = catalog?.[moveId];
  const type = entry?.moveType ?? "Unknown";
  const slot = entry?.slot === "charged" ? "Charged" : "Fast";
  const role = moveRoleLabel(entry);
  const users = moveIndex
    ? [...new Map(ownedMoveUsers(moveId, moveIndex, roster.ownedFormIds ?? [])
      .map((use) => [use.formId, forms?.[use.formId]?.name ?? use.pokemon])).values()]
    : [];
  return `<div class="move-sheet-backdrop" data-move-sheet-backdrop>
    <div class="move-sheet" role="dialog" aria-modal="true" aria-labelledby="move-sheet-title">
      <button type="button" class="move-sheet-close" data-action="close-move-sheet" aria-label="Close">✕</button>
      <p class="type-chip" data-type="${escapeHtml(type)}">${escapeHtml(type)}</p>
      <h2 id="move-sheet-title">${escapeHtml(displayMoveName(moveId))}</h2>
      <p class="status-kicker">${escapeHtml(slot)} move</p>
      <p>${escapeHtml(role)}</p>
      <h3>Your Pokémon that use it well</h3>
      ${users.length
        ? `<ul class="move-sheet-users">${users.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`
        : "<p>None of your starred Pokémon use this move in the optimal raid or PvP data yet.</p>"}
    </div>
  </div>`;
}
