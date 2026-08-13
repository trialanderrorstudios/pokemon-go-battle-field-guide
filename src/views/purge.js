// Purge string builder view — renders purge-string.js's conservative
// keep/transfer plan plus copy-paste in-game search strings. Pure render:
// no route/menu/dispatch wiring here (see purge-string.js's own header for
// why "transfer candidate" only ever means an unflagged extra star-only
// copy, never a detailed instance).
import { buildPurgePlan } from "../purge-string.js";
import { escapeHtml } from "./home.js";

function keepRow(row) {
  const label = row.kind === "instance" && row.count === undefined
    ? row.name
    : row.count && row.count !== 1
      ? `${row.name} ×${row.count}`
      : row.name;
  return `<li class="instance-row"><h4>${escapeHtml(label)}</h4><p>${escapeHtml(row.reason)}</p></li>`;
}

function transferSummary(transfers) {
  if (!transfers.length) {
    return `<p class="gym-empty">No unflagged extra copies found — nothing here is being suggested for transfer right now.</p>`;
  }
  const totalCopies = transfers.reduce((sum, row) => sum + row.count, 0);
  return `<p>${totalCopies} extra cop${totalCopies === 1 ? "y" : "ies"} across ${transfers.length} species ${transfers.length === 1 ? "is" : "are"} transfer candidates:</p>
    <ul class="instance-list">${transfers.map((row) => `<li class="instance-row"><h4>${escapeHtml(row.name)}</h4><p>${escapeHtml(row.reason)}</p></li>`).join("")}</ul>`;
}

function searchChunkHtml(chunk, index, total) {
  return `<div class="ocr-row-raw">
    <button type="button" class="ocr-row-copy-raw" data-action="purge-copy-chunk" data-purge-chunk-index="${index}" data-purge-chunk="${escapeHtml(chunk)}">Copy search string ${index + 1} of ${total}</button>
    <pre>${escapeHtml(chunk)}</pre>
  </div>`;
}

export function renderPurgeView({ roster = {}, forms = {} } = {}) {
  const hasRoster = (roster.instances?.length ?? 0) > 0 || (roster.ownedFormIds?.length ?? 0) > 0;
  if (!hasRoster) {
    return `<section class="purge-view" aria-labelledby="purge-view-title">
      <p class="status-kicker">Purge string builder</p>
      <h2 id="purge-view-title">Bulk-transfer helper</h2>
      <p class="gym-empty">No roster recorded yet — add Pokémon on the Dex or My Roster page first, then come back here for a transfer plan.</p>
    </section>`;
  }

  const { keeps, transfers, searchStrings, unmappableNames } = buildPurgePlan({ roster, forms });

  return `<section class="purge-view" aria-labelledby="purge-view-title">
    <p class="status-kicker">Purge string builder</p>
    <h2 id="purge-view-title">Bulk-transfer helper</h2>
    <p>These are suggestions from what this app knows about your roster — review each one in-game before transferring. Transfers are irreversible.</p>

    <h3>Transfer candidates</h3>
    ${transferSummary(transfers)}

    ${searchStrings.length ? `<h3>Search strings</h3>
    <p>Paste one chunk at a time into the in-game search field. The search surfaces EVERY copy matching these species names — including the one copy per species this plan keeps, plus any shadow or special copies sharing the name, and names that contain these as a prefix. Transfer only the extras; keep anything shiny, lucky, favorited, or high-IV.</p>
    ${searchStrings.map((chunk, index) => searchChunkHtml(chunk, index, searchStrings.length)).join("")}` : ""}
    ${unmappableNames.length ? `<p class="gym-empty">${unmappableNames.length} candidate${unmappableNames.length === 1 ? "" : "s"} — ${unmappableNames.map((name) => escapeHtml(name)).join(", ")} — ha${unmappableNames.length === 1 ? "s" : "ve"} no verified in-game search name and ${unmappableNames.length === 1 ? "is" : "are"} not in the strings above. Find ${unmappableNames.length === 1 ? "it" : "them"} manually.</p>` : ""}

    <h3>Kept, with reasons</h3>
    <ul class="instance-list">${keeps.map(keepRow).join("")}</ul>
  </section>`;
}
