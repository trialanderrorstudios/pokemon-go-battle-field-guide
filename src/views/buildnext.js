import { escapeHtml } from "./home.js";
import { bossesForType, buildNextCandidates, typeCoverage, weakLanes } from "../gap-analyzer.js";

function candidateRow(row) {
  const need = row.candyNeeded > 0 ? `${row.candyNeeded} more Candy` : "Ready now";
  return `<li class="buildnext-candidate">
    <strong>${escapeHtml(row.name)}</strong> &rarr; <strong>${escapeHtml(row.targetName)}</strong>
    <span>#${row.rankRow.rank} ${escapeHtml(row.rankRow.attackingType)} attacker &middot; ${escapeHtml(need)}</span>
    ${row.levelNote ? `<p class="buildnext-level-note">${escapeHtml(row.levelNote)}</p>` : ""}
  </li>`;
}

// "Counters:" here used to mean the opposite of "counter" one line above it —
// that line names an owned attacker, this one names what the lane's type is
// super-effective against (gap-analyzer's own comment calls it the "this fixes
// ..." line). It is also not bosses only: bossesForType merges currentBosses
// with currentEvents, so event spawns land in the same list.
function laneSection(lane, context) {
  const candidates = buildNextCandidates({ attackingType: lane.attackingType, ...context });
  const bosses = bossesForType(lane.attackingType, context);
  return `<li class="buildnext-lane">
    <h3>${escapeHtml(lane.attackingType)}</h3>
    <p class="buildnext-lane-status">${lane.best
      ? `Best owned counter: #${lane.best.rank} ${escapeHtml(lane.best.pokemon ?? lane.best.formId)} — fringe, not a solid pick yet.`
      : "No owned counter ranked for this type at all."}</p>
    ${bosses.length ? `<p class="buildnext-lane-bosses">Helps against: ${bosses.map((boss) => escapeHtml(boss.name)).join(", ")}</p>` : ""}
    ${candidates.length
      ? `<ul class="buildnext-candidate-list">${candidates.slice(0, 3).map(candidateRow).join("")}</ul>`
      : '<p class="buildnext-no-candidate">No Pokémon you own can reach a solid counter for this type yet.</p>'}
  </li>`;
}

// Full weak-lanes + Build-Next list (#triage/gaps view). Composes
// gap-analyzer.js only — no new ranking/evolution/cost math here.
export function renderBuildNext({
  forms = {}, roster = {}, raids, candyInventory = {}, triageResult = null, trainerLevel = null,
  currentBosses = null, currentEvents = null,
} = {}) {
  const coverage = typeCoverage({ raids, roster });
  const weak = weakLanes(coverage);
  const context = {
    forms, roster, raids, candyInventory, triageResult, trainerLevel, currentBosses, currentEvents,
  };
  // An empty roster is weak in all 18 lanes, so the unguarded path rendered a
  // full 18-lane "you own nothing that fixes this" report and never said the
  // one thing that would fix all of it. Same CTA as the sibling #triage empty
  // state, which has handled this since it shipped.
  const owned = (roster.ownedFormIds?.length ?? 0) + (roster.instances?.length ?? 0);
  const body = owned === 0
    ? '<div class="triage-empty card"><p>No Pokémon you own can reach a solid counter for any type yet — nothing is imported on this device. Import your Pokémon first — More → Import</p><a class="safe-escape" href="./#more/roster" data-route="more" data-view="roster">Open My Roster to import</a></div>'
    : weak.length
      ? `<ul class="buildnext-lane-list">${weak.map((lane) => laneSection(lane, context)).join("")}</ul>`
      : '<p class="buildnext-empty fallback-section">Your box covers the meta — nothing urgent. Every attacking type already has a solid owned counter.</p>';
  return `<section class="buildnext-view" aria-labelledby="buildnext-title">
    <p class="status-kicker">What to power up next</p>
    <h2 id="buildnext-title">Roster Gaps</h2>
    <p class="buildnext-intro">Attacking types your owned roster doesn't have a strong counter for yet, and the best Pokémon you already own to fix each one. "Helps against" lists the current raid bosses and event spawns that type is super-effective into.</p>
    ${body}
  </section>`;
}
