// Team Finder view (#pvp/teamfinder, Wave P lane P2, 2026-10-16) — "best
// team from my box" plus a GBL battle log that defines "my meta". Props in,
// HTML out; team-finder.js and battle-log.js do the work. The one piece
// that ISN'T just props-in/HTML-out: `cache` (a plain object app.js keeps
// on ui.teamFinder._cache for the session) is handed to
// memoizedTeamFinderResult below so a search-box keystroke's re-render
// reuses the last matrix/ranked/leads/mirror-flags instead of re-running
// every simulatePvp call — see team-finder.js's own doc comment on that
// function for why a fresh {} every render defeats it.
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { searchOpponentForms } from "../swap.js";
import { memberMoves, suggestedRoles, switchGuideRows } from "../team-coach.js";
import { displayMoveName } from "./move-sheet.js";
import { MEASURED_AGREEMENT_PCT } from "../pvp-sim.js";
import { rankIvSpread } from "../pvp-team.js";
import {
  hasKnownEngineGap, memoizedTeamFinderResult, opponentWeights, poolInstanceOptions, poolWithOverrides,
  SHOWN_TRIO_COUNT, TEAM_FINDER_LEAGUES,
} from "../team-finder.js";
import { battleLogFrequency, battleLogLeadFrequency, battleLogWindowSize } from "../battle-log.js";

const OPPONENT_RESULT_CAP = 30;
const POOL_ADD_RESULT_CAP = 20;

function leagueName(league) {
  return `${league[0].toUpperCase()}${league.slice(1)} League`;
}

function leagueToggle(dataAttr, league, leagues = TEAM_FINDER_LEAGUES) {
  return `<div class="placement-controls" role="group" aria-label="League">
    ${leagues.map((choice) => `<button type="button" data-${dataAttr}="${escapeHtml(choice)}" aria-pressed="${choice === league}">${escapeHtml(leagueName(choice))}</button>`).join("")}
  </div>`;
}

function pct(fraction) {
  return fraction === null || fraction === undefined ? null : Math.round(fraction * 100);
}

function fractionMark(fraction) {
  if (fraction === null || fraction === undefined) return `<span class="cup-sim-mark">—</span>`;
  const value = pct(fraction);
  const cls = fraction >= 2 / 3 ? "cup-sim-w" : fraction <= 1 / 3 ? "cup-sim-l" : "cup-sim-t";
  return `<span class="cup-sim-mark ${cls}">${value}%</span>`;
}

// "at best level under the cap — needs N more power-ups[, some XL]" (or
// "already there" when the instance is already at its best level). Only
// rendered for a member using its own logged build (never the published
// fallback, which has no "current" level to compare against).
function memberLevelNote(build) {
  const parts = [`best level under the cap (L${build.bestLevel})`];
  if (build.powerUpsNeeded === null) {
    // current CP unknown — nothing to compare the best level against.
  } else if (build.powerUpsNeeded === 0) {
    parts.push("already there");
  } else {
    parts.push(`needs ${build.powerUpsNeeded} more power-up${build.powerUpsNeeded === 1 ? "" : "s"}${build.needsXl ? ", some XL" : ""}`);
  }
  return ` <small>(${parts.join(" — ")})</small>`;
}

function memberDisplay(member) {
  const uncertain = hasKnownEngineGap(member.instance.formId) ? " <small>(engine gap — less certain)</small>" : "";
  const build = member.build;
  const note = !build
    ? " <small>(no build data)</small>"
    : build.unknownMoveId
      ? ` <small>(unknown move ${escapeHtml(displayMoveName(build.unknownMoveId))} — using the published build)</small>`
      : build.assumedPublished
        ? " <small>(assumes published build)</small>"
        : memberLevelNote(build);
  return `${spriteHtml(member.instance.formId, { [member.instance.formId]: member.form }, member.name, member.form?.primary_type)}<strong>${escapeHtml(member.name)}</strong>${uncertain}${note}`;
}

