// Elite TM Planner view — props in, HTML out. elite-tm-planner.js's
// eliteTmPlan() carries the ranked candidates and the already-set exclusion
// list; this view only renders it (same split as views/xl.js). Reuses
// xl.js's already-styled row classes (.xl-list/.xl-row/.xl-row-heading/
// .xl-row-level/.xl-intro) rather than forking new CSS for an identical
// layout — see web/styles/app.css around line 7516 for buddy.js/xl.js
// already doing the same duplication for their own near-identical rows.
import { escapeHtml, whyLine } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { displayMoveName } from "./move-sheet.js";
import { eliteTmPlan } from "../elite-tm-planner.js";

const MOVE_KIND_LABEL = { fast: "Fast", charged: "Charged" };
const AVAILABILITY_LABEL = { eliteOnly: "Elite-only", communityDayClassic: "Community Day classic" };

function candidateHtml(candidate, forms) {
  const form = forms?.[candidate.formId];
  const kind = MOVE_KIND_LABEL[candidate.moveKind] ?? candidate.moveKind;
  const availability = AVAILABILITY_LABEL[candidate.availabilityClass] ?? candidate.availabilityClass;
  return `<li class="xl-row" data-form-id="${escapeHtml(candidate.formId)}">
    <div class="xl-row-heading">
      ${spriteHtml(candidate.formId, forms, candidate.name, form?.primary_type)}
      <strong>${escapeHtml(candidate.name)}</strong>
      <span class="xl-row-level">${escapeHtml(kind)} — ${escapeHtml(displayMoveName(candidate.move))}</span>
      <span class="xl-row-level">${escapeHtml(availability)}</span>
      ${candidate.gainPct != null
    ? `<span class="xl-row-level">+${escapeHtml(candidate.gainPct)}% over the best TM-able set</span>`
    : candidate.gainPct === null
      ? `<span class="xl-row-level">no TM-able alternative</span>`
      : ""}
    </div>
    ${whyLine(candidate.why)}
  </li>`;
}

function alreadySetHtml(alreadySet) {
  if (!alreadySet.length) return "";
  const names = alreadySet.map((entry) => escapeHtml(entry.name)).join(", ");
  return `<p class="elitetm-already-set fallback-section">Already running the elite optimal move for a ranked
    role — no Elite TM needed: ${names}.</p>`;
}

export function renderEliteTmView({
  roster = null, forms = {}, raidRows = null, moveAvailability = {}, plan = null,
} = {}) {
  const hasRoster = (roster?.instances ?? []).length > 0;
  if (!hasRoster) {
    return `<section class="elitetm-view" aria-labelledby="elitetm-title">
      <p class="status-kicker">Elite TM Planner</p>
      <h2 id="elitetm-title">Who should get the free Elite TM?</h2>
      <div class="elitetm-empty fallback-section">
        <p>No roster scanned yet — an Elite TM plan needs Pokémon to rank.</p>
        <a class="safe-escape" href="./#more/roster" data-route="more" data-view="roster">Scan your roster to get started</a>
      </div>
    </section>`;
  }

  // plan can be precomputed by the caller (mount contract's primary path) or
  // left null so this view calls eliteTmPlan itself — pass raidRows/
  // moveAvailability through either way so both options rank real candidates
  // instead of the fallback silently running with no raid inputs.
  const { candidates, alreadySet, note } = plan ?? eliteTmPlan({
    roster, forms, raidRows, moveAvailability,
  });

  const body = candidates.length
    ? `<ol class="xl-list">${candidates.map((candidate) => candidateHtml(candidate, forms)).join("")}</ol>`
    : `<p class="elitetm-none fallback-section">${escapeHtml(note || "Nothing in your roster needs an Elite TM move right now.")}</p>`;

  return `<section class="elitetm-view" aria-labelledby="elitetm-title">
    <p class="status-kicker">Elite TM Planner</p>
    <h2 id="elitetm-title">Who should get the free Elite TM?</h2>
    <p class="xl-intro">Community Day classic moves return every December Community Day weekend for candy (or a
      later Elite TM) — an eliteOnly move never comes back any other way. When both are on the table for a free
      Elite TM, the eliteOnly move is ranked first here.</p>
    ${body}
    ${alreadySetHtml(alreadySet)}
  </section>`;
}
