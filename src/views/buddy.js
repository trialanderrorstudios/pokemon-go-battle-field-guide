// Buddy Planner view — props in, HTML out. buddy-planner.js's buddyPlan()
// already carries the ranked candidates and already-Best-Buddy exclusion
// list; this view only renders it (same split as views/powerup.js).
import { escapeHtml, whyLine } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { buddyPlan } from "../buddy-planner.js";

function candidateHtml(candidate, forms) {
  return `<li class="buddy-row" data-form-id="${escapeHtml(candidate.formId)}">
    <div class="buddy-row-heading">
      ${spriteHtml(candidate.formId, forms, candidate.name, forms?.[candidate.formId]?.primary_type)}
      <strong>${escapeHtml(candidate.name)}</strong>
    </div>
    ${candidate.gains.map((gain) => whyLine(gain.label)).join("")}
  </li>`;
}

function alreadyBestHtml(alreadyBest) {
  if (!alreadyBest.length) return "";
  const names = alreadyBest.map((entry) => escapeHtml(entry.name)).join(", ");
  return `<p class="buddy-already-best fallback-section">Already Best Buddy, so there's no more Best-Buddy gain left to
    plan for: ${names}.</p>`;
}

export function renderBuddyView({
  roster = null, forms = {}, plan = null, raidRows = null, pvpRows = null, currentBosses = null,
} = {}) {
  const hasRoster = (roster?.instances ?? []).length > 0;
  if (!hasRoster) {
    return `<section class="buddy-view" aria-labelledby="buddy-title">
      <p class="status-kicker">Best Buddy planner</p>
      <h2 id="buddy-title">Who to make Best Buddy</h2>
      <div class="buddy-empty fallback-section">
        <p>No roster scanned yet — a Best Buddy plan needs Pokémon to rank.</p>
        <a class="safe-escape" href="./#more/roster" data-route="more" data-view="roster">Scan your roster to get started</a>
      </div>
    </section>`;
  }

  // plan can be precomputed by the caller (mount contract's primary path) or
  // left null so this view calls buddyPlan itself — pass raid/pvp/boss data
  // through either way so both options score real candidates instead of the
  // fallback silently running with no raid/pvp inputs.
  const { candidates, alreadyBest } = plan ?? buddyPlan({
    roster, forms, raidRows, pvpRows, currentBosses,
  });

  const body = candidates.length
    ? `<ol class="buddy-list">${candidates.map((candidate) => candidateHtml(candidate, forms)).join("")}</ol>`
    : `<p class="buddy-none fallback-section">Nothing in your roster gets a clear Best Buddy edge right now — no
      current-boss raid relevance or league-cap PvP gain found for these levels/IVs.</p>`;

  return `<section class="buddy-view" aria-labelledby="buddy-title">
    <p class="status-kicker">Best Buddy planner</p>
    <h2 id="buddy-title">Who to make Best Buddy</h2>
    <p class="buddy-intro">Best Buddy is a flat +1 power-up level. Ranked by owned Pokémon that would actually use
      it — a current raid rotation attacker or a PvP build that's capped below Level 51.</p>
    <p class="buddy-estimate-note">Gains are estimates from the CP-multiplier curve — real damage/stat-product also
      depends on move breakpoints and exact IVs, which this does not fully model.</p>
    ${body}
    ${alreadyBestHtml(alreadyBest)}
  </section>`;
}