function troubleSpotDetail(trouble, trio, matrix) {
  const rows = trio.map((member) => {
    const fraction = matrix.get(member.instance.id)?.get(trouble.formId) ?? null;
    return `${escapeHtml(member.name)} ${fractionMark(fraction)}`;
  }).join(" · ");
  const gap = hasKnownEngineGap(trouble.formId) ? " <small>(engine gap — less certain)</small>" : "";
  return `<li><strong>${escapeHtml(trouble.name)}</strong>${gap}: ${rows}</li>`;
}

function trioRolesHtml(trio, moveCatalog) {
  const members = trio
    .map((member) => (member.build ? { name: member.name, form: member.build.side.form, moves: memberMoves(member.build.side.fastMove, member.build.side.chargedMoves, moveCatalog) } : null))
    .filter((member) => member?.moves);
  if (members.length !== 3) return "";
  const roles = suggestedRoles(members);
  return roles ? `<p class="pvp-switch-roles">${Object.entries(roles).map(([slot, name]) => `${escapeHtml(slot)} — ${escapeHtml(name)}`).join(" · ")}</p>` : "";
}

// `pick` is the precomputed bestLead() result for this trio (from the
// memoized result's bestLeadByTrioIndex) — this function never calls
// bestLead/simulatePvp itself.
function leadSwitchGuideHtml(trio, pick, leadCount, moveCatalog) {
  const members = trio
    .map((member) => (member.build ? { name: member.name, form: member.build.side.form, moves: memberMoves(member.build.side.fastMove, member.build.side.chargedMoves, moveCatalog) } : null))
    .filter((member) => member?.moves);
  const pickHtml = pick
    ? `<p class="pvp-switch-roles">Best lead: <strong>${escapeHtml(pick.member.name)}</strong> (${pct(pick.score)}% weighted vs this league's lead meta — the top ${leadCount} published/logged leads, 1-1 shields)</p>`
    : `<p class="briefing-note">No build data to score a lead for this trio.</p>`;
  if (members.length !== 3) return pickHtml;
  return `${pickHtml}<table class="pvp-switch-table"><thead><tr><th>Their attack type</th><th>Switch to</th><th>Best to hit back</th></tr></thead><tbody>
    ${switchGuideRows(members).map((row) => `<tr><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.switchTo)}</td><td>${escapeHtml(row.bestAttacker)}</td></tr>`).join("")}
  </tbody></table>`;
}

function trioHtml(entry, index, matrix, mode, result, moveCatalog) {
  const { trio, score, sureAnswers, troubleSpots, noBuildData } = entry;
  const mirrors = trio.filter((member) => result.mirrorFlagsByInstanceId.get(member.instance.id));
  const members = trio.map((member) => `<li>${memberDisplay(member)}</li>`).join("");
  return `<details class="fallback-section"${index === 0 ? " open" : ""}>
    <summary><strong>#${index + 1} · ${score === null ? "no data" : `${pct(score)}%`}</strong> — ${trio.map((m) => escapeHtml(m.name)).join(", ")}
      <small>${sureAnswers.length} sure answer${sureAnswers.length === 1 ? "" : "s"} · ${troubleSpots.length} trouble spot${troubleSpots.length === 1 ? "" : "s"}</small></summary>
    <ul class="cup-team">${members}</ul>
    ${mode === "lead" ? leadSwitchGuideHtml(trio, result.bestLeadByTrioIndex.get(index), result.leads.length, moveCatalog) : trioRolesHtml(trio, moveCatalog)}
    ${mirrors.length ? `<ul class="cup-warnings">${mirrors.map((m) => `<li>Your ${escapeHtml(m.name)}'s IVs lose a 1-1 mirror that PvPoke's published default-IV build wins.</li>`).join("")}</ul>` : ""}
    ${sureAnswers.length ? `<p class="briefing-note">Sure answers: ${escapeHtml(sureAnswers.map((o) => o.name).join(", "))}.</p>` : ""}
    ${troubleSpots.length ? `<h4>Trouble spots</h4><ul class="cup-warnings">${troubleSpots.map((t) => troubleSpotDetail(t, trio, matrix)).join("")}</ul>` : `<p class="briefing-note">No opponent in this meta beats every member.</p>`}
    ${noBuildData.length ? `<p class="briefing-note">No build data for: ${escapeHtml(noBuildData.map((o) => o.name).join(", "))} — not counted as a loss, just not scored.</p>` : ""}
  </details>`;
}

