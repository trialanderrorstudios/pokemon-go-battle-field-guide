import { escapeHtml } from "./home.js";
import { jargonTerm } from "../glossary.js";
import { spriteHtml } from "../sprites.js";
import { displayMoveName, moveLink } from "./move-sheet.js";
import { buildMyTeam, detectInstanceConflicts, instanceLeagueRank, LEAGUE_CP_CAP, MY_TEAM_SLOTS, myTeamOverridesFor, rankSummaryText } from "../pvp-team.js";
import { moveCountsFor } from "../pvp-moves.js";
import { levelCapNote, xlPowerUpCost } from "../raid-target.js";
import { typeChip } from "./types.js";
import { computeMetaCoverage } from "../meta-coverage.js";


export const PVP_LEAGUES = Object.freeze(["great", "ultra", "master"]);
const PVP_LEAGUE_FILTERS = Object.freeze(["all", ...PVP_LEAGUES]);
const FORM_FILTERS = new Set(["all", "regular", "shadow"]);
const VIEWS = new Set(["rankings", "teams", "antimeta"]);
const INVESTMENT_FILTERS = new Set(["all", "S+", "S", "A", "B", "C"]);
const ANTI_META_FILTERS = new Set(["all", "countersMeta"]);
// "Meta" proxy: top-N by published rank in a league. Not real usage/ladder
// share (we don't have that data) — just the current rank cutoff, stated in
// the teach copy below. Kept small (top 3, not top 50) so the filter stays
// meaningfully selective: a wide leader set overlaps with nearly every
// Top-50 pick's favorable matchups and stops discriminating anything.
const META_LEADER_COUNT = 3;

// The "meta group" is a proxy, not real usage data: this app has no live
// ladder/pick-rate feed, so "meta" here just means the top-ranked picks by
// pvpoke's own meta-weighted rank. N=16 is a plain constant, not a user
// control — bump it here if the operator wants a wider/narrower meta group.
const ANTI_META_GROUP_SIZE = 16;
const ANTI_META_PICKS_PER_ROLE = 5;
// Matches the exact keys pvpoke computes on every row's roleScores object.
const ANTI_META_ROLE_CATEGORIES = Object.freeze([
  "Lead", "Safe Switch", "Closer", "Shield Pressure", "Attack Pressure", "Consistency",
]);


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
    view: allowed(requested.view, VIEWS, "teams"),
    antiMeta: allowed(requested.antiMeta, ANTI_META_FILTERS, "all"),
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
      antiMeta: normalized.antiMeta,
    },
  };
}


// Meta leaders for a league: the top META_LEADER_COUNT rows by published
// rank. A proxy for "the meta" (we have no real usage/ladder-share data) —
// stated explicitly in the filter's teach copy, not just here.
function metaLeaderFormIds(leagueRows) {
  return new Set(
    leagueRows
      .filter((row) => row.rank <= META_LEADER_COUNT)
      .map((row) => row.formId)
  );
}


function countersMeta(row, pvp) {
  const leagueRows = pvp?.[row.league] ?? [];
  const leaders = metaLeaderFormIds(leagueRows);
  return (row.keyMatchups ?? []).some(
    (entry) => entry.opponentFormId && leaders.has(entry.opponentFormId) && entry.rating > 500
  );
}


