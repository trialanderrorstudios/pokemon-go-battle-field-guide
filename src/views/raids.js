import { ATTACK_TYPES } from "../raid-target.js";
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { PVP_LEAGUES } from "./pvp.js";


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


// Meta-relevant means this Shadow's own ranking already says so: S+/S is this
// app's existing "Build ASAP"/"Strong Investment" cutoff (see investment.py's
// TIER_RULES) — the same bar used everywhere else, not a new threshold
// invented for this advisor. Checked against both raid and PvP rankings,
// since purifying is irreversible and a Shadow can be a meta pick in either.
const SHADOW_META_TIERS = new Set(["S+", "S"]);

// True if this form is a meta-relevant Shadow in any PvP league ranking —
// the Shadow Attack boost matters there too, so a raid-only check would
// green-light purifying a PvP meta pick.
function isPvpMetaShadow(formId, pvp) {
  return PVP_LEAGUES.some((league) => (pvp?.[league] ?? [])
    .some((row) => row.formId === formId && row.shadow && SHADOW_META_TIERS.has(row.investmentTier)));
}

// Keep-or-purify verdict for a ranked Shadow raid attacker. Purifying always
// grants +2 to each IV (capped at 15) — a small, fixed stat bump — but it also
// removes the Shadow bonus (roughly +20% Attack / -20% Defense vs. the same
// Pokemon Regular) that is exactly why a meta-relevant Shadow ranks this high
// as an attacker. For a meta-relevant Shadow, that Attack bonus is worth far
// more than +2 IVs, so the verdict never recommends purifying one — whether
// it's meta in raids, in PvP, or both.
export function shadowAdvisorVerdict(investmentTier, formId, pvp) {
  const raidMeta = SHADOW_META_TIERS.has(investmentTier);
  const pvpMeta = isPvpMetaShadow(formId, pvp);
  if (raidMeta && pvpMeta) {
    return {
      verdict: "Keep Shadow",
      reason: "Ranks as a meta attacker in both raids and PvP specifically because of the Shadow Attack boost. "
        + "Purifying would trade that boost for a fixed +2 IVs — not a good trade for a top attacker.",
    };
  }
  if (raidMeta) {
    return {
      verdict: "Keep Shadow",
      reason: "Ranks as a meta raid attacker specifically because of the Shadow Attack boost. "
        + "Purifying would trade that boost for a fixed +2 IVs — not a good trade for a top attacker.",
    };
  }
  if (pvpMeta) {
    return {
      verdict: "Keep Shadow",
      reason: "Not a top raid attacker, but this form is a meta PvP pick where the Shadow Attack boost also matters. "
        + "Purifying would trade that boost for a fixed +2 IVs — not a good trade for a PvP meta pick.",
    };
  }
  return {
    verdict: "Fine to purify (raid use)",
    reason: "Not ranked highly enough as a raid attacker for the Shadow Attack boost to matter much, and not a "
      + "meta PvP pick either. Purifying trades it for +2 IVs (capped at 15) and removes the Shadow Defense "
      + "penalty — a fair trade here.",
  };
}


function shadowAdvisorLine(row, lane, pvp) {
  if (lane !== "shadow") return "";
  const advice = shadowAdvisorVerdict(row.investmentTier, row.formId, pvp);
  return `<p class="shadow-advisor"><strong>${escapeHtml(advice.verdict)}:</strong> ${escapeHtml(advice.reason)}</p>`;
}


function rankCard(row, lane, forms, pvp) {
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
      ${shadowAdvisorLine(row, lane, pvp)}
      <details><summary>Availability and notes</summary>
        <p>${notes.length ? notes.map(escapeHtml).join(" · ") : "No additional notes."}</p>
        ${row.personalAdvice ? `<p><strong>Personal advice:</strong> ${escapeHtml(row.personalAdvice)}</p>` : ""}
        <p>Level ${escapeHtml(row.level ?? 40)} · ${escapeHtml(row.setting ?? "practical raid ranking")}</p>
      </details>
    </article>
  </li>`;
}


export function renderRaidRankings({ attackingType = "Bug", raids = {}, forms = {}, pvp = {} } = {}) {
  const selectedType = ATTACK_TYPES.includes(attackingType) ? attackingType : attackingType;
  const lane = (name, rows) => `<section class="raid-lane" aria-labelledby="${name}-raid-title">
    <h3 id="${name}-raid-title">${name === "shadow" ? "Shadow" : "Regular, Mega & Primal"}</h3>
    <ol class="raid-card-list">${raidSlots(rows, selectedType).map((row) => rankCard(row, name, forms, pvp)).join("")}</ol>
  </section>`;
  return `<section class="raid-rankings" aria-labelledby="raid-rankings-title">
    <p class="status-kicker">Level 40 practical performance</p>
    <h2 id="raid-rankings-title">${escapeHtml(selectedType)} raid attackers</h2>
    <p class="raid-method-note">Practical rank and points are distinct from standardized move-cycle DPS.</p>
    <div class="raid-lanes">${lane("regular", raids.regular)}${lane("shadow", raids.shadow)}</div>
  </section>`;
}


export function renderRaids({ attackingType = "Bug", raids = {}, forms = {}, pvp = {} } = {}) {
  return `<div class="raids-view">${renderRaidRankings({ attackingType, raids, forms, pvp })}</div>`;
}