// Current pool (with remove buttons) + a search-any-roster-instance add
// picker (item 2, Fable review 2026-10-16: the operator explicitly needs to
// pick ANY owned instance, not just the auto-computed default).
function poolSectionHtml(pool, ctx, league, poolQuery) {
  const pooledIds = new Set(pool.map((instance) => instance.id));
  const rows = pool.map((instance) => {
    const form = ctx.forms[instance.formId];
    const rank = instance.ivs ? rankIvSpread(form, instance.ivs, league)?.rank ?? null : null;
    const note = [instance.cp ? `${instance.cp} CP` : "CP unknown", rank ? `IV rank #${rank}` : "IVs not logged"].join(" · ");
    return `<li>${spriteHtml(instance.formId, { [instance.formId]: form }, form.name, form.primary_type)}<strong>${escapeHtml(form.name)}</strong> <small>${escapeHtml(note)}</small> <button type="button" data-teamfinder-pool-remove="${escapeHtml(instance.id)}" aria-label="Remove ${escapeHtml(form.name)} from pool">×</button></li>`;
  }).join("");
  const needle = poolQuery.trim().toLowerCase();
  const options = needle
    ? poolInstanceOptions(ctx).filter((option) => !pooledIds.has(option.instance.id) && option.name.toLowerCase().includes(needle)).slice(0, POOL_ADD_RESULT_CAP)
    : [];
  return `<details class="fallback-section" open>
    <summary>Your pool (${pool.length})</summary>
    <ul class="cup-team">${rows}</ul>
    <label class="swap-search">Add any roster Pokémon to the pool<input type="search" data-teamfinder-pool-query value="${escapeHtml(poolQuery)}" autocomplete="off"></label>
    ${options.length ? `<div class="pvp-matchup-chip-row">${options.map((option) => {
      const form = ctx.forms[option.instance.formId];
      return `<button type="button" class="pvp-matchup-chip" data-teamfinder-pool-add="${escapeHtml(option.instance.id)}">${spriteHtml(option.instance.formId, { [option.instance.formId]: form }, option.name, form.primary_type)}${escapeHtml(option.name)}${option.instance.cp ? ` (${option.instance.cp} CP)` : ""}</button>`;
    }).join("")}</div>` : ""}
  </details>`;
}

function manualAddHtml(state, forms) {
  const { opponentQuery, manualOpponents } = state;
  const addedIds = new Set(manualOpponents.map((opponent) => opponent.formId));
  const results = opponentQuery
    ? searchOpponentForms(opponentQuery, forms).filter((form) => !addedIds.has(form.form_id)).slice(0, OPPONENT_RESULT_CAP)
    : [];
  const added = manualOpponents.map((opponent) => ({ ...opponent, form: forms[opponent.formId] })).filter((opponent) => opponent.form);
  return `<div class="pvp-section">
    <h4>Add an opponent by hand</h4>
    <label class="swap-search">Search by name<input type="search" data-teamfinder-opponent-query value="${escapeHtml(opponentQuery)}" autocomplete="off"></label>
    ${results.length ? `<div class="pvp-matchup-chip-row">${results.map((form) => `<button type="button" class="pvp-matchup-chip" data-teamfinder-add-opponent="${escapeHtml(form.form_id)}">${spriteHtml(form.form_id, { [form.form_id]: form }, form.name, form.primary_type)}${escapeHtml(form.name)}</button>`).join("")}</div>` : ""}
    ${added.length ? `<ul class="cup-team">${added.map((opponent) => (
      `<li>${spriteHtml(opponent.formId, { [opponent.formId]: opponent.form }, opponent.form.name, opponent.form.primary_type)}<strong>${escapeHtml(opponent.form.name)}</strong> `
      + `<label>weight <input type="number" min="1" max="200" size="4" value="${opponent.weight}" data-teamfinder-opponent-weight="${escapeHtml(opponent.formId)}"></label> `
      + `<button type="button" data-teamfinder-remove-opponent="${escapeHtml(opponent.formId)}" aria-label="Remove ${escapeHtml(opponent.form.name)}">×</button></li>`
    )).join("")}</ul>` : ""}
  </div>`;
}