export function selectPvpRows(pvp = {}, state = createPvpState()) {
  const normalized = createPvpState({ filters: state });
  const leagueRows = normalized.league === "all"
    ? PVP_LEAGUES.flatMap((league) => pvp?.[league] ?? [])
    : (pvp?.[normalized.league] ?? []);
  return leagueRows.filter((row) => {
    if (normalized.form === "shadow" && !row.shadow) return false;
    if (normalized.form === "regular" && row.shadow) return false;
    if (normalized.investment !== "all" && row.investmentTier !== normalized.investment) return false;
    if (normalized.antiMeta === "countersMeta" && !countersMeta(row, pvp)) return false;
    return true;
  });
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


function typeChipsFor(forms, formId) {
  const form = forms?.[formId];
  const types = [form?.primary_type, form?.secondary_type].filter(Boolean);
  return types.length ? types.map(typeChip).join("") : "Types unavailable";
}


function moveWithElite(moveId, eliteMoves, kind) {
  return moveLink(moveId, { elite: eliteMoves.has(moveId), kind });
}


// "N Counters -> Power-Up Punch" style text for a real fast/charged pair.
// Real energy numbers from methodology.pvpMoveCatalog (closes the round-6
// gap, docs/move-counts-spike.md); silent when a move isn't in this
// release's catalog rather than guessing.
function moveCountText(fastMove, chargedMoves, pvpMoveCatalog) {
  const counts = moveCountsFor(fastMove, chargedMoves, pvpMoveCatalog);
  if (!counts.length) return "";
  const fastName = displayMoveName(fastMove);
  return counts.map(({ chargedMoveId, count }) => `${count} ${fastName} → ${displayMoveName(chargedMoveId)}`).join(" · ");
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
    ${filterSelect("investment", "Investment", state.investment, [["all", "All tiers"], ["S+", "S+"], ["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"]])}
    ${filterSelect("antiMeta", "Meta", state.antiMeta, [["all", "All picks"], ["countersMeta", "Counters the meta"]])}` : ""}
    <fieldset><legend>View</legend>
      <button type="button" data-pvp-view="teams" aria-pressed="${state.view === "teams"}">Teams</button>
      <button type="button" data-pvp-view="rankings" aria-pressed="${state.view === "rankings"}">Rankings</button>
      <button type="button" data-pvp-view="antimeta" aria-pressed="${state.view === "antimeta"}">Anti-Meta</button>
    </fieldset>
  </form>`;
}


// Open Master League always recommends the max-level (usually 50) rank-1 spread
// since there's no CP cap to stop at — that's the one context where pushing past
// Level 40 is the standard recommendation, not a situational stretch goal. Great
// and Ultra League's cap-driven level (which can also exceed 40 for low-CP forms)
// stays a plain "XL: Yes/No" flag instead; it isn't the same "go to endgame" case.
function endgamePowerUpLine(row, trainerLevel = null) {
  const level = row.rankOne?.level;
  if (row.league !== "master" || !row.rankOne?.xlRequired || !Number.isFinite(level)) return "";
  const capNote = levelCapNote(level, trainerLevel, { requiresXl: true });
  const { candy, stardust } = xlPowerUpCost(40, level, row.shadow);
  return `<p class="pvp-endgame-cost"><strong>Endgame (Level 40 → ${escapeHtml(level)}):</strong> `
    + `${escapeHtml(candy)} XL Candy + ${escapeHtml(stardust.toLocaleString("en-US"))} Stardust`
    + `${row.shadow ? " (Shadow: +20% Candy/Stardust already included)" : ""} — XL Candy is slow to earn.</p>`
    + (capNote ? `<p class="pvp-endgame-cap">${escapeHtml(capNote)}</p>` : "");
}


// One "Beats"/"Loses to" chip: opponent sprite (when we could resolve its
// formId) + name + the raw PvPoke sim rating that earned it a spot here.


// Resurfaces the pvpoke matchups/counters PvPoke already simulates per
// Pokemon — top favorable and worst 1-on-1s. Sim data, not real ladder
// outcomes; the jargonTerm teaches that inline.
//
// Rendered as ONE compact text line per row, not chip lists. The rankings
// list is ~50 rows per league (150 across "all"); chip lists put ~1500
// elements + 23k total DOM nodes on the page, which hung WebKit's layout on
// the release-upgrade re-render (real-device WebKit test caught it,
// 2026-07-24; Chromium coped and hid it). Names-only text is ~1 node per row.
const MATCHUP_NAMES_SHOWN = 3;
function matchupNames(entries) {
  return entries.slice(0, MATCHUP_NAMES_SHOWN).map((entry) => entry.opponentName).join(", ");
}

function matchupsSection(row) {
  const wins = row.keyMatchups ?? [];
  const losses = row.keyCounters ?? [];
  if (!wins.length && !losses.length) return "";
  const winText = wins.length ? `<span class="pvp-matchups-win">Beats ${escapeHtml(matchupNames(wins))}</span>` : "";
  const lossText = losses.length ? `<span class="pvp-matchups-loss">loses to ${escapeHtml(matchupNames(losses))}</span>` : "";
  const sep = winText && lossText ? " · " : "";
  return `<p class="pvp-matchups">${winText}${sep}${lossText} <span class="pvp-matchups-hint">(PvPoke ${jargonTerm("pvpoke-sim-rating", "sim rating")})</span></p>`;
}


function pvpCard(row, forms, { showLeague = false, publishedRank = false, trainerLevel = null, pvpMoveCatalog = {}, showMatchups = true } = {}) {
  const rankOne = row.rankOne ?? {};
  const ivs = rankOne.ivs ?? {};
  const eliteMoves = new Set(forms?.[row.formId]?.elite_moves ?? []);
  const cardId = `pvp-${row.league}-${row.rank}-${row.formId}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const moveCounts = moveCountText(row.fastMove, row.chargedMoves, pvpMoveCatalog);
  return `<li class="pvp-card" data-form-id="${escapeHtml(row.formId)}">
    <article aria-labelledby="${cardId}">
      ${showLeague ? `<p class="pvp-league-label">${escapeHtml(leagueName(row.league))}</p>` : ""}
      <div class="pvp-card-heading">${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}<p class="pvp-rank">${publishedRank ? "Published rank " : ""}#${escapeHtml(row.rank)}</p><h3 id="${cardId}">${escapeHtml(row.pokemon)}</h3></div>
      <p class="pvp-types">${escapeHtml(typesFor(forms, row.formId))}${row.shadow ? ` · <strong>${jargonTerm("shadow", "Shadow form")}</strong>` : " · Regular form"}</p>
      <dl class="pvp-moves">
        <div><dt>${jargonTerm("fast-move", "Fast move")}</dt><dd>${moveWithElite(row.fastMove, eliteMoves, "Fast")}</dd></div>
        <div><dt>${jargonTerm("charged-move", "Charged moves")}</dt><dd>${(row.chargedMoves ?? []).map((move) => moveWithElite(move, eliteMoves, "Charged")).join(" + ")}</dd></div>
      </dl>
      ${moveCounts ? `<p class="pvp-move-counts">${escapeHtml(moveCounts)}</p>` : ""}
      <dl class="pvp-stats" aria-label="Independently calculated rank-1 IVs">
        <div><dt>${jargonTerm("iv", "Rank-1 IVs")}</dt><dd>${escapeHtml(`${ivs.attack ?? "—"}/${ivs.defense ?? "—"}/${ivs.stamina ?? "—"}`)}</dd></div>
        <div><dt>Level</dt><dd>${escapeHtml(rankOne.level ?? "—")}</dd></div>
        <div><dt>${jargonTerm("cp", "CP")}</dt><dd>${escapeHtml(rankOne.cp ?? "—")}</dd></div>
        <div><dt>${jargonTerm("stat-product", "Stat product")}</dt><dd>${escapeHtml(rankOne.statProduct ?? "—")}</dd></div>
        <div><dt>${jargonTerm("candy", "XL")}</dt><dd>${yesNo(rankOne.xlRequired)}</dd></div>
        <div><dt>Best Buddy</dt><dd>${yesNo(rankOne.bestBuddyRequired)}</dd></div>
      </dl>
      ${endgamePowerUpLine(row, trainerLevel)}
      <dl class="pvp-guidance">
        <div><dt>Role</dt><dd>${escapeHtml(row.primaryRole)} · ${escapeHtml((row.roles ?? []).join(", "))}</dd></div>
        <div><dt>Investment</dt><dd>${escapeHtml(row.investmentTier)} · ${escapeHtml(row.recommendation)}</dd></div>
        <div><dt>Budget</dt><dd>${escapeHtml(row.budgetValue)} · ${escapeHtml(row.resourceBurden)}</dd></div>
        <div><dt>Availability</dt><dd>${escapeHtml(row.availability ?? "Not documented")}</dd></div>
        <div><dt>Source version</dt><dd>${escapeHtml(row.sourceVersion ?? "Not documented")}</dd></div>
        <div><dt>Verified</dt><dd>${escapeHtml(row.verifiedAt ?? "Not documented")}</dd></div>
      </dl>
      ${showMatchups ? matchupsSection(row) : ""}
      ${row.alternativeReason ? `<p class="pvp-alternative-reason"><strong>Why it is here:</strong> ${escapeHtml(row.alternativeReason)}</p>` : ""}
      <details><summary>Caveat and sources</summary>
        <p><strong>Caveat:</strong> ${escapeHtml(row.caveat)}</p>
        <p>${escapeHtml(rankOne.ivCaveat)}</p>
        <p><strong>Sources:</strong> ${escapeHtml((row.sourceRefs ?? []).join(", "))}</p>
      </details>
    </article>
  </li>`;
}


// Anti-meta type-coverage HEURISTIC (meta-coverage.js): types that pressure
// the current top-ranked Pokémon in this league, and which owned-typing
// candidates line up with that pressure. Types only — see heuristicLabel,
// always shown alongside it, for what this ignores.
function metaPressureSection(league, pvp, forms) {
  const rows = pvp?.[league] ?? [];
  const coverage = computeMetaCoverage({ rows, forms });
  if (!coverage.pressure.length) return "";
  return `<details class="pvp-roles-teach">
    <summary>Types that pressure the ${escapeHtml(leagueName(league))} ${jargonTerm("meta")}</summary>
    <p class="pvp-summary">${escapeHtml(coverage.heuristicLabel)}</p>
    <p class="pvp-summary">Based on the typing of the current top ${escapeHtml(coverage.topN)} ranked Pokémon.</p>
    <p class="type-chip-list">${coverage.pressure.slice(0, 6)
      .map((entry) => `${typeChip(entry.type)} (${escapeHtml(entry.share)}%)`).join(" ")}</p>
    ${coverage.candidates.length
      ? `<p><strong>Candidate attackers strong into this meta:</strong></p>
      <ol>${coverage.candidates.map((candidate) => (
        `<li>${escapeHtml(candidate.pokemon)} ${candidate.matchedTypes.map(typeChip).join("")}</li>`
      )).join("")}</ol>`
      : ""}
  </details>`;
}


function rankingsView(pvp, forms, state, trainerLevel = null, pvpMoveCatalog = {}, showMatchups = true) {
  const allRows = state.league === "all"
    ? PVP_LEAGUES.flatMap((league) => pvp?.[league] ?? [])
    : (pvp?.[state.league] ?? []);
  const rows = selectPvpRows(pvp, state);
  const leaguesShown = state.league === "all" ? PVP_LEAGUES : [state.league];
  return `<section class="pvp-section" aria-labelledby="pvp-rankings-title">
    <p class="status-kicker">Open league cutoff snapshot</p>
    <h2 id="pvp-rankings-title">${escapeHtml(state.league === "all" ? "All leagues · Top 50 each" : `${leagueName(state.league)} Top 50`)}</h2>
    <p class="pvp-summary">Showing ${rows.length} of ${allRows.length}. Regular and Shadow forms remain separate exact-form entries.</p>
    ${state.antiMeta === "countersMeta" ? `<p class="pvp-antimeta-teach">Showing Top 50 picks with a favorable PvPoke matchup against ${jargonTerm("meta-leaders", "the meta")} (top ${META_LEADER_COUNT} by rank in this league).</p>` : ""}
    ${leaguesShown.map((league) => metaPressureSection(league, pvp, forms)).join("")}
    ${rows.length
      ? `<ol class="pvp-card-list">${rows.map((row) => pvpCard(row, forms, { showLeague: state.league === "all", trainerLevel, pvpMoveCatalog, showMatchups })).join("")}</ol>`
      : `<p class="pvp-empty">No entries match these filters. Change Form, Investment, or Meta to continue.</p>`}
  </section>`;
}


// One role's pick list: candidates ranked by that role's own roleScore
// (a pvpoke meta-weighted number, same source/caveats as everywhere else in
// this section — not a new sim). Rows missing that role's score, or missing
// roleScores entirely, are skipped rather than crashing or sorting as zero.
function antiMetaRoleSection(role, candidates, forms) {
  const picks = candidates
    .filter((row) => Number.isFinite(row.roleScores?.[role]))
    .sort((left, right) => right.roleScores[role] - left.roleScores[role])
    .slice(0, ANTI_META_PICKS_PER_ROLE);
  return `<div class="pvp-antimeta-role">
    <h3>${escapeHtml(role)}</h3>
    ${picks.length
      ? `<ol class="pvp-team-members">${picks.map((row) => `<li class="pvp-team-member" data-form-id="${escapeHtml(row.formId)}" data-role="${escapeHtml(role)}">
        ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
        <div class="pvp-team-member-body">
          <p class="pvp-team-member-heading"><strong>#${escapeHtml(row.rank)}</strong> ${escapeHtml(row.pokemon)}${row.shadow ? " · Shadow" : ""}</p>
          <p>Primary role: ${escapeHtml(row.primaryRole)} · ${escapeHtml(role)} score: ${escapeHtml(row.roleScores[role])}</p>
          <p>Overall meta-weighted score: ${escapeHtml(row.score ?? "—")}</p>
        </div>
      </li>`).join("")}</ol>`
      : `<p class="pvp-empty">No eligible picks outside the meta group for this role yet.</p>`}
  </div>`;
}


function antiMetaLeagueSection(pvp, forms, league) {
  const rows = [...(pvp?.[league] ?? [])].sort((left, right) => (left.rank ?? Infinity) - (right.rank ?? Infinity));
  if (!rows.length) return "";
  const metaGroup = rows.slice(0, ANTI_META_GROUP_SIZE);
  const candidates = rows.slice(ANTI_META_GROUP_SIZE);
  return `<section class="pvp-section pvp-antimeta" aria-labelledby="pvp-antimeta-title-${escapeHtml(league)}">
    <p class="status-kicker">Role fitness against the current meta</p>
    <h2 id="pvp-antimeta-title-${escapeHtml(league)}">Anti-Meta Board · ${escapeHtml(leagueName(league))}</h2>
    <details class="pvp-roles-teach">
      <summary>What counts as "meta" here?</summary>
      <p>${jargonTerm("meta-group", "Meta group")} means the top ${escapeHtml(ANTI_META_GROUP_SIZE)} picks in this league by pvpoke's meta-weighted rank — a proxy for what's commonly used. This app has no live ladder or usage-share data, so treat it as a stand-in, not real pick-rate stats. The picks below are ranked by pvpoke's own per-role scores, calculated against that same meta — same cutoff-date snapshot and caveats as the rest of this page.</p>
    </details>
    <div class="pvp-antimeta-meta-group">
      <h3>Meta group (Top ${escapeHtml(ANTI_META_GROUP_SIZE)} by rank)</h3>
      <ol class="pvp-antimeta-meta-list">${metaGroup.map((row) => (
        `<li>#${escapeHtml(row.rank)} ${escapeHtml(row.pokemon)}${row.shadow ? " · Shadow" : ""} — ${escapeHtml(row.primaryRole)}</li>`
      )).join("")}</ol>
    </div>
    <p class="pvp-summary">Best picks ranked ${escapeHtml(candidates.length)} of ${escapeHtml(rows.length)} — everyone outside the meta group above, grouped by which role they fit best.</p>
    <div class="pvp-antimeta-roles">${ANTI_META_ROLE_CATEGORIES.map((role) => antiMetaRoleSection(role, candidates, forms)).join("")}</div>
  </section>`;
}


function antiMetaView(pvp, forms, state) {
  const leagues = state.league === "all" ? PVP_LEAGUES : [state.league];
  const sections = leagues.map((league) => antiMetaLeagueSection(pvp, forms, league)).filter(Boolean);
  return sections.length ? sections.join("") : `<p class="pvp-empty">No PvP rankings are available yet for the anti-meta board.</p>`;
}


function findTeamMember(pvp, formId, league) {
  return (pvp?.[league] ?? []).find((row) => row.formId === formId);
}


function teamMemberRow(member, row, form, forms, pvpMoveCatalog = {}) {
  const name = row?.pokemon ?? form?.name ?? member.formId;
  const eliteMoves = new Set(form?.elite_moves ?? []);
  const moveCounts = row ? moveCountText(row.fastMove, row.chargedMoves, pvpMoveCatalog) : "";
  const moves = row
    ? `<p class="pvp-team-moves"><span class="pvp-team-quick">Quick: ${moveWithElite(row.fastMove, eliteMoves, "Fast")}</span><span class="pvp-team-charged">Charged: ${(row.chargedMoves ?? []).map((move) => moveWithElite(move, eliteMoves, "Charged")).join(" + ")}</span>${moveCounts ? ` <span class="pvp-team-move-counts">${escapeHtml(moveCounts)}</span>` : ""}</p>`
    : "";
  const ideal = row?.rankOne
    ? `<p class="pvp-team-ideal">Ideal: ${row.rankOne.ivs.attack}/${row.rankOne.ivs.defense}/${row.rankOne.ivs.stamina} IVs @ ${row.rankOne.cp} CP</p>`
    : "";
  return `<li class="pvp-team-member" data-form-id="${escapeHtml(member.formId)}" data-role="${escapeHtml(member.role)}">
    ${spriteHtml(member.formId, forms, name, form?.primary_type)}
    <div class="pvp-team-member-body">
      <p class="pvp-team-member-heading"><strong class="pvp-team-role" data-role="${escapeHtml(member.role)}">${escapeHtml(member.role)}:</strong> ${escapeHtml(name)}</p>
      <p class="pvp-team-types">${typeChipsFor(forms, member.formId)}</p>
      ${moves}
      ${ideal}
    </div>
  </li>`;
}


function teamCard(team, pvp, forms, pvpMoveCatalog = {}) {
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
      return teamMemberRow(member, row, form, forms, pvpMoveCatalog);
    }).join("")}</ol>
    <div class="pvp-team-readout">
      <p class="pvp-team-plan"><strong>Battle plan:</strong> ${escapeHtml(team.plan)}</p>
      <p class="pvp-team-weakness"><strong>Shared weaknesses:</strong> ${escapeHtml(shared)}</p>
      <p class="pvp-team-weakness"><strong>Acknowledged weaknesses:</strong> ${escapeHtml(acknowledged)}</p>
    </div>
    <p class="pvp-sources"><strong>Sources:</strong> ${escapeHtml((team.sourceRefs ?? []).join(", "))}</p>
  </article></li>`;
}


function alternativesView(alternatives, forms, state, trainerLevel = null, pvpMoveCatalog = {}) {
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
      trainerLevel,
      pvpMoveCatalog,
    })).join("")}</ol>
  </section>`;
}


function myTeamOwnedOptions(roster, forms) {
  return [...new Set(roster?.ownedFormIds ?? [])]
    .map((formId) => forms?.[formId] && { formId, name: forms[formId].name })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
}


function myTeamSlotSelect(league, slot, currentFormId, options) {
  return `<label class="pvp-myteam-override">Override
    <select data-my-team-slot="${escapeHtml(slot)}" data-my-team-league="${escapeHtml(league)}">
      <option value="">Auto</option>
      ${options.map((option) => (
        `<option value="${escapeHtml(option.formId)}"${option.formId === currentFormId ? " selected" : ""}>${escapeHtml(option.name)}</option>`
      )).join("")}
    </select>
  </label>`;
}


export function myTeamMoveDeltaLines(member) {
  if (!member?.moveDelta) return [];
  const { fastMoveMissing, fastMoveNeeded, chargedMovesMissing, chargedMovesNeeded } = member.moveDelta;
  const lines = [];
  if (fastMoveMissing) lines.push("Fast move not recorded — add it to check.");
  else if (fastMoveNeeded) lines.push(`needs Fast TM: ${displayMoveName(fastMoveNeeded)}`);
  if (chargedMovesMissing) lines.push("Charged moves not recorded — add them to check.");
  else if (chargedMovesNeeded.length) lines.push(`needs Charged TM: ${chargedMovesNeeded.map(displayMoveName).join(" + ")}`);
  return lines;
}


// Yours-vs-ideal: the owned instance's exact IVs/CP next to the league's
// rank-1 spread, so a player can see at a glance how far off "ideal" they are.
function idealVsYoursLine(member) {
  const ideal = member.row?.rankOne;
  const yours = member.instance;
  if (!ideal || !yours) return "";
  const yourIvs = `${yours.ivs.atk}/${yours.ivs.def}/${yours.ivs.sta}`;
  const idealIvs = `${ideal.ivs.attack}/${ideal.ivs.defense}/${ideal.ivs.stamina}`;
  return `<p class="pvp-myteam-compare">Yours: ${escapeHtml(yourIvs)} IVs @ ${escapeHtml(yours.cp)} CP · Ideal: ${escapeHtml(idealIvs)} IVs @ ${escapeHtml(ideal.cp)} CP</p>`;
}


function myTeamMemberCard(league, slot, member, options, pvpMoveCatalog = {}) {
  if (!member) {
    return `<li class="pvp-myteam-slot pvp-myteam-empty" data-my-team-slot-empty="${escapeHtml(slot)}" data-role="${escapeHtml(slot)}">
      <p class="pvp-myteam-heading"><strong class="pvp-team-role" data-role="${escapeHtml(slot)}">${escapeHtml(slot)}</strong></p>
      <p>No eligible Pokémon owned for this slot yet — star and detail more to fill it.</p>
      ${myTeamSlotSelect(league, slot, "", options)}
    </li>`;
  }
  const moveLines = myTeamMoveDeltaLines(member);
  const quality = member.quality
    ? `<p class="pvp-myteam-quality">${escapeHtml(member.quality.tier)} · ${escapeHtml(member.quality.percent)}% of rank-1 stat product</p>`
    : "";
  const rank = member.instance ? instanceLeagueRank(member.form, member.instance, league, member.row) : null;
  const rankLine = rank?.eligible
    ? `<p class="pvp-myteam-rank">${jargonTerm("stat-product", "IV rank")}: ${escapeHtml(rankSummaryText(rank))}</p>`
    : "";
  const moveCounts = member.row ? moveCountText(member.row.fastMove, member.row.chargedMoves, pvpMoveCatalog) : "";
  return `<li class="pvp-myteam-slot" data-form-id="${escapeHtml(member.formId)}" data-role="${escapeHtml(slot)}">
    ${spriteHtml(member.formId, { [member.formId]: member.form }, member.form?.name ?? member.formId, member.form?.primary_type)}
    <div class="pvp-myteam-body">
      <p class="pvp-myteam-heading"><strong class="pvp-team-role" data-role="${escapeHtml(slot)}">${escapeHtml(slot)}:</strong> ${escapeHtml(member.form?.name ?? member.formId)}${member.roleSource === "generic" ? " <small>(generic guidance — not in this league's ranked list)</small>" : ""}</p>
      <p class="pvp-team-types">${typeChipsFor({ [member.formId]: member.form }, member.formId)}</p>
      <p class="pvp-myteam-eligibility${member.eligibility.assumption ? " pvp-myteam-assumption" : ""}">${member.eligibility.assumption ? "Assumption: " : ""}${escapeHtml(member.eligibility.reason)}</p>
      ${idealVsYoursLine(member)}
      ${quality}
      ${rankLine}
      ${moveLines.length ? `<ul class="pvp-myteam-move-delta">${moveLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
      ${moveCounts ? `<p class="pvp-myteam-move-counts">${escapeHtml(moveCounts)}</p>` : ""}
      ${myTeamSlotSelect(league, slot, member.formId, options)}
    </div>
  </li>`;
}


