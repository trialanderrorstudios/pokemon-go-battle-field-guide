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

function laneSection(lane, context) {
  const candidates = buildNextCandidates({ attackingType: lane.attackingType, ...context });
  const bosses = bossesForType(lane.attackingType, context);
  return `<li class="buildnext-lane">
    <h3>${escapeHtml(lane.attackingType)}</h3>
    <p class="buildnext-lane-status">${lane.best
      ? `Best owned counter: #${lane.best.rank} ${escapeHtml(lane.best.pokemon ?? lane.best.formId)} — fringe, not a solid pick yet.`
      : "No owned counter ranked for this type at all."}</p>
    ${bosses.length ? `<p class="buildnext-lane-bosses">Counters: ${bosses.map((boss) => escapeHtml(boss.name)).join(", ")}</p>` : ""}
    ${candidates.length
      ? `<ul class="buildnext-candidate-list">${candidates.slice(0, 3).map(candidateRow).join("")}</ul>`
      : '<p class="buildnext-no-candidate">No Pokémon you own can reach a solid counter for this type yet.</p>'}
  </li>`;
}

// Full weak-lanes + Build-Next list (#buildnext route). Composes
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
  const body = weak.length
    ? `<ul class="buildnext-lane-list">${weak.map((lane) => laneSection(lane, context)).join("")}</ul>`
    : '<p class="buildnext-empty fallback-section">Your box covers the meta — nothing urgent. Every attacking type already has a solid owned counter.</p>';
  return `<section class="buildnext-view" aria-labelledby="buildnext-title">
    <p class="status-kicker">Roster gaps</p>
    <h2 id="buildnext-title">Build Next</h2>
    <p class="buildnext-intro">Attacking types your owned roster doesn't have a strong counter for yet, and the best Pokémon you already own to fix each one.</p>
    ${body}
  </section>`;
}