function logDraftHtml(draft, forms) {
  const results = draft.query ? searchOpponentForms(draft.query, forms).filter((form) => !draft.opponents.includes(form.form_id)).slice(0, OPPONENT_RESULT_CAP) : [];
  const picked = draft.opponents.map((formId) => forms[formId]).filter(Boolean);
  return `<section class="pvp-section" aria-labelledby="teamfinder-log-title">
    <h3 id="teamfinder-log-title">Log a GBL match</h3>
    ${leagueToggle("teamfinder-log-league", draft.league)}
    <label class="swap-search">Opponents faced (pick 3)<input type="search" data-teamfinder-log-query value="${escapeHtml(draft.query)}" autocomplete="off"${draft.opponents.length >= 3 ? " disabled" : ""}></label>
    ${results.length ? `<div class="pvp-matchup-chip-row">${results.map((form) => `<button type="button" class="pvp-matchup-chip" data-teamfinder-log-add="${escapeHtml(form.form_id)}">${spriteHtml(form.form_id, { [form.form_id]: form }, form.name, form.primary_type)}${escapeHtml(form.name)}</button>`).join("")}</div>` : ""}
    ${picked.length ? `<p class="pvp-matchup-chip-row">${picked.map((form) => `<span class="pvp-matchup-chip${draft.lead === form.form_id ? " pvp-matchup-chip--win" : ""}" data-teamfinder-log-lead="${escapeHtml(form.form_id)}">${escapeHtml(form.name)}${draft.lead === form.form_id ? " (lead)" : ""} <button type="button" data-teamfinder-log-remove="${escapeHtml(form.form_id)}" aria-label="Remove ${escapeHtml(form.name)}">×</button></span>`).join("")}</p><p class="briefing-note">Tap a chip to mark it the opponent's lead (optional) — feeds Lead Mode's weighting.</p>` : ""}
    <div class="placement-controls" role="group" aria-label="Result">
      <button type="button" data-teamfinder-log-win="true" aria-pressed="${draft.win === true}">Win</button>
      <button type="button" data-teamfinder-log-win="false" aria-pressed="${draft.win === false}">Loss</button>
    </div>
    <button type="button" data-action="teamfinder-log-submit"${draft.opponents.length === 3 && draft.win !== null ? "" : " disabled"}>Save match</button>
  </section>`;
}

function myMetaHtml(battleLog, league, forms) {
  const totalMatches = battleLog.filter((entry) => entry.league === league).length;
  const windowSize = battleLogWindowSize(battleLog, { league });
  const freq = battleLogFrequency(battleLog, { league });
  if (!freq.length) return `<p class="briefing-note">No logged ${escapeHtml(leagueName(league))} matches yet — log a few and this fills in.</p>`;
  const rows = freq.slice(0, 12).map((row) => `<li>${escapeHtml(forms[row.formId]?.name ?? row.formId)} <small>×${row.count}</small></li>`).join("");
  // The window named here must match what battleLogFrequency actually used
  // (Fable review, 2026-10-16) — windowSize, never the unbounded total.
  const windowNote = totalMatches > windowSize
    ? `From your last ${windowSize} of ${totalMatches} logged ${escapeHtml(leagueName(league))} matches.`
    : `From ${totalMatches} logged ${escapeHtml(leagueName(league))} match${totalMatches === 1 ? "" : "es"}.`;
  return `<p class="briefing-note">${windowNote}</p><ol class="cup-meta">${rows}</ol>`;
}

