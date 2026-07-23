import { escapeHtml } from "./home.js";
import { buildLeaderboard, exportPlayerLog } from "../gym-defense-log.js";
import { gymDefenseCardData } from "../share-card.js";
import { TEAM_SET } from "../storage.js";
import { formatDefenseDuration, sectionHeading, TEAM_LABELS } from "./gyms.js";


function teamBadge(team) {
  return TEAM_SET.has(team)
    ? `<span class="team-badge" data-team="${escapeHtml(team)}">${escapeHtml(TEAM_LABELS[team])}</span>`
    : "";
}


function defenseLeaderboardTable(rows) {
  if (!rows.length) {
    return `<p class="gym-empty">No defenders logged yet — drop one below to start the board.</p>`;
  }
  return `<div class="table-scroll"><table class="defense-leaderboard">
    <thead><tr><th>Player</th><th>Longest defense</th><th>Total defense time</th><th>Active now</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeHtml(row.playerName)} ${teamBadge(row.team)}</td>
      <td>${escapeHtml(formatDefenseDuration(row.longestMs))}${row.longestPokemon ? ` · ${escapeHtml(row.longestPokemon)}` : ""}</td>
      <td>${escapeHtml(formatDefenseDuration(row.totalMs))}</td>
      <td>${row.active.length}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}


function completeDefenseForm(completeDraft = {}) {
  return `<div class="defense-log-form" data-defense-log-complete-form>
    <label>Ended<input type="datetime-local" data-defense-log-complete-end value="${escapeHtml(completeDraft.endedAt ?? "")}"></label>
    <label>Coins earned (optional)<input type="number" min="0" step="1" inputmode="numeric" data-defense-log-complete-coins value="${escapeHtml(completeDraft.coins ?? "")}"></label>
    <div class="placement-controls">
      <button type="button" data-action="defense-log-complete">Save</button>
      <button type="button" data-action="defense-log-cancel-complete">Cancel</button>
    </div>
  </div>`;
}


function activeDefendersSection(rows, draft) {
  const active = rows.flatMap((row) => row.active.map((entry) => ({ ...entry, playerName: row.playerName, team: row.team })));
  if (!active.length) return `<p class="gym-empty">No defenders currently up.</p>`;
  return `<ul class="gym-card-list">${active.map((entry) => `<li class="gym-card" data-defense-entry-id="${escapeHtml(entry.id)}">
    <p class="gym-rank">${escapeHtml(entry.playerName)} ${teamBadge(entry.team)}</p>
    <p><strong>${escapeHtml(entry.pokemon)}</strong> · ${escapeHtml(entry.gymName)}</p>
    <p>Holding for ${escapeHtml(formatDefenseDuration(entry.elapsedMs))}</p>
    ${entry.isLocal ? (draft.completingId === entry.id
      ? completeDefenseForm(draft.completeDraft)
      : `<div class="placement-controls">
          <button type="button" data-action="defense-log-open-complete" data-defense-entry-id="${escapeHtml(entry.id)}">It came back</button>
          <button type="button" data-action="defense-log-delete" data-defense-entry-id="${escapeHtml(entry.id)}">Delete</button>
        </div>`) : ""}
  </li>`).join("")}</ul>`;
}


// Local-only, manual gym defense tracking (round 7, promoted to its own
// #leaderboard route later): "I dropped a defender" / "it came back"
// entries, a longest/total/active leaderboard across the local player plus
// any imported friends, and a copy-paste share block — see
// web/src/gym-defense-log.js for the data model and format.
export function renderLeaderboard({ log, now = Date.now(), draft = {}, trainerTeam = null } = {}) {
  const safeLog = log ?? { localPlayerName: "You", entries: [] };
  const rows = buildLeaderboard(safeLog, now, trainerTeam);
  const message = draft.message ?? "";
  const myRow = rows.find((row) => row.playerName === safeLog.localPlayerName);
  const shareCard = gymDefenseCardData(myRow);
  return `<div class="leaderboard-view">
  <section class="gym-section" aria-labelledby="gym-defense-log-title">
    ${sectionHeading("Manual, honest tracking", "Gym Defense Leaderboard", "gym-defense-log-title")}
    <p class="gym-intro">Pokémon GO doesn't expose gym-hold data to apps — this board is only as accurate as what you and your friends type in.</p>
    <p class="gym-intro">Tip: type <code>defender</code> into your in-game Pokémon search (the magnifying glass) to see every Pokémon of yours currently guarding a gym, straight from the game.</p>
    ${message ? `<aside class="gym-warning" role="alert"><p>${escapeHtml(message)}</p></aside>` : ""}
    <label class="defense-log-player-name">Your name on the board
      <input type="text" maxlength="40" data-defense-log-player-name value="${escapeHtml(safeLog.localPlayerName)}">
    </label>
    ${defenseLeaderboardTable(rows)}
    ${shareCard ? '<button type="button" data-action="share-gym-defense-card">Share my defense card</button>' : ""}
    <h3>Active defenders</h3>
    ${activeDefendersSection(rows, draft)}
    <h3>Drop a defender</h3>
    ${(draft.recentGyms ?? []).length > 0 ? `<p class="defense-log-recents">Quick pick: ${(draft.recentGyms ?? []).map((gym) => `<button type="button" class="chip" data-action="defense-log-quick-gym" data-gym="${escapeHtml(gym)}">${escapeHtml(gym)}</button>`).join(" ")}</p>` : ""}
    ${draft.autoPickNote ? `<p class="defense-log-autopick-note">${escapeHtml(draft.autoPickNote)}</p>` : ""}
    <div class="defense-log-form">
      <label>Pokémon<input type="text" maxlength="60" data-defense-log-pokemon value="${escapeHtml(draft.pokemon ?? "")}"></label>
      <label>Gym name<input type="text" maxlength="80" data-defense-log-gym value="${escapeHtml(draft.gymName ?? "")}"></label>
      <button type="button" data-action="defense-log-use-location" title="Use your location to find nearby gyms"${draft.geoLoading ? ' disabled' : ''}>Use my location${draft.geoLoading ? '...' : ''}</button>
      <label>Start time<input type="datetime-local" data-defense-log-start value="${escapeHtml(draft.startedAt ?? "")}"></label>
      <button type="button" data-action="defense-log-start">I dropped a defender</button>
    </div>
    <h3>Send your leaderboard to a friend</h3>
    <p>Copy-and-paste: send the text below, they paste it into "Import a friend's leaderboard" below in their own app.</p>
    <button type="button" data-action="defense-log-toggle-share" aria-expanded="${Boolean(draft.shareOpen)}">${draft.shareOpen ? "Hide my leaderboard text" : "Show my leaderboard text"}</button>
    ${draft.shareOpen ? `<pre class="roster-share-text">${escapeHtml(exportPlayerLog(safeLog, trainerTeam))}</pre>
    <button type="button" data-action="defense-log-copy-share">Copy to clipboard</button>` : ""}
    <h3>Import a friend's leaderboard</h3>
    <div class="defense-log-form">
      <label>Paste a friend's leaderboard text<textarea rows="4" data-defense-log-import-text>${escapeHtml(draft.importText ?? "")}</textarea></label>
      <button type="button" data-action="defense-log-import">Import</button>
    </div>
  </section>
  </div>`;
}