function myTeamFallback(league, team, forms) {
  if (!team) return `<p class="pvp-empty">No suggested team is available for ${escapeHtml(leagueName(league))} yet.</p>`;
  return `<div class="pvp-myteam-fallback">
    <p><strong>Suggested starting point:</strong> ${escapeHtml(team.name)}</p>
    <ol class="pvp-team-members">${(team.members ?? []).map((member) => (
      `<li><strong>${escapeHtml(member.role)}:</strong> ${escapeHtml(forms?.[member.formId]?.name ?? member.formId)}</li>`
    )).join("")}</ol>
  </div>`;
}


function myTeamSection(league, team, roster, forms, pvpMoveCatalog = {}) {
  const options = myTeamOwnedOptions(roster, forms);
  const cap = LEAGUE_CP_CAP[league];
  return `<section class="pvp-section pvp-myteam" aria-labelledby="pvp-myteam-title-${escapeHtml(league)}" data-my-team-league="${escapeHtml(league)}">
    <p class="status-kicker">Your roster, ranked for this league</p>
    <h2 id="pvp-myteam-title-${escapeHtml(league)}">My Team · ${escapeHtml(leagueName(league))}${cap ? ` (${cap} CP cap)` : " (no CP cap)"}</h2>
    <details class="pvp-roles-teach">
      <summary>What do "Lead," "Safe Switch," and "Closer" mean?</summary>
      <dl>
        <div><dt>Lead</dt><dd>Starts first in the match. Good Leads pressure the opponent early and force them to burn shields — they have fast moves that build toward charged moves quickly, so they gain momentum.</dd></div>
        <div><dt>Safe Switch</dt><dd>Swapped in when you need breathing room. A Safe Switch usually covers weaknesses in your Lead and resists common threats, so it's neutral against most matchups and buys you time.</dd></div>
        <div><dt>Closer</dt><dd>Finishes the match when shields are gone. Closers are strong once they have free rein with charged moves, so they clean up after the early game.</dd></div>
      </dl>
    </details>
    ${team.isEmpty
      ? `<p class="pvp-empty">${escapeHtml(team.fallbackMessage)}</p>${myTeamFallback(league, team.fallbackTeam, forms)}`
      : `<ol class="pvp-myteam-slots">${MY_TEAM_SLOTS.map((slot, index) => myTeamMemberCard(league, slot, team.members[index], options, pvpMoveCatalog)).join("")}</ol>
      ${team.coverageNote ? `<p class="pvp-myteam-coverage">${escapeHtml(team.coverageNote)}</p>` : ""}`}
  </section>`;
}


