// Type Mastery view — an 18-row grid, one per attacking type, presenting
// type-mastery.js's computeTypeMastery() output. Props in, HTML out.
import { escapeHtml } from "./home.js";
import { weakestTypes } from "../type-mastery.js";

const BAND_SHORT_LABEL = {
  S: "S", A: "A", B: "B", thin: "Thin", empty: "Empty",
};

function dexLink(formId, name) {
  return `<a class="safe-escape" data-route="dex" href="./#dex/${encodeURIComponent(formId)}">${escapeHtml(name)}</a>`;
}

function bestOwnedHtml(bestOwned) {
  if (!bestOwned) return `<p class="mastery-row-empty">No owned attacker to show yet.</p>`;
  const moveset = bestOwned.moveset
    ? ` (${escapeHtml(bestOwned.moveset)})`
    : " — not running the optimal moveset";
  return `<p class="mastery-best-owned">Best owned: ${dexLink(bestOwned.formId, bestOwned.name)}${moveset}</p>`;
}

function nextBuildHtml(nextBuild) {
  if (!nextBuild) return "";
  return `<p class="mastery-next-build">Next build: ${dexLink(nextBuild.formId, nextBuild.name)} — ${escapeHtml(nextBuild.why)}</p>`;
}

function rowHtml(row) {
  const { type, band, bandLabel } = row;
  return `<li class="mastery-row mastery-band-${band}" data-mastery-type="${escapeHtml(type)}">
    <div class="mastery-row-heading">
      <span class="mastery-type-name">${escapeHtml(type)}</span>
      <span class="mastery-band-badge mastery-band-badge-${band}">${escapeHtml(BAND_SHORT_LABEL[band] ?? band)}</span>
    </div>
    <p class="mastery-band-label">${escapeHtml(bandLabel)}</p>
    ${bestOwnedHtml(row.bestOwned)}
    ${nextBuildHtml(row.nextBuild)}
  </li>`;
}

// Build-next headline: the two weakest attacking types and what to build for
// each, so the answer sits above the 18-row grid instead of inside it.
// weakestTypes was written for exactly this and never rendered until
// 2026-10-05. A type already at S/A isn't a gap — say nothing rather than
// call a strong bench "weakest".
function buildNextHtml(mastery) {
  const gaps = weakestTypes(mastery, 2).filter((row) => row.band === "empty" || row.band === "thin" || row.band === "B");
  if (!gaps.length) return "";
  const items = gaps.map((row) => `<li><strong>${escapeHtml(row.type)}</strong> (${escapeHtml(BAND_SHORT_LABEL[row.band] ?? row.band)})${row.nextBuild ? ` — build ${dexLink(row.nextBuild.formId, row.nextBuild.name)}` : ""}</li>`).join("");
  return `<div class="fallback-section mastery-build-next"><p class="status-kicker">Build next</p><ul>${items}</ul></div>`;
}

export function renderMasteryView({ mastery = [], forms = {} } = {}) {
  // forms stays in the mount signature per the coordinator's contract — this
  // view only needs it as a keep-the-shape-consistent param; bestOwned/
  // nextBuild already carry resolved names from computeTypeMastery.
  void forms;
  return `<section class="mastery-view" aria-labelledby="mastery-view-title">
    <p class="status-kicker">Type mastery</p>
    <h2 id="mastery-view-title">Attacker Bench Strength</h2>
    <p class="mastery-summary">How deep your roster runs per attacking type, tap a name to jump to the dex — an honest bench check, not a battle simulation.</p>
    ${buildNextHtml(mastery)}
    <ul class="mastery-grid">${mastery.map((row) => rowHtml(row)).join("")}</ul>
  </section>`;
}
