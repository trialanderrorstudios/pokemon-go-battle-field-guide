// Trade Planner view — renders trade-planner.js's bait/per-friend plan, plus
// the "What will this trade roll?" odds evaluator. Pure render: no route/
// menu/dispatch wiring here (see app.js for that).
import { tradePlan, tradeRollOdds } from "../trade-planner.js";
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { searchOpponentForms } from "../swap.js";

const ROLL_RESULT_CAP = 40;

// Trade-ineligible forms shouldn't appear as "pick a species to trade" —
// same shadow/mythical rule profiles.js's tradeSuggestions uses, plus mega
// forms (a temporary battle state, not a tradeable species in its own
// right), same multi-signal check cup-team.js's isMega uses.
function isTradeableForm(form) {
  if (form.shadow) return false;
  const tags = form.tags ?? [];
  if (tags.includes("mythical") || tags.includes("mega")) return false;
  if (form.form_id?.includes("-mega") || (form.name ?? "").includes("(Mega")) return false;
  return true;
}

// Species picker — same data-*-query/result-card pattern as Spread Checker's
// picker (views/spreadcheck.js), namespaced to "traderoll".
function rollResultsHtml(query, forms) {
  const results = searchOpponentForms(query, forms).filter(isTradeableForm).slice(0, ROLL_RESULT_CAP);
  if (!results.length) {
    return query ? `<p class="pvp-empty">No Pokémon match that search — check the spelling or try just the first few letters.</p>` : "";
  }
  const cards = results.map((form) => `<button type="button" class="fallback-section swap-opponent-card" data-action="traderoll-pick" data-traderoll-form-id="${escapeHtml(form.form_id)}">
    ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
    <span>${escapeHtml(form.name)}</span>
  </button>`).join("");
  const more = results.length === ROLL_RESULT_CAP ? "<p>Keep typing to narrow the list.</p>" : "";
  return `${more}<div class="home-task-grid swap-opponent-grid">${cards}</div>`;
}

function rollPickerHtml(form, query, forms) {
  if (form) {
    return `<div class="spreadcheck-picker fallback-section">
      ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
      <span>${escapeHtml(form.name)}</span>
      <button type="button" data-action="traderoll-pick" data-traderoll-form-id="">Change</button>
    </div>`;
  }
  return `<div class="spreadcheck-picker">
    <label class="swap-search">Pick a species
      <input type="search" data-traderoll-query value="${escapeHtml(query ?? "")}" placeholder="Search by name" autocomplete="off">
    </label>
    ${rollResultsHtml(query, forms)}
  </div>`;
}

function leagueTop100Text(label, pctOrNull) {
  return pctOrNull === null ? `${label}: — (can't reach the cap)` : `${label}: ${pctOrNull}%`;
}

function rollTierRow(row) {
  return `<li class="instance-row"><h4>${escapeHtml(row.tier)}</h4>
    <p>IV floor ${row.floor}/${row.floor}/${row.floor} — Hundo: ${row.hundoCount} in ${row.total} · 3★ or better (IV sum ≥ 37): ${row.threeStarPct}% · ${escapeHtml(leagueTop100Text("Great League top 100", row.greatTop100Pct))} · ${escapeHtml(leagueTop100Text("Ultra League top 100", row.ultraTop100Pct))}</p>
  </li>`;
}

// "Which of your spares to send" — reuses the Profiles page's already-
// computed cross-account trade suggestions (tradeSuggestions, profiles.js)
// filtered to this species, instead of triggering a second async roster
// load. Renders nothing until that comparison has actually been run.
function spareOffersHtml(formId, profileCompare, profiles) {
  if (profileCompare?.status !== "done" || !profiles?.profiles?.length) return "";
  const matches = profileCompare.suggestions.filter((s) => s.formId === formId);
  if (!matches.length) return "";
  const names = Object.fromEntries(profiles.profiles.map((p) => [p.id, p.name]));
  const rows = matches.map((s) => `<li class="instance-row">${escapeHtml(names[s.from] ?? s.from)} → ${escapeHtml(names[s.to] ?? s.to)}${s.legacyMove ? ` — carries ${escapeHtml(s.legacyMove.toLowerCase().split("_").join(" "))}` : ""}</li>`).join("");
  return `<h3>Which of your spares to send</h3><ul class="instance-list">${rows}</ul>`;
}

