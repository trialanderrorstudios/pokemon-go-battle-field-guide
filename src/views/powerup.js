import { escapeHtml } from "./home.js";
import { powerUpPlan } from "../powerup-planner.js";

const TOP_LIMIT = 10;

function costLine(row) {
  return `${row.candyCost} Candy · ${row.dustCost.toLocaleString()} Stardust`;
}

function planRow(row) {
  return `<li class="powerup-row">
    <strong>${escapeHtml(row.pokemon)}</strong>
    <span class="powerup-row-levels">Level ${row.currentLevel} &rarr; ${row.targetLevel}</span>
    <span class="powerup-row-cost">${escapeHtml(costLine(row))}</span>
    <p class="powerup-row-gain">${escapeHtml(row.why)}</p>
    ${row.levelCapNote ? `<p class="powerup-row-cap-note">${escapeHtml(row.levelCapNote)}</p>` : ""}
  </li>`;
}

// Top-10 power-up recommendations, ranked by damage gained per 1000 Stardust
// spent (powerUpPlan's own value-density order — no re-ranking here).
export function renderPowerupView({
  roster = null, forms = {}, raids = null, currentBosses = null, trainerLevel = null,
} = {}) {
  const { rows, excludedNoLevelCount, hasRoster } = powerUpPlan({
    roster, forms, raids, currentBosses, trainerLevel,
  });

  let body;
  if (!hasRoster) {
    body = `<p class="powerup-empty fallback-section">No Pokémon logged with CP + IVs yet, so nothing can be ranked.
      Add a detailed roster instance — More &rarr; Roster &rarr; Add Pokémon.</p>`;
  } else if (!rows.length) {
    body = `<p class="powerup-empty fallback-section">None of your logged Pokémon are ranked attackers for the current
      rotation's weaknesses right now — nothing to recommend powering up.</p>`;
  } else {
    body = `<ol class="powerup-list">${rows.slice(0, TOP_LIMIT).map(planRow).join("")}</ol>`;
  }

  return `<section class="powerup-view" aria-labelledby="powerup-title">
    <p class="status-kicker">What to power up next</p>
    <h2 id="powerup-title">Power-Up Planner</h2>
    <p class="powerup-intro">Ranked by estimated damage gained per 1000 Stardust spent, among Pokémon you own that are
      already ranked attackers for the current raid rotation's weaknesses.</p>
    <p class="powerup-estimate-note">Damage gains are estimates from the CP-multiplier curve — real damage also depends
      on move breakpoints, which this does not model.</p>
    ${body}
    ${excludedNoLevelCount > 0
    ? `<p class="powerup-excluded">${excludedNoLevelCount} owned Pokémon excluded — no CP/IVs on record to derive a level.</p>`
    : ""}
  </section>`;
}
