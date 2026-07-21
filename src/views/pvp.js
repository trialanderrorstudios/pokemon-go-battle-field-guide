import { escapeHtml } from "./home.js";


export const PVP_LEAGUES = Object.freeze(["great", "ultra", "master"]);
const PVP_LEAGUE_FILTERS = Object.freeze(["all", ...PVP_LEAGUES]);
const FORM_FILTERS = new Set(["all", "regular", "shadow"]);
const VIEWS = new Set(["rankings", "teams"]);
const INVESTMENT_FILTERS = new Set(["all", "S+", "S", "A", "B", "C"]);


function allowed(value, values, fallback) {
  return values.has(value) ? value : fallback;
}


export function createPvpState({ preferences = {}, filters = {} } = {}) {
  const saved = preferences?.pvp && typeof preferences.pvp === "object"
    ? preferences.pvp
    : {};
  const requested = { ...saved, ...filters };
  return {
    form: allowed(requested.form, FORM_FILTERS, "all"),
    investment: allowed(requested.investment, INVESTMENT_FILTERS, "all"),
    league: allowed(requested.league, new Set(PVP_LEAGUE_FILTERS), "all"),
    view: allowed(requested.view, VIEWS, "rankings"),
  };
}


export function pvpPreferencePayload(state = {}) {
  const normalized = createPvpState({ filters: state });
  return {
    pvp: {
      form: normalized.form,
      investment: normalized.investment,
      league: normalized.league,
      view: normalized.view,
    },
  };
}


export function selectPvpRows(pvp = {}, state = createPvpState()) {
  const normalized = createPvpState({ filters: state });
  const leagueRows = normalized.league === "all"
    ? PVP_LEAGUES.flatMap((league) => pvp?.[league] ?? [])
    : (pvp?.[normalized.league] ?? []);
  return leagueRows.filter((row) => {
    if (normalized.form === "shadow" && !row.shadow) return false;
    if (normalized.form === "regular" && row.shadow) return false;
    return normalized.investment === "all" || row.investmentTier === normalized.investment;
  });
}


function titleCase(value) {
  return String(value ?? "").toLowerCase().split("_")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}


function leagueName(league) {
  if (league === "all") return "All leagues";
  return `${league[0].toUpperCase()}${league.slice(1)} League`;
}


function yesNo(value) {
  return value ? "Yes" : "No";
}


function typesFor(forms, formId) {
  const form = forms?.[formId];
  return [form?.primary_type, form?.secondary_type].filter(Boolean).join(" / ") || "Types unavailable";
}


function moveWithElite(moveId, eliteMoves, kind) {
  const elite = eliteMoves.has(moveId);
  return `${escapeHtml(titleCase(moveId))}${elite ? ` <small class="elite-tm">Elite ${escapeHtml(kind)} TM</small>` : ""}`;
}


