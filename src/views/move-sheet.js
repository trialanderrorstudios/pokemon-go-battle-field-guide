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
//
// availabilityClass (standard/communityDayClassic/eliteOnly/eventOnly, from
// a form's move_availability map — see assemble.py) is the exact-class path:
// pass it and the right badge falls out, no caller-side elite/eventOnly
// bookkeeping needed. communityDayClassic gets no badge (obtainable by any
// player, same as standard) — it's a prose distinction (dex.js's
// eliteMoveLabel), not a cost-badge one. The plain `elite` boolean stays for
// callers that don't have a resolved class (e.g. a generic "this form has
// SOME elite move" check) and never invents a class the data doesn't have.
export function moveLink(moveId, { elite = false, kind = "Fast", availabilityClass } = {}) {
  if (!moveId) return "";
  const isElite = availabilityClass ? availabilityClass === "eliteOnly" : elite;
  const isEventOnly = availabilityClass === "eventOnly";
  const badge = isEventOnly
    ? ` <small class="elite-tm">Event-only move</small>`
    : isElite
      ? ` <small class="elite-tm">Elite ${escapeHtml(kind)} TM</small>`
      : "";
  return `<button type="button" class="move-link" data-move-id="${escapeHtml(moveId)}">${escapeHtml(displayMoveName(moveId))}</button>${badge}`;
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
