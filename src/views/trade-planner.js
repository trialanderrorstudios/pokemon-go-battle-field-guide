// Trade Planner view — renders trade-planner.js's bait/per-friend plan.
// Pure render: no route/menu/dispatch wiring here (see app.js for that).
import { tradePlan } from "../trade-planner.js";
import { escapeHtml } from "./home.js";

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

export function renderTradePlannerView({ roster = {}, forms = {}, friends = [] } = {}) {
  const hasRoster = (roster.instances?.length ?? 0) > 0 || (roster.ownedFormIds?.length ?? 0) > 0;
  if (!hasRoster) {
    return `<section class="trade-planner-view" aria-labelledby="trade-planner-view-title">
      <p class="status-kicker">Trade planner</p>
      <h2 id="trade-planner-view-title">Trade offer suggestions</h2>
      <p class="gym-empty">No roster recorded yet — add Pokémon on the Dex or My Roster page first, then come back here for trade suggestions.</p>
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
  </section>`;
}