function filterSelect(name, label, value, choices) {
  return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}" data-pvp-filter="${escapeHtml(name)}">
    ${choices.map(([choice, text]) => `<option value="${escapeHtml(choice)}"${choice === value ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}
  </select></label>`;
}


function controls(state) {
  return `<form class="pvp-controls" data-pvp-filters aria-label="PvP league and ranking filters">
    ${filterSelect("league", "League", state.league, PVP_LEAGUE_FILTERS.map((league) => [league, leagueName(league)]))}
    ${state.view === "rankings" ? `${filterSelect("form", "Form", state.form, [["all", "Regular + Shadow"], ["regular", "Regular only"], ["shadow", "Shadow only"]])}
    ${filterSelect("investment", "Investment", state.investment, [["all", "All tiers"], ["S+", "S+"], ["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"]])}` : ""}
    <fieldset><legend>View</legend>
      <button type="button" data-pvp-view="rankings" aria-pressed="${state.view === "rankings"}">Rankings</button>
      <button type="button" data-pvp-view="teams" aria-pressed="${state.view === "teams"}">Teams</button>
    </fieldset>
  </form>`;
}


function pvpCard(row, forms, { showLeague = false, publishedRank = false } = {}) {
  const rankOne = row.rankOne ?? {};
  const ivs = rankOne.ivs ?? {};
  const eliteMoves = new Set(forms?.[row.formId]?.elite_moves ?? []);
  const cardId = `pvp-${row.league}-${row.rank}-${row.formId}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `<li class="pvp-card" data-form-id="${escapeHtml(row.formId)}">
    <article aria-labelledby="${cardId}">
      ${showLeague ? `<p class="pvp-league-label">${escapeHtml(leagueName(row.league))}</p>` : ""}
      <div class="pvp-card-heading"><p class="pvp-rank">${publishedRank ? "Published rank " : ""}#${escapeHtml(row.rank)}</p><h3 id="${cardId}">${escapeHtml(row.pokemon)}</h3></div>
      <p class="pvp-types">${escapeHtml(typesFor(forms, row.formId))}${row.shadow ? " · <strong>Shadow form</strong>" : " · Regular form"}</p>
      <dl class="pvp-moves">
        <div><dt>Fast move</dt><dd>${moveWithElite(row.fastMove, eliteMoves, "Fast")}</dd></div>
        <div><dt>Charged moves</dt><dd>${(row.chargedMoves ?? []).map((move) => moveWithElite(move, eliteMoves, "Charged")).join(" + ")}</dd></div>
      </dl>
      <dl class="pvp-stats" aria-label="Independently calculated rank-1 IVs">
        <div><dt>Rank-1 IVs</dt><dd>${escapeHtml(`${ivs.attack ?? "—"}/${ivs.defense ?? "—"}/${ivs.stamina ?? "—"}`)}</dd></div>
        <div><dt>Level</dt><dd>${escapeHtml(rankOne.level ?? "—")}</dd></div>
        <div><dt>CP</dt><dd>${escapeHtml(rankOne.cp ?? "—")}</dd></div>
        <div><dt>Stat product</dt><dd>${escapeHtml(rankOne.statProduct ?? "—")}</dd></div>
        <div><dt>XL</dt><dd>${yesNo(rankOne.xlRequired)}</dd></div>
        <div><dt>Best Buddy</dt><dd>${yesNo(rankOne.bestBuddyRequired)}</dd></div>
      </dl>
      <dl class="pvp-guidance">
        <div><dt>Role</dt><dd>${escapeHtml(row.primaryRole)} · ${escapeHtml((row.roles ?? []).join(", "))}</dd></div>
        <div><dt>Investment</dt><dd>${escapeHtml(row.investmentTier)} · ${escapeHtml(row.recommendation)}</dd></div>
        <div><dt>Budget</dt><dd>${escapeHtml(row.budgetValue)} · ${escapeHtml(row.resourceBurden)}</dd></div>
        <div><dt>Availability</dt><dd>${escapeHtml(row.availability ?? "Not documented")}</dd></div>
        <div><dt>Source version</dt><dd>${escapeHtml(row.sourceVersion ?? "Not documented")}</dd></div>
        <div><dt>Verified</dt><dd>${escapeHtml(row.verifiedAt ?? "Not documented")}</dd></div>
      </dl>
      ${row.alternativeReason ? `<p class="pvp-alternative-reason"><strong>Why it is here:</strong> ${escapeHtml(row.alternativeReason)}</p>` : ""}
      <details><summary>Caveat and sources</summary>
        <p><strong>Caveat:</strong> ${escapeHtml(row.caveat)}</p>
        <p>${escapeHtml(rankOne.ivCaveat)}</p>
        <p><strong>Sources:</strong> ${escapeHtml((row.sourceRefs ?? []).join(", "))}</p>
      </details>
    </article>
  </li>`;
}


function rankingsView(pvp, forms, state) {
  const allRows = state.league === "all"
    ? PVP_LEAGUES.flatMap((league) => pvp?.[league] ?? [])
    : (pvp?.[state.league] ?? []);
  const rows = selectPvpRows(pvp, state);
  return `<section class="pvp-section" aria-labelledby="pvp-rankings-title">
    <p class="status-kicker">Open league cutoff snapshot</p>
    <h2 id="pvp-rankings-title">${escapeHtml(state.league === "all" ? "All leagues · Top 50 each" : `${leagueName(state.league)} Top 50`)}</h2>
    <p class="pvp-summary">Showing ${rows.length} of ${allRows.length}. Regular and Shadow forms remain separate exact-form entries.</p>
    ${rows.length
      ? `<ol class="pvp-card-list">${rows.map((row) => pvpCard(row, forms, { showLeague: state.league === "all" })).join("")}</ol>`
      : `<p class="pvp-empty">No entries match these filters. Change Form or Investment to continue.</p>`}
  </section>`;
}


function findTeamMember(pvp, formId, league) {
  return (pvp?.[league] ?? []).find((row) => row.formId === formId);
}


function teamCard(team, pvp, forms) {
  const shared = team.sharedWeaknesses?.length
    ? team.sharedWeaknesses.join(", ")
    : "No calculated shared weakness";
  const acknowledged = team.acknowledgedWeaknesses?.length
    ? team.acknowledgedWeaknesses.join(", ")
    : "No additional weakness called out";
  return `<li class="pvp-team-card" data-team-id="${escapeHtml(team.id)}"><article>
    <p class="pvp-league-label">${escapeHtml(leagueName(team.league))}</p>
    <h3>${escapeHtml(team.name)}</h3>
    <ol class="pvp-team-members">${(team.members ?? []).map((member) => {
      const row = findTeamMember(pvp, member.formId, team.league);
      const form = forms?.[member.formId];
      const name = row?.pokemon ?? form?.name ?? member.formId;
      const eliteMoves = new Set(form?.elite_moves ?? []);
      const moves = row
        ? `<span class="pvp-team-moves">Quick: ${moveWithElite(row.fastMove, eliteMoves, "Fast")} · Charged: ${(row.chargedMoves ?? []).map((move) => moveWithElite(move, eliteMoves, "Charged")).join(" + ")}</span>`
        : "";
      return `<li data-form-id="${escapeHtml(member.formId)}"><strong>${escapeHtml(member.role)}:</strong> ${escapeHtml(name)} <span>${escapeHtml(typesFor(forms, member.formId))}</span>${moves}</li>`;
    }).join("")}</ol>
    <p><strong>Battle plan:</strong> ${escapeHtml(team.plan)}</p>
    <p><strong>Shared weaknesses:</strong> ${escapeHtml(shared)}</p>
    <p><strong>Acknowledged weaknesses:</strong> ${escapeHtml(acknowledged)}</p>
    <p class="pvp-sources"><strong>Sources:</strong> ${escapeHtml((team.sourceRefs ?? []).join(", "))}</p>
  </article></li>`;
}


function alternativesView(alternatives, forms, state) {
  const rows = state.league === "all"
    ? (alternatives ?? [])
    : (alternatives ?? []).filter((row) => row.league === state.league);
  if (!rows.length) return "";
  return `<section class="pvp-section pvp-alternatives" aria-labelledby="pvp-alternatives-title">
    <p class="status-kicker">Owned-build and familiar options</p>
    <h2 id="pvp-alternatives-title">Practical alternatives outside the Top 50</h2>
    <p class="pvp-summary">These do not replace the six current teams per league. Published rank, XL needs, legal moves, and caveats stay visible.</p>
    <ol class="pvp-card-list">${rows.map((row) => pvpCard(row, forms, {
      showLeague: state.league === "all",
      publishedRank: true,
    })).join("")}</ol>
  </section>`;
}


function teamsView(pvp, teams, alternatives, forms, state) {
  const leagueTeams = state.league === "all"
    ? (teams ?? [])
    : (teams ?? []).filter((team) => team.league === state.league);
  return `<section class="pvp-section" aria-labelledby="pvp-teams-title">
    <p class="status-kicker">${leagueTeams.length} current example teams</p>
    <h2 id="pvp-teams-title">${escapeHtml(leagueName(state.league))} team suggestions</h2>
    <p class="pvp-summary">Example teams are plans, not guaranteed wins. Shared and acknowledged weaknesses stay visible.</p>
    <ul class="pvp-team-list">${leagueTeams.map((team) => teamCard(team, pvp, forms)).join("")}</ul>
  </section>${alternativesView(alternatives, forms, state)}`;
}


export function renderPvp({ pvp = {}, pvpTeams = [], pvpAlternatives = [], forms = {}, state } = {}) {
  const normalized = createPvpState({ filters: state });
  return `<div class="pvp-view">
    <a class="safe-escape" href="./#pvp">Reset PvP filters</a>
    ${controls(normalized)}
    ${normalized.view === "teams"
      ? teamsView(pvp, pvpTeams, pvpAlternatives, forms, normalized)
      : rankingsView(pvp, forms, normalized)}
  </div>`;
}
