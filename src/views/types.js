import { ATTACK_TYPES, effectivenessOf, weaknessesOf } from "../type-chart.js";


// Shared type-color chip, reused by the boss counter view. Types come from
// the frozen ATTACK_TYPES list, never user input, so no escaping is needed.
export function typeChip(type) {
  return `<span class="type-chip" data-type="${type}">${type}</span>`;
}


function chipList(types) {
  return types.length
    ? `<p class="type-chip-list">${types.map(typeChip).join("")}</p>`
    : `<p class="type-chip-list type-chip-list-empty">None</p>`;
}


function typeRow(type) {
  const strongAgainst = ATTACK_TYPES.filter((defend) => effectivenessOf(type, [defend]) > 1);
  const resistedBy = ATTACK_TYPES.filter((defend) => effectivenessOf(type, [defend]) < 1);
  const weakTo = weaknessesOf([type]).map((row) => row.type);
  return `<details class="type-row">
    <summary>${typeChip(type)}<span>${type}</span></summary>
    <div class="type-row-body">
      <h4>Strong against</h4>${chipList(strongAgainst)}
      <h4>Weak to</h4>${chipList(weakTo)}
      <h4>Resisted by</h4>${chipList(resistedBy)}
    </div>
  </details>`;
}


export function renderTypes() {
  return `<div class="more-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    <section class="more-section" aria-labelledby="types-title">
      <p class="status-kicker">Type chart</p>
      <h2 id="types-title">Type Matchups</h2>
      <p>Tap a type to see what it beats, what beats it, and what shrugs it off.</p>
    </section>
    <div class="type-list">${ATTACK_TYPES.map(typeRow).join("")}</div>
  </div>`;
}
