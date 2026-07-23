// Trade & Dex Gap: export/import a compact dex summary (trade-share.js) and
// compare against saved friends to find trade-night candidates. Honest
// scope: comparisons only ever reflect each friend's last pasted summary, so
// every friend row is dated with when that paste was imported.
import { escapeHtml } from "./home.js";

function formatImportedAt(iso) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) return "unknown date";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function friendRow(friend, selectedId) {
  const selected = friend.id === selectedId;
  return `<li class="instance-row" data-friend-id="${escapeHtml(friend.id)}">
    <div>
      <h4>${escapeHtml(friend.name)}</h4>
      <p>${friend.owned.length} species owned · imported ${escapeHtml(formatImportedAt(friend.importedAt))}</p>
    </div>
    <div class="instance-row-actions">
      <button type="button" data-action="trade-select-friend" data-trade-friend-id="${escapeHtml(friend.id)}" aria-pressed="${selected}">${selected ? "Viewing" : "Compare"}</button>
      <button type="button" data-action="trade-remove-friend" data-trade-friend-id="${escapeHtml(friend.id)}">Delete</button>
    </div>
  </li>`;
}

function gapCard(row) {
  return `<li class="collection-card" data-dex="${row.dex}">
    <span class="collection-card-dex">#${row.dex}</span>
    <strong class="collection-card-name">${escapeHtml(row.name)}</strong>
  </li>`;
}

function gapSection(title, rows, emptyText) {
  return `<section class="more-section" aria-labelledby="trades-${escapeHtml(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}-title">
    <h3 id="trades-${escapeHtml(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}-title">${escapeHtml(title)} (${rows.length})</h3>
    ${rows.length ? `<ul class="more-card-list collection-grid">${rows.map(gapCard).join("")}</ul>` : `<p class="pvp-empty">${escapeHtml(emptyText)}</p>`}
  </section>`;
}

function comparisonSection(comparison) {
  if (!comparison) return "";
  return `<section class="more-section" aria-labelledby="trades-compare-title">
    <p class="status-kicker">Comparing with ${escapeHtml(comparison.friendName)} · their dex summary from ${escapeHtml(formatImportedAt(comparison.friendImportedAt))}</p>
    <h2 id="trades-compare-title">Trade-night candidates</h2>
    <p>These lists come only from ${escapeHtml(comparison.friendName)}'s last pasted summary — nothing here is a trade-value estimate, just what each of you has told the other you own.</p>
    ${gapSection("You have, they lack", comparison.youHaveTheyLack, "Nothing found — you don't own anything they're missing (by this import).")}
    ${gapSection("They have, you lack", comparison.theyHaveYouLack, "Nothing found — you already own everything in their import.")}
  </section>`;
}

export function renderTrades(data = {}) {
  const trade = data.trade ?? {};
  const friends = data.friends ?? [];
  const exportText = data.exportText ?? "";
  return `<div class="more-view">
    <a class="safe-escape" href="./#more">Back to More</a>
    <section class="more-section" aria-labelledby="trades-title">
      <p class="status-kicker">Trade &amp; Dex Gap</p>
      <h2 id="trades-title">Trade &amp; Dex Gap</h2>
      <p>Compares dex summaries only — which species each of you owns, plus shiny/lucky flags. Never exact roster detail (no CP, IV, moves, or catch dates), so this is small enough to paste and can't leak your instance-level roster.</p>
    </section>
    <section class="more-section" aria-labelledby="trades-export-title">
      <h3 id="trades-export-title">Share your dex summary</h3>
      <label class="defense-log-player-name">Your name (shown to whoever you send this to)
        <input type="text" maxlength="40" data-trade-name value="${escapeHtml(trade.name ?? "")}">
      </label>
      <button type="button" data-action="trade-toggle-export" aria-expanded="${Boolean(trade.exportOpen)}">${trade.exportOpen ? "Hide my dex summary" : "Show my dex summary"}</button>
      ${trade.exportOpen ? `
      <pre class="roster-share-text">${escapeHtml(exportText)}</pre>
      <button type="button" data-action="trade-copy-export">Copy to clipboard</button>
      <p class="roster-share-privacy">Only the species-owned/shiny/lucky set above is shared — this stays on your device until you copy or send it yourself.</p>` : ""}
    </section>
    <section class="more-section" aria-labelledby="trades-import-title">
      <h3 id="trades-import-title">Import a friend's dex summary</h3>
      <label>Paste a friend's dex summary text<textarea rows="4" data-trade-import-text>${escapeHtml(trade.importText ?? "")}</textarea></label>
      <button type="button" data-action="trade-import">Import</button>
      ${trade.message ? `<p class="triage-copy-status" role="status">${escapeHtml(trade.message)}</p>` : ""}
    </section>
    <section class="more-section" aria-labelledby="trades-friends-title">
      <h3 id="trades-friends-title">Friends (${friends.length})</h3>
      ${friends.length
        ? `<ul class="instance-list">${friends.map((friend) => friendRow(friend, trade.selectedFriendId)).join("")}</ul>`
        : `<p class="pvp-empty">No friends imported yet.</p>`}
    </section>
    ${comparisonSection(data.comparison)}
  </div>`;
}
