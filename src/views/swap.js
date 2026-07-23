import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { SWAP_LEAGUES, rankTeamAgainstOpponent, resolveSwapTeam, searchOpponentForms } from "../swap.js";
import { instanceLeagueRank, rankSummaryText } from "../pvp-team.js";
import { moveCountsFor } from "../pvp-moves.js";
import { displayMoveName } from "./move-sheet.js";

const OPPONENT_RESULT_CAP = 40;

function leagueName(league) {
  return `${league[0].toUpperCase()}${league.slice(1)} League`;
}

function leagueToggle(league) {
  return `<div class="placement-controls" aria-label="League">
    ${SWAP_LEAGUES.map((choice) => `<button type="button" data-swap-league="${escapeHtml(choice)}" aria-pressed="${choice === league}">${escapeHtml(leagueName(choice))}</button>`).join("")}
  </div>`;
}

// Rank line for one of your team's forms in this league's IV space — only
// when the instance is detailed (known IVs); star-only members stay silent
// rather than guessing. Composes instanceLeagueRank(), same as the PvP My
// Team and instance-sheet views.
function swapRankLine(form, instance, league, pvpRow) {
  const rank = instance ? instanceLeagueRank(form, instance, league, pvpRow) : null;
  return rank?.eligible ? `<p class="swap-rank-line">${escapeHtml(rankSummaryText(rank))}</p>` : "";
}

function teamMemberCard(form, instance, league, pvpRow) {
  return `<div class="fallback-section swap-team-card">
    <div class="swap-card-heading">${spriteHtml(form.form_id, { [form.form_id]: form }, form.name, form.primary_type)}<h3>${escapeHtml(form.name)}</h3></div>
    ${swapRankLine(form, instance, league, pvpRow)}
  </div>`;
}

function manualPicker(roster, forms, manualFormIds) {
  const owned = [...new Set(roster?.ownedFormIds ?? [])]
    .map((formId) => forms[formId])
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
  if (!owned.length) return "<p>No owned Pokémon yet — star some on Raids or PvP first.</p>";
  const atCapacity = manualFormIds.length >= 3;
  return `<div class="placement-controls" role="group" aria-label="Pick up to three owned Pokémon">
    ${owned.map((form) => {
      const picked = manualFormIds.includes(form.form_id);
      return `<button type="button" data-swap-manual-form-id="${escapeHtml(form.form_id)}" aria-pressed="${picked}"${!picked && atCapacity ? " disabled" : ""}>${escapeHtml(form.name)}</button>`;
    }).join("")}
  </div>`;
}

function teamStep({ state, resolved, roster, forms, pvp }) {
  const canContinue = resolved.teamForms.length > 0;
  const pvpRows = pvp?.[state.league] ?? [];
  return `<section class="swap-step" aria-labelledby="swap-team-title">
    <p class="status-kicker">Step 1 of 3</p>
    <h2 id="swap-team-title">Pick your team</h2>
    ${leagueToggle(state.league)}
    ${resolved.degraded
      ? `<p>No saved ${escapeHtml(leagueName(state.league))} team yet — pick up to three owned Pokémon to use instead.</p>${manualPicker(roster, forms, state.manualFormIds)}`
      : `<p>Using your saved ${escapeHtml(leagueName(state.league))} team.</p><div class="home-task-grid">${resolved.teamForms.map((form) => teamMemberCard(
        form, resolved.instanceByFormId?.[form.form_id], state.league, pvpRows.find((row) => row.formId === form.form_id),
      )).join("")}</div>`}
    <button type="button" class="swap-cta" data-action="swap-continue-team"${canContinue ? "" : " disabled"}>Choose opponent</button>
  </section>`;
}

function opponentCard(form) {
  return `<button type="button" class="fallback-section swap-opponent-card" data-swap-opponent-form-id="${escapeHtml(form.form_id)}">
    ${spriteHtml(form.form_id, { [form.form_id]: form }, form.name, form.primary_type)}
    <span>${escapeHtml(form.name)}</span>
  </button>`;
}

