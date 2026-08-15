// Battle Party panel — "here are the six Pokemon to bring". Props in, HTML
// out: partyResult (party-core's buildParty output) already carries the
// picked instance/form/role/why per slot, this view only renders it.
//
// Contract note: party-core (web/src/party-optimizer.js) doesn't exist in
// this worktree yet — built against the coordinator-specified shape:
//   partyResult = { party: [{ instance, form, role, score, why }], estimate: { label, confidence }, gaps: [] }
// score is computed/ordering-only and intentionally not displayed (not in
// the requested slot fields). targetFormId/roster/raids/data/trainerLevel/
// weather are accepted per the mount signature the coordinator wires, but
// this view only needs roster (empty-roster check) and forms (sprite
// variant lookup) — the rest are already folded into partyResult upstream.
import { escapeHtml, whyLine } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { instanceLevel } from "../instances.js";

const PARTY_SIZE = 6;

function emptyRosterHtml() {
  return `<div class="party-empty">
    <p>No roster scanned yet — a battle party needs Pokémon to pick from.</p>
    <a class="safe-escape party-empty-cta" href="./#more/roster" data-route="more" data-view="roster">Scan your roster to get started</a>
  </div>`;
}

function simHtml(sim) {
  if (!sim || !Number.isFinite(sim.timeToWinMs)) return "";
  const totalSeconds = Math.round(sim.timeToWinMs / 1000);
  const clock = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  const verdict = sim.won === false
    ? `Simulated: this party doesn't clear in time (~${escapeHtml(clock)} needed)`
    : `Simulated clear ~${escapeHtml(clock)} · ${sim.faints} faint${sim.faints === 1 ? "" : "s"}${sim.relobbies ? ` · ${sim.relobbies} relobby${sim.relobbies === 1 ? "" : "s"}` : ""}`;
  const assumptions = (sim.assumptions ?? []).length
    ? `<details class="party-sim-assumptions"><summary>Simulation assumptions</summary><ul>${sim.assumptions.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></details>`
    : "";
  return `<div class="party-sim"><p class="party-sim-label">${verdict}</p>${assumptions}</div>`;
}

function estimateHtml(estimate) {
  if (!estimate?.label) return "";
  const confidence = estimate.confidence
    ? `<span class="party-estimate-confidence">${escapeHtml(estimate.confidence)}</span>` : "";
  return `<div class="party-estimate"><p class="party-estimate-label">${escapeHtml(estimate.label)}</p>${confidence}</div>`;
}

// Gaps are honesty chips, not a ranked list — "missing: Dragon" says what's
// not covered rather than pretending six mediocre picks fill every hole.
function gapsHtml(gaps) {
  if (!gaps?.length) return "";
  // Verbatim — the optimizer emits full honest sentences ("No ranked Dragon
  // attacker owned — Rayquaza would fill this."); prefixing "missing:" made
  // doubled chips (review catch at wiring time).
  const chips = gaps.map((gap) => `<span class="party-gap-chip">${escapeHtml(gap)}</span>`).join("");
  return `<div class="party-gaps" aria-label="Coverage gaps">${chips}</div>`;
}

function slotHtml(entry, index, forms) {
  const headingId = `party-slot-${index}-name`;
  if (!entry?.instance || !entry?.form) {
    return `<li class="party-slot party-slot-open" data-party-slot="${index}">
      <article aria-labelledby="${headingId}">
        <p class="party-slot-role">Open slot</p>
        <h4 id="${headingId}">No pick yet</h4>
      </article>
    </li>`;
  }
  const { instance, form, role, why } = entry;
  const name = instance.nickname || form.name || "Unknown";
  const level = instanceLevel(form, instance);
  return `<li class="party-slot" data-party-slot="${index}" data-form-id="${escapeHtml(form.form_id ?? "")}">
    <article aria-labelledby="${headingId}">
      <div class="party-slot-heading">
        ${spriteHtml(form.form_id, forms, name, form.primary_type)}
        <div class="party-slot-id">
          ${role ? `<p class="party-role-chip">${escapeHtml(role)}</p>` : ""}
          <h4 id="${headingId}">${escapeHtml(name)}</h4>
        </div>
      </div>
      <p class="party-slot-stats">CP ${escapeHtml(instance.cp ?? "—")}${level !== null ? ` · Level ${escapeHtml(level)}` : ""}</p>
      ${whyLine(why)}
      <button type="button" class="party-swap-btn" data-party-swap-slot="${index}">Swap</button>
    </article>
  </li>`;
}

export function renderPartyPanel({
  targetFormId, roster = {}, forms = {}, raids = {}, data = {}, trainerLevel = null, weather = null, partyResult = null,
  simResult = null,
} = {}) {
  // eslint/no-unused-vars has no gate here, but the mount signature is the
  // coordinator's contract — targetFormId/raids/data/trainerLevel/weather
  // stay in the destructure even though rendering only reads roster/forms.
  void targetFormId; void raids; void data; void trainerLevel; void weather;
  const hasRoster = (roster.instances ?? []).length > 0;
  if (!hasRoster) {
    return `<section class="party-panel" aria-labelledby="party-panel-title">
      <p class="status-kicker">Battle party</p>
      <h2 id="party-panel-title">Your battle party</h2>
      ${emptyRosterHtml()}
    </section>`;
  }
  const party = partyResult?.party ?? [];
  const slots = Array.from({ length: PARTY_SIZE }, (_, index) => party[index] ?? null);
  return `<section class="party-panel" aria-labelledby="party-panel-title">
    <p class="status-kicker">Battle party</p>
    <h2 id="party-panel-title">Your battle party</h2>
    ${simHtml(simResult)}
    ${estimateHtml(partyResult?.estimate)}
    ${gapsHtml(partyResult?.gaps)}
    <ol class="party-slot-list">${slots.map((entry, index) => slotHtml(entry, index, forms)).join("")}</ol>
  </section>`;
}