// PvP instance-conflict warnings: advisory only, never blocking. Built from
// every league's team regardless of the current league filter, since a
// conflict with a league the user isn't currently viewing still matters.
function instanceConflictWarnings(conflicts) {
  if (!conflicts.length) return "";
  return `<div class="pvp-instance-conflicts" role="status">${conflicts.map((conflict) => (
    `<p class="pvp-instance-conflict">This exact ${escapeHtml(conflict.pokemon)} can't be optimized for both `
    + `${conflict.leagues.map((league) => escapeHtml(leagueName(league))).join(" and ")} — consider a second copy.</p>`
  )).join("")}</div>`;
}


function teamsView(pvp, teams, alternatives, forms, roster, state, trainerLevel = null, pvpMoveCatalog = {}) {
  const leagueTeams = state.league === "all"
    ? (teams ?? [])
    : (teams ?? []).filter((team) => team.league === state.league);
  const myTeamLeagues = state.league === "all" ? PVP_LEAGUES : [state.league];
  const teamsByLeague = Object.fromEntries(PVP_LEAGUES.map((league) => [
    league,
    buildMyTeam({
      league, pvp, pvpTeams: teams, roster, forms, overrides: myTeamOverridesFor(roster?.preferences, league),
    }),
  ]));
  const conflicts = detectInstanceConflicts(teamsByLeague);
  return `<p class="pvp-attack-iv-note">Why low Attack IV shows up so often: a lower Attack IV keeps CP under the league cap while leaving room for more Defense and HP — same cap, more bulk.</p>
  ${instanceConflictWarnings(conflicts)}
  ${myTeamLeagues.map((league) => myTeamSection(league, teamsByLeague[league], roster, forms, pvpMoveCatalog)).join("")}
  <section class="pvp-section" aria-labelledby="pvp-teams-title">
    <p class="status-kicker">${leagueTeams.length} current example teams</p>
    <h2 id="pvp-teams-title">${escapeHtml(leagueName(state.league))} team suggestions</h2>
    <p class="pvp-summary">Example teams are plans, not guaranteed wins. Shared and acknowledged weaknesses stay visible.</p>
    <ul class="pvp-team-list">${leagueTeams.map((team) => teamCard(team, pvp, forms, pvpMoveCatalog)).join("")}</ul>
  </section>${alternativesView(alternatives, forms, state, trainerLevel, pvpMoveCatalog)}
  <details class="pvp-full-rankings">
    <summary>Full rankings</summary>
    ${rankingsView(pvp, forms, { ...state, form: "all", investment: "all" }, trainerLevel, pvpMoveCatalog, false)}
  </details>`;
}


export function renderPvp({
  pvp = {}, pvpTeams = [], pvpAlternatives = [], forms = {}, roster = {}, state, trainerLevel = null, pvpMoveCatalog = {},
} = {}) {
  const normalized = createPvpState({ filters: state });
  return `<div class="pvp-view">
    <a class="safe-escape" href="./#pvp">Reset PvP filters</a>
    <a class="safe-escape" href="./#swap">Battle Swap — who should I lead?</a>
    ${controls(normalized)}
    ${normalized.view === "teams"
      ? teamsView(pvp, pvpTeams, pvpAlternatives, forms, roster, normalized, trainerLevel, pvpMoveCatalog)
      : normalized.view === "antimeta"
        ? antiMetaView(pvp, forms, normalized)
        : rankingsView(pvp, forms, normalized, trainerLevel, pvpMoveCatalog)}
  </div>`;
}