function opponentStep({ state, forms }) {
  const results = searchOpponentForms(state.opponentQuery, forms).slice(0, OPPONENT_RESULT_CAP);
  return `<section class="swap-step" aria-labelledby="swap-opponent-title">
    <p class="status-kicker">Step 2 of 3</p>
    <h2 id="swap-opponent-title">Who are you facing?</h2>
    <a class="safe-escape" href="./#swap" data-action="swap-back-team">Back to team</a>
    <label class="swap-search">Search by name
      <input type="search" data-swap-opponent-query value="${escapeHtml(state.opponentQuery)}" autocomplete="off">
    </label>
    ${results.length === OPPONENT_RESULT_CAP ? "<p>Keep typing to narrow the list.</p>" : ""}
    ${results.length
      ? `<div class="home-task-grid swap-opponent-grid">${results.map(opponentCard).join("")}</div>`
      : `<p class="pvp-empty">No Pokémon match that search — check the spelling or try just the first few letters.</p>`}
  </section>`;
}

// "N Counters -> Power-Up Punch" style line for a matchup's real ranked
// moveset — real energy numbers from methodology.pvpMoveCatalog (closes the
// round-6 gap, docs/move-counts-spike.md), silent when a move's energy data
// isn't in this release's catalog rather than guessing.
function moveCountLine(pvpRow, pvpMoveCatalog) {
  if (!pvpRow?.fastMove) return "";
  const counts = moveCountsFor(pvpRow.fastMove, pvpRow.chargedMoves, pvpMoveCatalog);
  if (!counts.length) return "";
  const fastName = displayMoveName(pvpRow.fastMove);
  const parts = counts.map(({ chargedMoveId, count }) => `${count} ${escapeHtml(fastName)} → ${escapeHtml(displayMoveName(chargedMoveId))}`);
  return `<p class="swap-move-counts">${parts.join(" · ")}</p>`;
}

function resultCard(row, matchupRank, league, instanceByFormId, pvpRows, pvpMoveCatalog) {
  const pvpRow = pvpRows.find((candidate) => candidate.formId === row.formId);
  return `<li class="fallback-section swap-result-card">
    <div class="swap-card-heading">${spriteHtml(row.formId, { [row.formId]: row.form }, row.form.name, row.form.primary_type)}<h3>#${matchupRank} ${escapeHtml(row.form.name)}</h3></div>
    <p>${escapeHtml(row.because)}</p>
    ${swapRankLine(row.form, instanceByFormId?.[row.formId], league, pvpRow)}
    ${moveCountLine(pvpRow, pvpMoveCatalog)}
  </li>`;
}

function resultStep({ state, resolved, forms, pvp, moveCatalog, pvpMoveCatalog }) {
  const opponent = forms[state.opponentFormId];
  const pvpRows = pvp?.[state.league] ?? [];
  const instanceByFormId = resolved.instanceByFormId ?? {};
  const ranked = rankTeamAgainstOpponent(resolved.teamForms, opponent, {
    pvpRows, instanceByFormId, moveCatalog,
  });
  return `<section class="swap-step" aria-labelledby="swap-result-title">
    <p class="status-kicker">Step 3 of 3</p>
    <h2 id="swap-result-title">Best lead vs ${escapeHtml(opponent.name)}</h2>
    <ol class="swap-result-list">${ranked.map((row, index) => resultCard(row, index + 1, state.league, instanceByFormId, pvpRows, pvpMoveCatalog)).join("")}</ol>
    <div class="swap-actions">
      <a class="safe-escape" href="./#swap" data-action="swap-back-opponent">Change opponent</a>
      <a class="safe-escape" href="./#swap" data-action="swap-reset">Start over</a>
    </div>
  </section>`;
}

export function renderSwap({ pvp = {}, pvpTeams = [], forms = {}, roster = {}, state, moveCatalog = {}, pvpMoveCatalog = {} } = {}) {
  const resolved = resolveSwapTeam({
    league: state.league, pvp, pvpTeams, roster, forms, manualFormIds: state.manualFormIds,
  });
  let step = state.step;
  if (step !== "team" && resolved.teamForms.length === 0) step = "team";
  if (step === "result" && !forms[state.opponentFormId]) step = "opponent";

  const body = step === "opponent"
    ? opponentStep({ state, forms })
    : step === "result"
      ? resultStep({ state, resolved, forms, pvp, moveCatalog, pvpMoveCatalog })
      : teamStep({ state, resolved, roster, forms, pvp });

  return `<div class="swap-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    ${body}
  </div>`;
}
