import { escapeHtml, whyLine } from "./home.js";
import { jargonTerm } from "../glossary.js";
import { spriteHtml } from "../sprites.js";
import { displayMoveName, moveLink } from "./move-sheet.js";
import { battleStatsAt, bestLevelUnderCap, buildMyTeam, detectInstanceConflicts, instanceLeagueRank, LEAGUE_CP_CAP, MY_TEAM_SLOTS, myTeamOverridesFor, RANK_MAX_LEVEL, rankSummaryText } from "../pvp-team.js";
import { moveCountsFor } from "../pvp-moves.js";
import { levelCapNote, xlPowerUpCost } from "../raid-target.js";
import { typeChip } from "./types.js";
import { resistancesOf, weaknessesOf } from "../type-chart.js";
import { computeMetaCoverage } from "../meta-coverage.js";


export const PVP_LEAGUES = Object.freeze(["great", "ultra", "master"]);
const PVP_LEAGUE_FILTERS = Object.freeze(["all", ...PVP_LEAGUES]);
const FORM_FILTERS = new Set(["all", "regular", "shadow"]);
const VIEWS = new Set(["rankings", "teams", "antimeta", "theorycraft"]);
const INVESTMENT_FILTERS = new Set(["all", "S+", "S", "A", "B", "C"]);
const ANTI_META_FILTERS = new Set(["all", "countersMeta"]);
// PvPoke-style ranking categories (operator ask 2026-09-14): "overall" is the
// published rank; each role sorts by that role's own pvpoke roleScore — the
// same numbers Anti-Meta already reads, surfaced as a first-class sort.
export const RANKING_CATEGORIES = Object.freeze([
  ["overall", "Overall"], ["Lead", "Leads"], ["Closer", "Closers"], ["Safe Switch", "Switches"],
  ["Shield Pressure", "Chargers"], ["Attack Pressure", "Attackers"], ["Consistency", "Consistency"],
]);
const CATEGORY_FILTERS = new Set(RANKING_CATEGORIES.map(([key]) => key));
const SEARCH_MAX = 40;
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
    antiMeta: allowed(requested.antiMeta, ANTI_META_FILTERS, "all"),
    category: allowed(requested.category, CATEGORY_FILTERS, "overall"),
    q: typeof requested.q === "string" ? requested.q.trim().slice(0, SEARCH_MAX) : "",
  };
}


