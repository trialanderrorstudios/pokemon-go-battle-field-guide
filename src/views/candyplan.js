import { escapeHtml } from "./home.js";
import { candyPlanDataAvailable, candyPlanRows } from "../candy-plan.js";


// Trade seam: a saved trade friend lacks this species — evolving your only
// spare spends a copy a friend wants. Rendered alongside "fills a dex slot"
// so the "evolve to fill YOUR dex" vs "keep for trading" tension is visible.
function tradeKeepHtml(row) {
  return row.tradeKeep
    ? `<p class="candyplan-trade-keep">A saved trade friend lacks this species — consider keeping a spare
      <a href="./#trades" data-route="trades">for trading</a>.</p>`
    : "";
}


function rowHtml(row) {
  if (row.status === "record-candy") {
    return `<li class="candyplan-row candyplan-row-record">
      <strong>${escapeHtml(row.name)}</strong> <span>#${row.dex}</span>
      <p>${escapeHtml(row.because)}</p>${tradeKeepHtml(row)}
    </li>`;
  }
  if (row.status === "data-gap") {
    return `<li class="candyplan-row candyplan-row-gap">
      <strong>${escapeHtml(row.name)}</strong> <span>#${row.dex}</span>
      <p>${row.candyOwned} Candy recorded. ${escapeHtml(row.because)}</p>${tradeKeepHtml(row)}
    </li>`;
  }
  const need = row.candyNeeded > 0 ? `${row.candyNeeded} more Candy` : "Ready now";
  const fill = row.dexFill ? " · evolve to fill YOUR dex" : "";
  const predicted = row.predictedCp !== undefined
    ? ` <span class="instance-predicted-cp-badge">~${escapeHtml(row.predictedCp)} CP</span>` : "";
  return `<li class="candyplan-row candyplan-row-reachable" data-reachable="${row.reachable}">
    <strong>${escapeHtml(row.name)}</strong> → <strong>${escapeHtml(row.targetName)}</strong>${predicted}
    <span>${escapeHtml(need)}${escapeHtml(fill)}</span>
    ${row.because ? `<p>${escapeHtml(row.because)}</p>` : ""}${tradeKeepHtml(row)}
  </li>`;
}


// Reads recorded Candy + roster ownership + the same raid/PvP/gym relevance
// signals triage.js already surfaces, ranked by cheapest reachable value
// first. See candy-plan.js: reachable rows carry a predicted evolved CP when
// a detailed instance is on record for that owned form; forms this release
// genuinely has no evolution-chain or Candy-cost data for still render
// through the honest "data isn't in this release" grace path.
export function renderCandyPlan({ forms = {}, roster = {}, candyInventory = {}, raids, pvp, gym, friendGapDex } = {}) {
  const available = candyPlanDataAvailable(forms);
  const rows = candyPlanRows({ forms, roster, candyInventory, raids, pvp, gym, friendGapDex });

  return `<section class="candyplan-view" aria-labelledby="candyplan-title">
    <a class="safe-escape" href="./#more">Back to More</a>
    <p class="status-kicker">Candy planner</p>
    <h2 id="candyplan-title">Evolution Candy Planner</h2>
    ${available ? "" : `<p class="fallback-section">This release's bundled data does not include evolution chains
      or evolution-Candy costs yet, so nothing below can be ranked. Species you own with Candy already recorded
      are listed so this page is ready to rank them the moment that data ships.</p>`}
    <ul class="candyplan-list">${rows.length
    ? rows.map(rowHtml).join("")
    : '<li class="gym-empty">Own a Pokémon and record its Candy in My Roster to see it here.</li>'}</ul>
    <p><a class="safe-escape" href="./#trades" data-route="trades">Compare dex with a friend &rarr;</a></p>
  </section>`;
}
