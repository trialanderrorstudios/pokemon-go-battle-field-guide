// XL Advisor view — props in, HTML out. xl-advisor.js's xlPlan() already
// carries the ranked candidates and the already-maxed exclusion list; this
// view only renders it (same split as views/buddy.js).
import { escapeHtml, whyLine } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { xlPlan } from "../xl-advisor.js";

function costLine(candidate) {
  const { xlCandy, dust, label } = candidate.cost;
  return `<p class="xl-cost">${escapeHtml(label)}: ${xlCandy} XL Candy, ${dust.toLocaleString("en-US")} Dust.</p>`;
}

function candidateHtml(candidate, forms) {
  return `<li class="xl-row" data-form-id="${escapeHtml(candidate.formId)}">
    <div class="xl-row-heading">
      ${spriteHtml(candidate.formId, forms, candidate.name, forms?.[candidate.formId]?.primary_type)}
      <strong>${escapeHtml(candidate.name)}</strong>
      <span class="xl-row-level">Level ${candidate.level}</span>
    </div>
    ${candidate.gains.map((gain) => whyLine(gain.label)).join("")}
    ${costLine(candidate)}
  </li>`;
}

function alreadyMaxedHtml(alreadyMaxed) {
  if (!alreadyMaxed.length) return "";
  const names = alreadyMaxed.map((entry) => escapeHtml(entry.name)).join(", ");
  return `<p class="xl-already-maxed fallback-section">Already Level 50, so there's no more XL push left to plan
    for: ${names}.</p>`;
}

export function renderXlView({
  roster = null, forms = {}, plan = null, raidRows = null, pvpRows = null, currentBosses = null,
} = {}) {
  const hasRoster = (roster?.instances ?? []).length > 0;
  if (!hasRoster) {
    return `<section class="xl-view" aria-labelledby="xl-title">
      <p class="status-kicker">XL Advisor</p>
      <h2 id="xl-title">Is it worth pushing past Level 40?</h2>
      <div class="xl-empty fallback-section">
        <p>No roster scanned yet — an XL plan needs Pokémon to rank.</p>
        <a class="safe-escape" href="./#more/roster" data-route="more" data-view="roster">Scan your roster to get started</a>
      </div>
    </section>`;
  }

  // plan can be precomputed by the caller (mount contract's primary path) or
  // left null so this view calls xlPlan itself — pass raid/pvp/boss data
  // through either way so both options score real candidates instead of the
  // fallback silently running with no raid/pvp inputs.
  const { candidates, alreadyMaxed } = plan ?? xlPlan({
    roster, forms, raidRows, pvpRows, currentBosses,
  });

  const body = candidates.length
    ? `<ol class="xl-list">${candidates.map((candidate) => candidateHtml(candidate, forms)).join("")}</ol>`
    : `<p class="xl-none fallback-section">Nothing at the Level 40 XL wall gets a clear push right now — no current-boss
      raid relevance or ranked-league PvP need found among instances Level 40-49.</p>`;

  return `<section class="xl-view" aria-labelledby="xl-title">
    <p class="status-kicker">XL Advisor</p>
    <h2 id="xl-title">Is it worth pushing past Level 40?</h2>
    <p class="xl-intro">Only instances already at the Level 40 candy wall are ranked here. Raid gains are estimates
      from the CP-multiplier curve; real damage also depends on move breakpoints this does not fully model.</p>
    <p class="xl-pvp-note">Great and Ultra League builds are usually capped well below Level 40 — this only flags a
      species when its own published rank-1 build needs a level over 40 (a low-Attack spread). Without that
      rank-1 IV/level data for a species, no PvP claim is made either way.</p>
    ${body}
    ${alreadyMaxedHtml(alreadyMaxed)}
  </section>`;
}