export function pvpPreferencePayload(state = {}) {
  const normalized = createPvpState({ filters: state });
  return {
    pvp: {
      form: normalized.form,
      investment: normalized.investment,
      league: normalized.league,
      antiMeta: normalized.antiMeta,
      category: normalized.category,
      q: normalized.q,
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
  const needle = normalized.q.toLowerCase();
  const filtered = leagueRows.filter((row) => {
    if (normalized.form === "shadow" && !row.shadow) return false;
    if (normalized.form === "regular" && row.shadow) return false;
    if (normalized.investment !== "all" && row.investmentTier !== normalized.investment) return false;
    if (normalized.antiMeta === "countersMeta" && !countersMeta(row, pvp)) return false;
    if (needle && !String(row.pokemon ?? "").toLowerCase().includes(needle)) return false;
    return true;
  });
  if (normalized.category === "overall") return filtered;
  // Role sort: highest roleScore first; rows without that score sink to the
  // bottom in published order rather than vanishing.
  return [...filtered].sort((left, right) => {
    const l = Number.isFinite(left.roleScores?.[normalized.category]) ? left.roleScores[normalized.category] : -1;
    const r = Number.isFinite(right.roleScores?.[normalized.category]) ? right.roleScores[normalized.category] : -1;
    return r - l || left.rank - right.rank;
  });
}

// The number a ranking row's score bar shows: the category's roleScore, or
// the overall meta-weighted score. Null when the row lacks it.
export function categoryScore(row, category = "overall") {
  if (category === "overall") return Number.isFinite(row?.score) ? row.score : null;
  const value = row?.roleScores?.[category];
  return Number.isFinite(value) ? value : null;
}

// "Fairy Wind 83%" — a move's share of pvpoke's sim usage within its slot
// (fast vs charged), from the row's own moveUsage. Null when unknown.
export function moveUsageShare(row, moveId, kind) {
  const list = row?.moveUsage?.[kind === "Fast" ? "fastMoves" : "chargedMoves"];
  if (!Array.isArray(list) || !list.length) return null;
  const total = list.reduce((sum, entry) => sum + (Number.isFinite(entry?.uses) ? entry.uses : 0), 0);
  const hit = list.find((entry) => entry?.moveId === moveId);
  if (!total || !hit || !Number.isFinite(hit.uses)) return null;
  return Math.round((hit.uses / total) * 100);
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


// Jump nav across the sections a long PvP view actually renders (My Team per
// league, example teams, alternatives) — skipped entirely for a single
// section, where a nav pointing at the section you're already reading is
// noise, not navigation.
function jumpNav(links) {
  if (links.length < 2) return "";
  return `<nav class="jump-nav" aria-label="Jump to a section">
    ${links.map(([id, label]) => `<button type="button" data-action="scroll-to" data-scroll-target="${escapeHtml(id)}">${escapeHtml(label)}</button>`).join("")}
  </nav>`;
}

// Every long section ends with one of these, all pointing at the same
// #pvp-top id on the view's outer wrapper (renderPvp) — same fixed target
// gyms.js's backToTop() uses, so a reader forty cards down is one tap from
// the filters. Buttons + data-action="scroll-to", not <a href="#id">: an
// in-page hash anchor fires the router's hashchange handler, which treats
// the fragment as an unknown route and re-renders Home (see router.js
// resolveRoute — only registered routes survive; raids.js hit this first).
function backToTop(targetId = "pvp-top") {
  return `<div class="jump-nav jump-nav-end"><button type="button" data-action="scroll-to" data-scroll-target="${escapeHtml(targetId)}">↑ Back to top</button></div>`;
}


function filterSelect(name, label, value, choices) {
  return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}" data-pvp-filter="${escapeHtml(name)}">
    ${choices.map(([choice, text]) => `<option value="${escapeHtml(choice)}"${choice === value ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}
  </select></label>`;
}


function controls(state, view) {
  // Rankings-only sticky class: #pvp/rankings is the one PvP view long enough
  // (225 viewports at 390 wide) that its filters scroll out of reach, so only
  // that route gets position:sticky. Scoped here rather than on the shared
  // .pvp-controls class, which Teams/Anti-Meta and home.js's view-segments
  // strip (Attacking/Defending, PvP tabs) also use — those stay static.
  // Rankings: the sticky strip is ONE compact row (search · category ·
  // league) — everything else sits behind a "More filters" disclosure so
  // the sticky bar stops eating the phone viewport (operator ask
  // 2026-09-15). Same data-pvp-filter plumbing, no new event wiring.
  if (view === "rankings") {
    const active = [state.form !== "all", state.investment !== "all", state.antiMeta !== "all"].filter(Boolean).length;
    return `<form class="pvp-controls pvp-controls-sticky pvp-controls-compact" data-pvp-filters aria-label="PvP league and ranking filters">
    <div class="pvp-filter-row">
      <label class="pvp-filter-search"><span class="pvp-filter-label">Search</span><input type="search" name="q" data-pvp-filter="q" value="${escapeHtml(state.q ?? "")}" placeholder="Search name" maxlength="${SEARCH_MAX}" autocomplete="off" aria-label="Search by name"></label>
      <label><span class="pvp-filter-label">Category</span><select name="category" data-pvp-filter="category" aria-label="Category">${RANKING_CATEGORIES.map(([key, text]) => `<option value="${escapeHtml(key)}"${key === state.category ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>
      <label><span class="pvp-filter-label">League</span><select name="league" data-pvp-filter="league" aria-label="League">${PVP_LEAGUE_FILTERS.map((league) => `<option value="${escapeHtml(league)}"${league === state.league ? " selected" : ""}>${escapeHtml(leagueName(league))}</option>`).join("")}</select></label>
    </div>
    <details class="pvp-more-filters"><summary>More filters${active ? ` (${active})` : ""}</summary>
      <div class="pvp-filter-row">
      ${filterSelect("form", "Form", state.form, [["all", "Regular + Shadow"], ["regular", "Regular only"], ["shadow", "Shadow only"]])}
      ${filterSelect("investment", "Investment", state.investment, [["all", "All tiers"], ["S+", "S+"], ["S", "S"], ["A", "A"], ["B", "B"], ["C", "C"]])}
      ${filterSelect("antiMeta", "Meta", state.antiMeta, [["all", "All picks"], ["countersMeta", "Counters the meta"]])}
      </div>
    </details>
  </form>`;
  }
  return `<form class="pvp-controls" data-pvp-filters aria-label="PvP league and ranking filters">
    ${filterSelect("league", "League", state.league, PVP_LEAGUE_FILTERS.map((league) => [league, leagueName(league)]))}
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


// PvPoke's category names for pvpoke's roleScores keys (operator ask
// 2026-09-14: "missing tags like charger, attacker, overall").
const ROLE_TAG_LABEL = Object.freeze({
  "Lead": "Lead", "Safe Switch": "Switch", "Closer": "Closer",
  "Shield Pressure": "Charger", "Attack Pressure": "Attacker", "Consistency": "Consistency",
});

function roleTagsHtml(row) {
  const scores = row?.roleScores ?? {};
  const entries = Object.entries(ROLE_TAG_LABEL)
    .filter(([key]) => Number.isFinite(scores[key]))
    .sort((left, right) => scores[right[0]] - scores[left[0]]);
  if (!entries.length) return "";
  const best = entries[0][0];
  return `<p class="pvp-role-tags">${Number.isFinite(row.score) ? `<span class="pvp-role-tag" data-tag="overall">Overall ${escapeHtml(row.score)}</span>` : ""}${entries.map(([key, label]) => `<span class="pvp-role-tag"${key === best ? ' data-best="true"' : ""}${(row.roles ?? []).includes(key) ? ' data-role="true"' : ""}>${escapeHtml(label)} ${escapeHtml(scores[key])}</span>`).join("")}</p>`;
}

// One move's PvP numbers + a tradeoff line derived from pvpoke's archetype
// and buff fields — never a hand-written opinion. Null stats -> honest gap.
function moveBreakdownRow(moveId, kind, row, catalog, eliteMoves) {
  const stat = catalog?.[moveId];
  const share = moveUsageShare(row, moveId, kind);
  const isFast = kind === "Fast";
  let numbers = "no PvP stats in this data";
  let tradeoff = "";
  if (stat) {
    if (isFast) {
      const dpt = stat.turns ? (stat.power / stat.turns).toFixed(1) : "—";
      const ept = stat.turns ? (stat.energyGain / stat.turns).toFixed(1) : "—";
      numbers = `${stat.power} dmg · +${stat.energyGain} energy · ${stat.turns} turn${stat.turns === 1 ? "" : "s"} → ${dpt} DPT / ${ept} EPT`;
      const eptNum = Number(ept); const dptNum = Number(dpt);
      tradeoff = eptNum >= 4.5 ? "energy engine — reaches charged moves fast, low chip damage"
        : dptNum >= 3 ? "damage fast move — wins fast-move duels, slower to charged moves"
          : "balanced fast move";
    } else {
      const dpe = stat.energy ? (stat.power / stat.energy).toFixed(2) : "—";
      numbers = `${stat.power} power · ${stat.energy} energy → ${dpe} DPE`;
      const arch = stat.archetype ? stat.archetype : "";
      const buff = Array.isArray(stat.buffs)
        ? ` ${stat.buffTarget === "self" ? "self" : "opponent"} ${stat.buffs[0] ? `Atk ${stat.buffs[0] > 0 ? "+" : ""}${stat.buffs[0]}` : ""}${stat.buffs[0] && stat.buffs[1] ? " / " : ""}${stat.buffs[1] ? `Def ${stat.buffs[1] > 0 ? "+" : ""}${stat.buffs[1]}` : ""}${Number.isFinite(stat.buffApplyChance) && stat.buffApplyChance < 1 ? ` (${Math.round(stat.buffApplyChance * 100)}%)` : " (guaranteed)"}`
        : "";
      const costNote = stat.energy <= 40 ? "cheap — bait/shield pressure" : stat.energy >= 60 ? "expensive — one big hit, easy to shield" : "mid cost";
      tradeoff = [arch, costNote].filter(Boolean).join(" · ") + (buff ? ` · buff:${buff}` : "");
    }
  }
  const typeTag = stat?.type ? ` ${typeChip(stat.type)}` : "";
  return `<li class="pvp-move-row" data-kind="${escapeHtml(kind.toLowerCase())}">
    <span class="pvp-move-row-name">${moveWithElite(moveId, eliteMoves, kind)}${typeTag}${share === null ? "" : ` <small class="pvp-usage">${escapeHtml(share)}% of sims</small>`}</span>
    <span class="pvp-move-row-stats">${escapeHtml(numbers)}</span>
    ${tradeoff ? `<span class="pvp-move-row-tradeoff">${escapeHtml(tradeoff)}</span>` : ""}
  </li>`;
}

function moveBreakdownHtml(row, catalog, eliteMoves) {
  const usage = row?.moveUsage ?? {};
  const fastIds = [...new Set([row.fastMove, ...(usage.fastMoves ?? []).map((m) => m.moveId)])].filter(Boolean).slice(0, 3);
  const chargedIds = [...new Set([...(row.chargedMoves ?? []), ...(usage.chargedMoves ?? []).map((m) => m.moveId)])].filter(Boolean).slice(0, 5);
  return `<div class="pvp-move-breakdown">
    <p class="pvp-move-breakdown-title">Move breakdown</p>
    <ul class="pvp-move-rows">${fastIds.map((id) => moveBreakdownRow(id, "Fast", row, catalog, eliteMoves)).join("")}${chargedIds.map((id) => moveBreakdownRow(id, "Charged", row, catalog, eliteMoves)).join("")}</ul>
    <p class="hint">DPT/EPT = damage/energy per turn; DPE = damage per energy. "% of sims" = how often pvpoke's matchup sims chose the move. Archetype and buff wording is pvpoke's own.</p>
  </div>`;
}

// "Why #N" — assembled only from the row's own numbers: score and best
// roles, the sim wins that put it there, what it loses to, and the moveset
// engine. No editorial; every clause traces to a field on the row.
function rankingBriefHtml(row, catalog) {
  const scores = row?.roleScores ?? {};
  const ranked = Object.entries(ROLE_TAG_LABEL).filter(([key]) => Number.isFinite(scores[key])).sort((l, r) => scores[r[0]] - scores[l[0]]);
  const strong = ranked.slice(0, 2).map(([key, label]) => `${label} ${scores[key]}`).join(", ");
  const weak = ranked.length ? `${ROLE_TAG_LABEL[ranked[ranked.length - 1][0]]} ${scores[ranked[ranked.length - 1][0]]}` : "";
  const wins = (row.keyMatchups ?? []).filter((m) => m.rating > 500).slice(0, 4).map((m) => m.opponentName);
  const losses = (row.keyCounters ?? []).slice(0, 4).map((m) => `${m.opponentName} (${m.rating})`);
  const fast = catalog?.[row.fastMove];
  const engine = fast && fast.turns ? `${displayMoveName(row.fastMove)} makes ${(fast.energyGain / fast.turns).toFixed(1)} energy a turn` : "";
  const cheapest = (row.chargedMoves ?? []).map((id) => catalog?.[id]).filter((m) => m && m.energy).sort((a, b) => a.energy - b.energy)[0];
  const counts = moveCountsFor(row.fastMove, row.chargedMoves, catalog);
  const countText = counts.length ? counts.map(({ chargedMoveId, count }) => `${count} to ${displayMoveName(chargedMoveId)}`).join(", ") : "";
  return `<div class="pvp-why">
    <p><strong>Why #${escapeHtml(row.rank)}:</strong> ${escapeHtml(row.primaryRole ?? "")}${strong ? ` — strongest as ${escapeHtml(strong)}` : ""}${weak ? `, weakest as ${escapeHtml(weak)}` : ""}. ${Number.isFinite(row.score) ? `Meta-weighted score ${escapeHtml(row.score)}.` : ""}</p>
    ${wins.length ? `<p><strong>Strong because it beats:</strong> ${escapeHtml(wins.join(", "))}.</p>` : ""}
    ${engine ? `<p><strong>Engine:</strong> ${escapeHtml(engine)}${cheapest ? `; cheapest charged move ${escapeHtml(cheapest.energy)} energy` : ""}${countText ? ` (${escapeHtml(countText)})` : ""}.</p>` : ""}
    ${losses.length ? `<p><strong>Watch out for:</strong> ${escapeHtml(losses.join(", "))}.</p>` : ""}
  </div>`;
}

// Trait chips (operator ask 2026-09-14: "extremely bulky, spammy, dynamic").
// Every rule is stated in TRAIT_RULES so a chip is always explainable:
//   Extremely bulky / Bulky — rank-1 stat product in the league's top 5% / 20%
//   Glass — Attack share of rank-1 battle stats in the league's top 15%
//   Spammy — fast EPT >= 4 and cheapest ranked charged move <= 35 energy
//   Nuke — a ranked charged move >= 100 power (or pvpoke archetype Nuke)
//   Dynamic — a ranked move carries a buff/debuff effect
//   Coverage — ranked charged moves hit 2+ types outside its own typing
//   Shield pressure / Consistent — that pvpoke roleScore in the league's top 20%
export const TRAIT_RULES = Object.freeze({
  "Extremely bulky": "rank-1 stat product in this league's top 5%",
  "Bulky": "rank-1 stat product in this league's top 20%",
  "Glass": "Attack-heavy: rank-1 Attack share in this league's top 15%",
  "Spammy": "fast move ≥ 4 energy/turn and a ranked charged move ≤ 35 energy",
  "Nuke": "a ranked charged move of 100+ power",
  "Dynamic": "a ranked move with a buff or debuff effect",
  "Coverage": "ranked charged moves hit 2+ types outside its own typing",
  "Shield pressure": "pvpoke Shield Pressure score in this league's top 20%",
  "Consistent": "pvpoke Consistency score in this league's top 20%",
  // Negatives (operator ask 2026-09-14) — same discipline, rendered as warnings.
  "Frail": "rank-1 stat product in this league's bottom 20%",
  "Slow": "longest ranked charged-move cycle is 13+ fast-move turns",
  "Energy-starved": "fast move makes ≤ 3.5 energy per turn",
  "Double weakness": "a ×2.56 hole in its typing",
  "Exposed typing": "5 or more type weaknesses",
  "One-dimensional": "both ranked charged moves share a type",
  "Elite TM build": "the ranked moveset needs an Elite TM",
  "XL build": "the rank-1 spread needs XL candy or Best Buddy",
});
export const NEGATIVE_TRAITS = new Set(["Glass", "Frail", "Slow", "Energy-starved", "Double weakness", "Exposed typing", "One-dimensional", "Elite TM build", "XL build"]);

function percentileWithin(values, value) {
  const sorted = [...values].filter(Number.isFinite).sort((l, r) => r - l);
  if (!sorted.length || !Number.isFinite(value)) return null;
  return sorted.findIndex((v) => v <= value) / sorted.length; // 0 = best
}

export function traitsFor(row, leagueRows, catalog, forms) {
  const traits = [];
  const products = (leagueRows ?? []).map((r) => r.rankOne?.statProduct);
  const spPct = percentileWithin(products, row.rankOne?.statProduct);
  if (spPct !== null && spPct <= 0.05) traits.push("Extremely bulky");
  else if (spPct !== null && spPct <= 0.2) traits.push("Bulky");
  const atkShare = (r) => { const b = r.rankOne?.battleStats; return b && b.attack && b.defense ? b.attack / (b.attack + b.defense) : null; };
  const shares = (leagueRows ?? []).map(atkShare);
  const sharePct = percentileWithin(shares, atkShare(row));
  if (sharePct !== null && sharePct <= 0.15) traits.push("Glass");
  const fast = catalog?.[row.fastMove];
  const charged = (row.chargedMoves ?? []).map((id) => catalog?.[id]).filter(Boolean);
  const cheapest = charged.length ? Math.min(...charged.map((m) => m.energy || 999)) : 999;
  if (fast && fast.turns && fast.energyGain / fast.turns >= 4 && cheapest <= 35) traits.push("Spammy");
  if (charged.some((m) => m.power >= 100 || m.archetype === "Nuke")) traits.push("Nuke");
  if ([fast, ...charged].some((m) => m && Array.isArray(m.buffs))) traits.push("Dynamic");
  const own = new Set([forms?.[row.formId]?.primary_type, forms?.[row.formId]?.secondary_type].filter(Boolean).map((t) => t.toLowerCase()));
  const offTypes = new Set(charged.map((m) => (m.type || "").toLowerCase()).filter((t) => t && !own.has(t)));
  if (offTypes.size >= 2) traits.push("Coverage");
  for (const [key, label] of [["Shield Pressure", "Shield pressure"], ["Consistency", "Consistent"]]) {
    const pct = percentileWithin((leagueRows ?? []).map((r) => r.roleScores?.[key]), row.roleScores?.[key]);
    if (pct !== null && pct <= 0.2) traits.push(label);
  }
  // Negatives.
  if (spPct !== null && spPct >= 0.8) traits.push("Frail");
  if (fast && fast.turns && charged.length) {
    const ept = fast.energyGain / fast.turns;
    const longest = Math.max(...charged.map((m) => m.energy || 0));
    if (ept > 0 && longest / ept >= 13) traits.push("Slow");
    if (ept <= 3.5) traits.push("Energy-starved");
  }
  const weak = weaknessesOf([...own].map((t) => t[0].toUpperCase() + t.slice(1)));
  if (weak.some((w) => w.multiplier >= 2.5)) traits.push("Double weakness");
  if (weak.length >= 5) traits.push("Exposed typing");
  const chargedTypes = new Set(charged.map((m) => (m.type || "").toLowerCase()).filter(Boolean));
  if (charged.length >= 2 && chargedTypes.size === 1) traits.push("One-dimensional");
  if (row.eliteFastTM || row.eliteChargedTM) traits.push("Elite TM build");
  if (row.rankOne?.xlRequired || row.rankOne?.bestBuddyRequired) traits.push("XL build");
  return traits;
}

// The one yardstick everyone owns (Twitch drop, 2026-08): a 2/7/11 Tinkaton.
// Powered to this league's cap, its Atk/Def/HP are the baseline a row's
// rank-1 build is compared against — stats only; the full sim matchup isn't
// published, so no rating is claimed.
const BASELINE = Object.freeze({ formId: "0959-normal", name: "the free Tinkaton (2/7/11)", ivs: { atk: 2, def: 7, sta: 11 } });

export function baselineComparison(row, forms) {
  const base = forms?.[BASELINE.formId]; const b = row?.rankOne?.battleStats;
  if (!base || !b || !row?.league) return null;
  const cap = LEAGUE_CP_CAP[row.league]; const maxLevel = RANK_MAX_LEVEL[row.league] ?? 50;
  const level = cap === null ? maxLevel : bestLevelUnderCap(base, BASELINE.ivs, cap, maxLevel);
  if (level === null) return null;
  const t = battleStatsAt(base, BASELINE.ivs, level);
  const pct = (a, c) => Math.round(((a - c) / c) * 100);
  return {
    level, statProductPct: Math.round((b.attack * b.defense * b.hp) / (t.attack * t.defense * t.hp) * 100),
    attackPct: pct(b.attack, t.attack), defensePct: pct(b.defense, t.defense), hpPct: pct(b.hp, t.hp),
  };
}

function baselineLineHtml(row, forms) {
  const c = baselineComparison(row, forms);
  if (!c) return "";
  const sign = (n) => `${n > 0 ? "+" : ""}${n}%`;
  return `<p class="pvp-baseline"><strong>vs ${escapeHtml(BASELINE.name)} @L${escapeHtml(c.level)}:</strong> ${escapeHtml(c.statProductPct)}% stat product · Atk ${escapeHtml(sign(c.attackPct))} · Def ${escapeHtml(sign(c.defensePct))} · HP ${escapeHtml(sign(c.hpPct))}</p>`;
}

function traitChipsHtml(traits) {
  if (!traits.length) return "";
  return `<p class="pvp-traits">${traits.map((t) => `<span class="pvp-trait"${NEGATIVE_TRAITS.has(t) ? ' data-negative="true"' : ""} title="${escapeHtml(TRAIT_RULES[t] ?? "")}">${escapeHtml(t)}</span>`).join("")}</p>`;
}

// Fuller Details (operator ask 2026-09-14): typing with weaknesses and
// resistances, base + rank-1 battle stats, the top spreads, and similar
// picks from the same league (shared primary role and a shared type first,
// then shared type).
function typingBlockHtml(row, forms) {
  const form = forms?.[row.formId];
  const types = [form?.primary_type, form?.secondary_type].filter(Boolean);
  if (!types.length) return "";
  const weak = weaknessesOf(types); const resist = resistancesOf(types);
  const fmt = (list) => list.map((e) => `${typeChip(e.type)}${e.multiplier >= 2.5 || e.multiplier <= 0.4 ? `<small>${escapeHtml(e.multiplier >= 2.5 ? "×2.56" : "×0.39")}</small>` : ""}`).join(" ");
  return `<div class="pvp-typing"><p class="pvp-detail-title">Typing</p>
    <p>${types.map(typeChip).join(" ")}${types.length > 1 ? ` <small>(${escapeHtml(types[0])} primary, ${escapeHtml(types[1])} secondary)</small>` : ""}</p>
    <p><strong>Weak to:</strong> ${weak.length ? fmt(weak) : "nothing"}</p>
    <p><strong>Resists:</strong> ${resist.length ? fmt(resist) : "nothing"}</p></div>`;
}

function statsBlockHtml(row, forms) {
  const form = forms?.[row.formId]; const b = row.rankOne?.battleStats;
  if (!form) return "";
  return `<div class="pvp-basestats"><p class="pvp-detail-title">Stats</p>
    <p><strong>Base:</strong> ${escapeHtml(form.base_attack)} Atk · ${escapeHtml(form.base_defense)} Def · ${escapeHtml(form.base_stamina)} Sta</p>
    ${b ? `<p><strong>At rank-1 build:</strong> ${escapeHtml(Math.round(b.attack))} Atk · ${escapeHtml(Math.round(b.defense))} Def · ${escapeHtml(b.hp)} HP</p>` : ""}
    ${baselineLineHtml(row, forms)}</div>`;
}

function topSpreadsHtml(row) {
  const spreads = row.topSpreads ?? [];
  if (!spreads.length) return "";
  return `<div class="pvp-topspreads"><p class="pvp-detail-title">Best IV spreads</p>
    <ol class="pvp-spread-list">${spreads.map((s) => `<li>${escapeHtml(`${s.ivs.attack}/${s.ivs.defense}/${s.ivs.stamina}`)} <small>L${escapeHtml(s.level)} · ${escapeHtml(s.cp)} CP</small></li>`).join("")}</ol></div>`;
}

function similarPicksHtml(row, leagueRows, forms) {
  const own = new Set([forms?.[row.formId]?.primary_type, forms?.[row.formId]?.secondary_type].filter(Boolean));
  const shareType = (r) => [forms?.[r.formId]?.primary_type, forms?.[r.formId]?.secondary_type].some((t) => t && own.has(t));
  const others = (leagueRows ?? []).filter((r) => r.formId !== row.formId && r.formId?.split("-")[0] !== row.formId?.split("-")[0]);
  const tier1 = others.filter((r) => r.primaryRole === row.primaryRole && shareType(r));
  const tier2 = others.filter((r) => !tier1.includes(r) && shareType(r));
  const picks = [...tier1, ...tier2].slice(0, 4);
  if (!picks.length) return "";
  return `<div class="pvp-similar"><p class="pvp-detail-title">Similar picks in this league</p>
    <p>${picks.map((r) => `<a href="./#dex/${encodeURIComponent(r.formId)}" data-route="dex">${escapeHtml(r.pokemon)}</a> <small>#${escapeHtml(r.rank)} · ${escapeHtml(r.primaryRole)}</small>`).join(" · ")}</p></div>`;
}

// Usage share suffix for a ranked move ("83%"), silent when unknown.
function usageTag(row, moveId, kind) {
  const share = moveUsageShare(row, moveId, kind);
  return share === null ? "" : ` <small class="pvp-usage">${escapeHtml(share)}%</small>`;
}

// Compact PvPoke-style row (operator ask 2026-09-14): rank, sprite, name,
// types, a native <meter> score bar (no inline styles — CSP), the ranked
// moveset with sim-usage shares, then the full card body behind a Details
// disclosure. Every field the old card showed is still rendered.
function pvpCard(row, forms, {
  showLeague = false, publishedRank = false, trainerLevel = null, pvpMoveCatalog = {}, showMatchups = true, category = "overall", leagueRows = null,
} = {}) {
  const rankOne = row.rankOne ?? {};
  const ivs = rankOne.ivs ?? {};
  const eliteMoves = new Set(forms?.[row.formId]?.elite_moves ?? []);
  const cardId = `pvp-${row.league}-${row.rank}-${row.formId}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const moveCounts = moveCountText(row.fastMove, row.chargedMoves, pvpMoveCatalog);
  const score = categoryScore(row, category);
  const scoreLabel = category === "overall" ? "Score" : `${category} score`;
  return `<li class="pvp-card" data-form-id="${escapeHtml(row.formId)}">
    <article aria-labelledby="${cardId}">
      ${showLeague ? `<p class="pvp-league-label">${escapeHtml(leagueName(row.league))}</p>` : ""}
      <div class="pvp-card-heading">${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}<p class="pvp-rank">${publishedRank ? "Published rank " : ""}#${escapeHtml(row.rank)}</p><h3 id="${cardId}">${escapeHtml(row.pokemon)}</h3>${score === null ? "" : `<span class="pvp-score"><meter class="pvp-score-meter" min="0" max="100" value="${escapeHtml(score)}" aria-label="${escapeHtml(scoreLabel)}"></meter><b>${escapeHtml(score)}</b></span>`}</div>
      <p class="pvp-types">${typeChipsFor(forms, row.formId)}${row.shadow ? ` <strong>${jargonTerm("shadow", "Shadow")}</strong>` : ""}</p>
      <p class="pvp-moveset-line">${moveWithElite(row.fastMove, eliteMoves, "Fast")}${usageTag(row, row.fastMove, "Fast")} / ${(row.chargedMoves ?? []).map((move) => `${moveWithElite(move, eliteMoves, "Charged")}${usageTag(row, move, "Charged")}`).join(" + ")}</p>
      ${roleTagsHtml(row)}
      ${traitChipsHtml(traitsFor(row, leagueRows, pvpMoveCatalog, forms))}
      ${rankingBriefHtml(row, pvpMoveCatalog)}
      <details class="pvp-card-details"><summary>Details</summary>
      <div class="pvp-detail-grid">
      ${typingBlockHtml(row, forms)}
      ${statsBlockHtml(row, forms)}
      ${topSpreadsHtml(row)}
      ${moveBreakdownHtml(row, pvpMoveCatalog, eliteMoves)}
      ${similarPicksHtml(row, leagueRows, forms)}
      </div>
      <p class="pvp-types-text">${escapeHtml(typesFor(forms, row.formId))}${row.shadow ? ` · <strong>${jargonTerm("shadow", "Shadow form")}</strong>` : " · Regular form"}</p>
      <p class="pvp-detail-title">Ranked moveset</p>
      <dl class="pvp-moves">
        <div><dt>${jargonTerm("fast-move", "Fast move")}</dt><dd>${moveWithElite(row.fastMove, eliteMoves, "Fast")}</dd></div>
        <div><dt>${jargonTerm("charged-move", "Charged moves")}</dt><dd>${(row.chargedMoves ?? []).map((move) => moveWithElite(move, eliteMoves, "Charged")).join(" + ")}</dd></div>
        ${row.recommendedMoveset ? `<div class="pvp-recommended"><dt>PvPoke's pick</dt><dd>${moveWithElite(row.recommendedMoveset.fastMove, eliteMoves, "Fast")} / ${(row.recommendedMoveset.chargedMoves ?? []).map((move) => moveWithElite(move, eliteMoves, "Charged")).join(" + ")} <small class="hint">(the set above is the most-used in sims; this is PvPoke's editorial recommendation)</small></dd></div>` : ""}
      </dl>
      ${moveCounts ? `<p class="pvp-move-counts">${escapeHtml(moveCounts)}</p>` : ""}
      <p class="pvp-detail-title">Rank-1 build</p>
      <dl class="pvp-stats" aria-label="Independently calculated rank-1 IVs">
        <div><dt>${jargonTerm("iv", "Rank-1 IVs")}</dt><dd>${escapeHtml(`${ivs.attack ?? "—"}/${ivs.defense ?? "—"}/${ivs.stamina ?? "—"}`)}</dd></div>
        <div><dt>Level</dt><dd>${escapeHtml(rankOne.level ?? "—")}</dd></div>
        <div><dt>${jargonTerm("cp", "CP")}</dt><dd>${escapeHtml(rankOne.cp ?? "—")}</dd></div>
        <div><dt>${jargonTerm("stat-product", "Stat product")}</dt><dd>${escapeHtml(rankOne.statProduct ?? "—")}</dd></div>
        <div><dt>${jargonTerm("candy", "XL")}</dt><dd>${yesNo(rankOne.xlRequired)}</dd></div>
        <div><dt>Best Buddy</dt><dd>${yesNo(rankOne.bestBuddyRequired)}</dd></div>
      </dl>
      ${endgamePowerUpLine(row, trainerLevel)}
      ${whyLine(row.whyRanked)}
      <p class="pvp-detail-title">Guidance</p>
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


// Plain-language definitions for every tag a ranking row can carry
// (operator ask 2026-09-15 — hover titles don't exist on a phone).
const ROLE_TAG_DEFINITIONS = Object.freeze([
  ["Overall", "pvpoke's meta-weighted score — how well it does across the whole meta, shields and all"],
  ["Lead", "how well it opens a match: wins the first fight or forces a switch"],
  ["Switch", "how well it comes in on a bad matchup and turns it around (safe swap)"],
  ["Closer", "how well it finishes with shields down"],
  ["Charger", "shield pressure — how fast it forces the opponent to shield"],
  ["Attacker", "raw damage output against the meta"],
  ["Consistency", "how little the result depends on shield/energy guessing games"],
]);

function tagLegendHtml() {
  const positives = Object.entries(TRAIT_RULES).filter(([name]) => !NEGATIVE_TRAITS.has(name));
  const negatives = Object.entries(TRAIT_RULES).filter(([name]) => NEGATIVE_TRAITS.has(name));
  return `<details class="pvp-legend"><summary>What the tags mean</summary>
    <p class="pvp-detail-title">Role scores (pvpoke categories, 0–100)</p>
    <dl class="pvp-legend-list">${ROLE_TAG_DEFINITIONS.map(([name, def]) => `<div><dt><span class="pvp-role-tag">${escapeHtml(name)}</span></dt><dd>${escapeHtml(def)}</dd></div>`).join("")}</dl>
    <p class="pvp-detail-title">Traits</p>
    <dl class="pvp-legend-list">${positives.map(([name, rule]) => `<div><dt><span class="pvp-trait">${escapeHtml(name)}</span></dt><dd>${escapeHtml(rule)}</dd></div>`).join("")}</dl>
    <p class="pvp-detail-title">Warnings</p>
    <dl class="pvp-legend-list">${negatives.map(([name, rule]) => `<div><dt><span class="pvp-trait" data-negative="true">${escapeHtml(name)}</span></dt><dd>${escapeHtml(rule)}</dd></div>`).join("")}</dl>
    <p class="hint">Bulk/pressure traits are percentiles within this league's top 50; move traits read the ranked moveset. "% of sims" on a move is how often pvpoke's matchup sims chose it.</p>
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
    <p class="pvp-summary">Showing ${rows.length} of ${allRows.length}. Regular and Shadow forms remain separate exact-form entries.${state.category !== "overall" ? ` Sorted by ${escapeHtml(state.category)} score (pvpoke roleScores) — # stays the published overall rank.` : ""}${state.q ? ` Search: “${escapeHtml(state.q)}”.` : ""}</p>
    ${state.antiMeta === "countersMeta" ? `<p class="pvp-antimeta-teach">Showing Top 50 picks with a favorable PvPoke matchup against ${jargonTerm("meta-leaders", "the meta")} (top ${META_LEADER_COUNT} by rank in this league).</p>` : ""}
    ${tagLegendHtml()}
    ${leaguesShown.map((league) => metaPressureSection(league, pvp, forms)).join("")}
    ${rows.length
      ? `<ol class="pvp-card-list">${rows.map((row) => pvpCard(row, forms, { showLeague: state.league === "all", trainerLevel, pvpMoveCatalog, showMatchups, category: state.category, leagueRows: pvp?.[row.league] ?? [] })).join("")}</ol>${backToTop()}`
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
    ${backToTop()}
  </section>`;
}


function antiMetaView(pvp, forms, state) {
  const leagues = state.league === "all" ? PVP_LEAGUES : [state.league];
  const sections = leagues.map((league) => antiMetaLeagueSection(pvp, forms, league)).filter(Boolean);
  if (!sections.length) return `<p class="pvp-empty">No PvP rankings are available yet for the anti-meta board.</p>`;
  const links = leagues
    .filter((league) => (pvp?.[league] ?? []).length)
    .map((league) => [`pvp-antimeta-title-${league}`, leagueName(league)]);
  return `${jumpNav(links)}${sections.join("")}`;
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
    ${backToTop()}
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
    ${backToTop()}
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
  const alternativeRows = state.league === "all" ? (alternatives ?? []) : (alternatives ?? []).filter((row) => row.league === state.league);
  const sectionLinks = [
    ...myTeamLeagues.map((league) => [`pvp-myteam-title-${league}`, `My Team · ${leagueName(league)}`]),
    ["pvp-teams-title", "Example teams"],
    ...(alternativeRows.length ? [["pvp-alternatives-title", "Alternatives"]] : []),
  ];
  return `${jumpNav(sectionLinks)}
  <p class="pvp-attack-iv-note">Why low Attack IV shows up so often: a lower Attack IV keeps CP under the league cap while leaving room for more Defense and HP — same cap, more bulk.</p>
  ${instanceConflictWarnings(conflicts)}
  ${myTeamLeagues.map((league) => myTeamSection(league, teamsByLeague[league], roster, forms, pvpMoveCatalog)).join("")}
  <section class="pvp-section" aria-labelledby="pvp-teams-title">
    <p class="status-kicker">${leagueTeams.length} current example teams</p>
    <h2 id="pvp-teams-title">${escapeHtml(leagueName(state.league))} team suggestions</h2>
    <p class="pvp-summary">Example teams are plans, not guaranteed wins. Shared and acknowledged weaknesses stay visible.</p>
    <ul class="pvp-team-list">${leagueTeams.map((team) => teamCard(team, pvp, forms, pvpMoveCatalog)).join("")}</ul>
    ${backToTop()}
  </section>${alternativesView(alternatives, forms, state, trainerLevel, pvpMoveCatalog)}
  <details class="pvp-full-rankings" data-lazy="pvp-full-rankings">
    <summary>Full rankings</summary>
    <div class="lazy-body"></div>
  </details>`;
}


// This closed <details> was 14,185 of #pvp's 15,717 elements — 90.6% of the
// route's DOM, built eagerly so it could sit collapsed. Same deferral the Gyms
// tier sections use (app.js's onLazyToggle builds the body on first open).
// Exported rather than inlined because that handler lives in app.js and needs
// pvp/trainerLevel/pvpMoveCatalog/league, none of which the gym lazy context
// carried — which is why this could not be fixed from inside views/ alone.
export function buildPvpFullRankings(context = {}) {
  const { pvp = {}, forms = {}, pvpState = {}, trainerLevel = null, pvpMoveCatalog = {} } = context;
  return rankingsView(pvp, forms, { ...pvpState, form: "all", investment: "all" }, trainerLevel, pvpMoveCatalog, false);
}


// `view` comes from the route (#pvp/rankings), not from state: which question
// you are asking is a URL fact, the league/form/investment filters narrowing
// the answer are not. A bare #pvp is Teams. Battle Swap is a segment of that
// strip now; the "Reset PvP filters" link is gone because it never reset any —
// it pointed at ./#pvp, which re-renders with the same persisted filters.
// Next-season theorycraft (operator ask 2026-09-01): what the rebalance
// changes (from -> to) and who rises where, BEFORE computed rankings exist.
// Every card is labeled a projection; the re-base retires this content.
const THEORYCRAFT_LEAGUE_LABEL = Object.freeze({
  great: "Great League", ultra: "Ultra League", master: "Master League",
});

// Computed-standing line for a projection card: the projection was written
// before the season's rankings existed; once the re-base lands, the card
// shows what the sims actually said next to what we guessed.
function theorycraftComputedLine(row, pvp) {
  const rows = pvp?.[row.league];
  if (!Array.isArray(rows) || !rows.length) return "";
  const hit = rows.find((entry) => entry.formId === row.formId);
  return `<p class="tc-computed">Computed now: ${hit ? `<strong>#${escapeHtml(hit.rank)}</strong> in the published ${escapeHtml(THEORYCRAFT_LEAGUE_LABEL[row.league] ?? row.league)} rows` : "not in the published top rows"}</p>`;
}

function theorycraftView(theorycraft, forms, pvp) {
  const season = theorycraft?.season ?? {};
  const changes = theorycraft?.moveChanges ?? [];
  const projections = theorycraft?.projections ?? [];
  if (!changes.length && !projections.length) {
    return `<div class="fallback-section"><p class="briefing-note">No next-season theorycraft on file yet — it lands when a rebalance is announced.</p></div>`;
  }
  const leagues = ["great", "ultra", "master"]
    .map((league) => ({ league, rows: projections.filter((row) => row.league === league) }))
    .filter((group) => group.rows.length);
  const tally = { hit: 0, partial: 0, miss: 0 };
  for (const row of projections) if (row.verdict in tally) tally[row.verdict] += 1;
  const scored = tally.hit + tally.partial + tally.miss;
  const scorecard = scored
    ? `<div class="tc-scorecard"><p class="status-kicker">Post-mortem</p><p class="tc-scorecard-line"><span data-verdict="hit">${tally.hit} hit</span> · <span data-verdict="partial">${tally.partial} partial</span> · <span data-verdict="miss">${tally.miss} miss</span> of ${scored} projections</p>${theorycraft?.postMortemNote ? `<p class="briefing-note">${escapeHtml(theorycraft.postMortemNote)}</p>` : ""}</div>`
    : "";
  return `<div class="fallback-section theorycraft-view">
    <p class="status-kicker">Next season: ${escapeHtml(season.name ?? "rebalance")}</p>
    <p class="briefing-note">${escapeHtml(`${season.startsAt ?? ""} → ${season.endsAt ?? ""}`)} · Projections, not rankings — the computed re-base replaces this once the season's data ships.</p>
    ${scorecard}
    ${leagues.map(({ league, rows }) => `<h2 class="tc-league-heading">${escapeHtml(THEORYCRAFT_LEAGUE_LABEL[league])}</h2>
      ${rows.map((row) => `<div class="tc-card" data-call="${escapeHtml(row.call ?? "")}"${row.verdict ? ` data-verdict="${escapeHtml(row.verdict)}"` : ""}>
        <div class="pvp-card-heading">${spriteHtml(row.formId, forms, row.name, forms?.[row.formId]?.primary_type)}<h3><a href="./#dex/${encodeURIComponent(row.formId)}" data-route="dex">${escapeHtml(row.name)}</a></h3><p class="tc-call">${escapeHtml(row.call ?? "")}${row.verdict ? ` <span class="tc-verdict" data-verdict="${escapeHtml(row.verdict)}">${escapeHtml(row.verdict)}</span>` : ""}</p></div>
        ${row.newMove ? `<p class="tc-new-move">New move: <strong>${escapeHtml(row.newMove)}</strong></p>` : ""}
        <p class="briefing-note">${escapeHtml(row.why ?? "")}</p>
        ${row.targetIvs ? `<p class="tc-ivs">Target IVs: ${escapeHtml(row.targetIvs)}</p>` : ""}
        ${theorycraftComputedLine(row, pvp)}
        ${row.postMortem ? `<p class="tc-postmortem"><strong>Post-mortem:</strong> ${escapeHtml(row.postMortem)}</p>` : ""}
      </div>`).join("")}`).join("")}
    <h2 class="tc-league-heading">Every announced move change</h2>
    <div class="tc-move-table">
      ${changes.map((row) => `<div class="tc-move-row" data-direction="${escapeHtml(row.direction ?? "")}">
        <p class="tc-move-name">${escapeHtml(row.move)} <span class="tc-move-type">${escapeHtml(row.type ?? "")}</span> <span class="tc-move-direction">${escapeHtml(row.direction ?? "")}</span></p>
        <p class="briefing-note">${escapeHtml(`${row.from} → ${row.to}`)}${row.note ? escapeHtml(` — ${row.note}`) : ""}</p>
      </div>`).join("")}
    </div>
    <p class="tl-honesty">Values are the announced trainer-battle numbers; exact energy costs were not published for every change. Source: the season announcement.</p>
  </div>`;
}

export function renderPvp({
  pvp = {}, pvpTeams = [], pvpAlternatives = [], forms = {}, roster = {}, state, view = "", trainerLevel = null, pvpMoveCatalog = {}, pvpTheorycraft = null,
} = {}) {
  const normalized = createPvpState({ filters: state });
  const activeView = allowed(view, VIEWS, "teams");
  return `<div class="pvp-view" id="pvp-top">
    ${activeView === "theorycraft" ? "" : controls(normalized, activeView)}
    ${activeView === "teams"
      ? teamsView(pvp, pvpTeams, pvpAlternatives, forms, roster, normalized, trainerLevel, pvpMoveCatalog)
      : activeView === "antimeta"
        ? antiMetaView(pvp, forms, normalized)
        : activeView === "theorycraft"
          ? theorycraftView(pvpTheorycraft, forms, pvp)
          : rankingsView(pvp, forms, normalized, trainerLevel, pvpMoveCatalog)}
  </div>`;
}
