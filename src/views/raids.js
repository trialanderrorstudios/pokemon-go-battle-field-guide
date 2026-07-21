import { ATTACK_TYPES } from "../raid-target.js";
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";


function displayMove(moveId) {
  return String(moveId ?? "Unknown move").toLowerCase().split("_")
    .map((word) => word ? word[0].toUpperCase() + word.slice(1) : "")
    .join(" ");
}


function dps(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "—";
}


export function raidSlots(rows, attackingType) {
  const byRank = new Map();
  for (const row of rows ?? []) {
    if (row?.attackingType !== attackingType) continue;
    const rank = Number(row.rank);
    if (Number.isInteger(rank) && rank >= 1 && rank <= 15 && !byRank.has(rank)) byRank.set(rank, row);
  }
  return Array.from({ length: 15 }, (_, index) => byRank.get(index + 1) ?? ({
    attackingType,
    rank: index + 1,
    formId: null,
    pokemon: null,
    status: "no_released_option",
    note: "No released option qualifies for this slot.",
  }));
}


function moveWithElite(moveId, elite, kind) {
  return `${escapeHtml(displayMove(moveId))}${elite ? ` <small class="elite-tm">Elite ${escapeHtml(kind)} TM</small>` : ""}`;
}


function rankCard(row, lane, forms) {
  const headingId = `raid-${lane}-${row.attackingType}-${row.rank}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  if (row.status !== "ranked" || !row.formId) {
    return `<li class="raid-card raid-card-gap" data-rank="${row.rank}">
      <article aria-labelledby="${headingId}">
        <p class="raid-rank">#${row.rank}</p>
        <h4 id="${headingId}">No released ${lane === "shadow" ? "Shadow " : ""}option</h4>
        <p>${escapeHtml(row.note ?? "No released option qualifies for this slot.")}</p>
      </article>
    </li>`;
  }
  const notes = [row.availability, row.note].filter(Boolean);
  return `<li class="raid-card" data-form-id="${escapeHtml(row.formId)}" data-rank="${row.rank}">
    <article aria-labelledby="${headingId}">
      <div class="raid-card-heading">${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}<p class="raid-rank">#${row.rank}</p><h4 id="${headingId}">${escapeHtml(row.pokemon)}</h4></div>
      <dl class="raid-moves" aria-label="Optimal raid moves">
        <div><dt>Quick:</dt><dd>${moveWithElite(row.optimalFastMove, row.optimalEliteFastTM, "Fast")}</dd></div>
        <div><dt>Charged:</dt><dd>${moveWithElite(row.optimalChargedMove, row.optimalEliteChargedTM, "Charged")}</dd></div>
      </dl>
      <dl class="raid-dps" aria-label="Standardized raid DPS">
        <div><dt>Neutral DPS</dt><dd>${dps(row.dps?.neutral)}</dd></div>
        <div><dt>Super-effective DPS</dt><dd>${dps(row.dps?.superEffective)}</dd></div>
        <div><dt>Double-weakness DPS</dt><dd>${dps(row.dps?.doubleWeakness)}</dd></div>
      </dl>
      <dl class="raid-practical">
        <div><dt>Practical rank</dt><dd>#${row.rank}</dd></div>
        <div><dt>Practical points</dt><dd>${escapeHtml(row.points ?? "—")}</dd></div>
        <div><dt>Investment</dt><dd>${escapeHtml(row.investmentTier ?? "—")} · ${escapeHtml(row.recommendation ?? "—")}</dd></div>
        <div><dt>Worth Level 50?</dt><dd>${escapeHtml(row.worthLevel50 ?? "—")}</dd></div>
        <div><dt>Budget value</dt><dd>${escapeHtml(row.budgetValue ?? "—")}</dd></div>
        <div><dt>Future-proof</dt><dd>${escapeHtml(row.futureProof ?? "—")}</dd></div>
      </dl>
      <details><summary>Availability and notes</summary>
        <p>${notes.length ? notes.map(escapeHtml).join(" · ") : "No additional notes."}</p>
        ${row.personalAdvice ? `<p><strong>Personal advice:</strong> ${escapeHtml(row.personalAdvice)}</p>` : ""}
        <p>Level ${escapeHtml(row.level ?? 40)} · ${escapeHtml(row.setting ?? "practical raid ranking")}</p>
      </details>
    </article>
  </li>`;
}


export function renderRaidRankings({ attackingType = "Bug", raids = {}, forms = {} } = {}) {
  const selectedType = ATTACK_TYPES.includes(attackingType) ? attackingType : attackingType;
  const lane = (name, rows) => `<section class="raid-lane" aria-labelledby="${name}-raid-title">
    <h3 id="${name}-raid-title">${name === "shadow" ? "Shadow" : "Regular, Mega & Primal"}</h3>
    <ol class="raid-card-list">${raidSlots(rows, selectedType).map((row) => rankCard(row, name, forms)).join("")}</ol>
  </section>`;
  return `<section class="raid-rankings" aria-labelledby="raid-rankings-title">
    <p class="status-kicker">Level 40 practical performance</p>
    <h2 id="raid-rankings-title">${escapeHtml(selectedType)} raid attackers</h2>
    <p class="raid-method-note">Practical rank and points are distinct from standardized move-cycle DPS.</p>
    <div class="raid-lanes">${lane("regular", raids.regular)}${lane("shadow", raids.shadow)}</div>
  </section>`;
}


export function renderRaids({ attackingType = "Bug", raids = {}, forms = {} } = {}) {
  return `<div class="raids-view">${renderRaidRankings({ attackingType, raids, forms })}</div>`;
}