function rollSectionHtml({ state = {}, forms = {}, profileCompare = null, profiles = null }) {
  const form = forms[state.formId] ?? null;
  const odds = form ? tradeRollOdds(form) : [];
  return `<h3>What will this trade roll?</h3>
    <p>Exact odds, not a sample — every possible re-roll (attack/defense/stamina each independent and uniform from the friendship tier's IV floor up to 15) for the species you pick below. Floors are community-documented, not official.</p>
    ${rollPickerHtml(form, state.query, forms)}
    ${form ? `<ul class="instance-list">${odds.map(rollTierRow).join("")}</ul>${spareOffersHtml(form.form_id, profileCompare, profiles)}` : ""}`;
}

function baitRow(bait) {
  return `<li class="instance-row"><h4>${escapeHtml(bait.name)}</h4><p>${escapeHtml(bait.reason)}</p></li>`;
}

function friendCard(friend) {
  const offersHtml = friend.offers.length
    ? `<ul class="instance-list trade-planner-friend-offers">${friend.offers.map(baitRow).join("")}</ul>`
    : `<p class="gym-empty">No bait suggestions yet — nothing in your roster stands out as trade bait.</p>`;
  return `<li class="instance-row" data-trade-planner-friend-id="${escapeHtml(friend.id)}">
    <h4>${escapeHtml(friend.name)}</h4>
    <p class="gym-empty">${escapeHtml(friend.note)}</p>
    ${offersHtml}
  </li>`;
}

export function renderTradePlannerView({ roster = {}, forms = {}, friends = [], rollSelection = {}, profileCompare = null, profiles = null } = {}) {
  const rollHtml = rollSectionHtml({ state: rollSelection, forms, profileCompare, profiles });
  const hasRoster = (roster.instances?.length ?? 0) > 0 || (roster.ownedFormIds?.length ?? 0) > 0;
  if (!hasRoster) {
    return `<section class="trade-planner-view" aria-labelledby="trade-planner-view-title">
      <p class="status-kicker">Trade planner</p>
      <h2 id="trade-planner-view-title">Trade offer suggestions</h2>
      <p class="gym-empty">No roster recorded yet — add Pokémon on the Dex or My Roster page first, then come back here for trade suggestions.</p>
      ${rollHtml}
    </section>`;
  }

  const { baits, perFriend } = tradePlan({ roster, forms, friends });

  return `<section class="trade-planner-view" aria-labelledby="trade-planner-view-title">
    <p class="status-kicker">Trade planner</p>
    <h2 id="trade-planner-view-title">Trade offer suggestions</h2>
    <p>These are suggestions from what this app knows about your roster — review each one in-game before trading. Trades are irreversible, and distance and stardust costs apply in-game on top of anything shown here.</p>

    <h3>Trade bait</h3>
    ${baits.length
      ? `<ul class="instance-list">${baits.map(baitRow).join("")}</ul>`
      : `<p class="gym-empty">Nothing in your roster stands out as trade bait yet — legendaries, mythicals, tagged trade-value species, and outclassed duplicate copies show up here.</p>`}

    <h3>Your friends</h3>
    ${friends.length
      ? `<ul class="instance-list">${perFriend.map(friendCard).join("")}</ul>`
      : `<p class="gym-empty">No friends saved yet — add one on the Friend Codes page (More → Friend Codes) to see suggestions paired to them.</p>`}

    ${rollHtml}
  </section>`;
}