// This app's measured agreement rate (pvp-sim.js's MEASURED_AGREEMENT_PCT)
// was only ever measured against Great League matchups (see that constant's
// own header) — say so plainly for Ultra/Master instead of implying the
// same rate was separately verified there.
function agreementNoteText(league, agreementPct) {
  const base = `agrees with PvPoke's published winner in ~${agreementPct}% of tested Great League matchups, 0-0/1-1/2-2 shields`;
  return league === "great" ? base : `${base} (measured on Great League; not separately verified for ${leagueName(league)})`;
}

export function renderTeamFinderView({
  forms = {}, pvp = {}, pvpBuilds = {}, roster = {}, moveCatalog = {}, battleLog = [], state, logDraft, cache = {},
} = {}) {
  const league = state.league;
  const ctx = { forms, pvp, pvpBuilds, roster, moveCatalog };
  const pool = poolWithOverrides(league, ctx, { extraInstanceIds: state.extraPoolInstanceIds, excludedInstanceIds: state.excludedPoolInstanceIds });
  const poolSection = poolSectionHtml(pool, ctx, league, state.poolQuery);
  if (pool.length < 3) {
    return `<div class="teamfinder-view">
      <p class="status-kicker">PvP · Team Finder</p>
      <h2>Best team from your box</h2>
      ${leagueToggle("teamfinder-league", league)}
      <p class="briefing-note">Only ${pool.length} in your pool — need at least 3 to search trios. Add any Pokémon to the pool below.</p>
      ${poolSection}
      ${logDraftHtml(logDraft, forms)}
    </div>`;
  }
  const battleLogFreq = battleLogFrequency(battleLog, { league });
  const battleLogLeadFreq = battleLogLeadFrequency(battleLog, { league });
  const opponents = opponentWeights(league, ctx, { battleLogFreq, manualOpponents: state.manualOpponents });
  const result = memoizedTeamFinderResult(cache, { league, pool, opponents, ctx, mode: state.mode, battleLogLeadFreq });
  const { ranked, matrix } = result;
  const agreementPct = Math.round(MEASURED_AGREEMENT_PCT);
  return `<div class="teamfinder-view">
    <p class="status-kicker">PvP · Team Finder</p>
    <h2>Best team from your box</h2>
    ${leagueToggle("teamfinder-league", league)}
    <div class="placement-controls" role="group" aria-label="Mode">
      <button type="button" data-teamfinder-mode="trio" aria-pressed="${state.mode === "trio"}">Trio score</button>
      <button type="button" data-teamfinder-mode="lead" aria-pressed="${state.mode === "lead"}">Lead mode</button>
    </div>
    <p class="briefing-note">Approximate: scores average this app's PvPoke-derived simulator across 0-0/1-1/2-2 shields against a weighted meta (PvPoke's own open top 50, your logged battle-log frequency, and any manual adds below) — ${agreementNoteText(league, agreementPct)}. ${pool.length} in your pool, ${opponents.length} opponents, ${ranked.length} trios scored.</p>
    <ol class="cup-team teamfinder-trios">${ranked.slice(0, SHOWN_TRIO_COUNT).map((entry, index) => trioHtml(entry, index, matrix, state.mode, result, moveCatalog)).join("")}</ol>
    ${ranked.length > SHOWN_TRIO_COUNT ? `<p class="briefing-note">${ranked.length - SHOWN_TRIO_COUNT} more trios scored, not shown.</p>` : ""}
    ${poolSection}
    <details class="fallback-section">
      <summary>My meta (from your battle log)</summary>
      ${myMetaHtml(battleLog, league, forms)}
    </details>
    <details class="fallback-section">
      <summary>Add an opponent by hand</summary>
      ${manualAddHtml(state, forms)}
    </details>
    ${logDraftHtml(logDraft, forms)}
  </div>`;
}
