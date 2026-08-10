import { ATTACK_TYPES } from "../raid-target.js";
import { escapeHtml, originLine, whyLine } from "./home.js";
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


// Badge the displayed optimal move only when it's the SAME move the practical
// rank/points are actually built on (row.fastMove/chargedMove) — those carry
// accurate eliteFastTM/eliteChargedTM/eventOnlyFastTM/eventOnlyChargedTM
// flags from the curated move-availability classification. When the optimal
// pick differs from the practical one, it was excluded for being restricted
// (see raid.py's _finalize_candidates) but this row alone can't say whether
// that restriction was Elite-TM or event-only — eliteUpgradeLine below
// explains that case with the full context instead of guessing here.
// A communityDayClassic move (Blast Burn, etc.) is never scare-labelled: the
// raid meta assumes every serious player already has it.
function moveBadge(optimalId, headlineId, elite, eventOnly, availabilityClass, kind) {
  if (optimalId !== headlineId || availabilityClass === "communityDayClassic") return "";
  if (elite) return ` <small class="elite-tm">Elite ${escapeHtml(kind)} TM</small>`;
  if (eventOnly) return ` <small class="elite-tm">Event-only move</small>`;
  return "";
}


// The DPS-optimal moveset shown above can be a restricted one that got
// excluded from the practical rank/points (see raid.py's
// _finalize_candidates) — this names the obtainable moveset actually driving
// this row's rank, and what rank/points the restricted one would reach.
// Reuses gyms.js's "Better with an Elite TM, never the headline" pattern
// (.gym-elite-upgrade) since it's the same claim for attackers.
function eliteUpgradeLine(row) {
  const upgrade = row.eliteUpgrade;
  if (!upgrade) return "";
  const gain = Number(upgrade.gainPct);
  return `<div class="gym-elite-upgrade">
    <p><strong>Elite/restricted move used above.</strong> Practical rank #${escapeHtml(row.rank)} is built on the
    obtainable ${escapeHtml(displayMove(row.fastMove))} + ${escapeHtml(displayMove(row.chargedMove))} instead —
    needs an Elite TM, or isn't obtainable via any TM at all.</p>
    <dl class="gym-move-dps">
      <div><dt>Obtainable (used above)</dt><dd>${Math.round(Number(upgrade.obtainablePoints) || 0)}<span class="gym-dps-sub">rank #${escapeHtml(row.rank)}, ${escapeHtml(upgrade.obtainablePointsMetric)}</span></dd></div>
      <div><dt>With the restricted move</dt><dd>${Math.round(Number(upgrade.points) || 0)}<span class="gym-dps-sub">rank #${escapeHtml(upgrade.rankIfUsed)}, ${escapeHtml(upgrade.pointsMetric)}</span></dd></div>
      ${Number.isFinite(gain) ? `<div><dt>Gain</dt><dd>+${gain}%</dd></div>` : ""}
    </dl>
  </div>`;
}


// A ranked row can be source-attested by Pokebattler while our frozen Game
// Master snapshot has no move-settings record for the practical charged/fast
// move at all (Zeraora's Plasma Fists) — the DPS block above is computed on
// the closest verified moveset instead, and that swap must say so rather than
// presenting the numbers as if they described the named practical move.
function moveStatsCaveat(row) {
  if (row.moveStatsVerified !== false) return "";
  return `<p class="raid-method-note">Practical rank #${escapeHtml(row.rank)} names
    ${escapeHtml(displayMove(row.fastMove))} + ${escapeHtml(displayMove(row.chargedMove))}, but our frozen move
    data has no stats for it — the DPS above reflects the closest verified moveset
    (${escapeHtml(displayMove(row.optimalFastMove))} + ${escapeHtml(displayMove(row.optimalChargedMove))}) instead.</p>`;
}


function noObtainableAlternativeNote(row) {
  if (!row.noObtainableAlternative) return "";
  return `<p class="gym-warning-note">No obtainable ${escapeHtml(row.attackingType)} moveset exists for this
    Pokémon — this is its only option, Elite TM or not.</p>`;
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
        <div><dt>Quick:</dt><dd>${escapeHtml(displayMove(row.optimalFastMove))}${moveBadge(row.optimalFastMove, row.fastMove, row.eliteFastTM, row.eventOnlyFastTM, row.availabilityClass, "Fast")}</dd></div>
        <div><dt>Charged:</dt><dd>${escapeHtml(displayMove(row.optimalChargedMove))}${moveBadge(row.optimalChargedMove, row.chargedMove, row.eliteChargedTM, row.eventOnlyChargedTM, row.availabilityClass, "Charged")}</dd></div>
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
      ${eliteUpgradeLine(row)}
      ${noObtainableAlternativeNote(row)}
      ${moveStatsCaveat(row)}
      ${originLine(row.origin, row.acquisition)}
      ${whyLine(row.whyRanked)}
      ${shadowAdvisorLine(row, lane, pvp)}
      <details><summary>Availability and notes</summary>
        <p>${notes.length ? notes.map(escapeHtml).join(" · ") : "No additional notes."}</p>
        ${row.personalAdvice ? `<p><strong>Personal advice:</strong> ${escapeHtml(row.personalAdvice)}</p>` : ""}
        <p>Level ${escapeHtml(row.level ?? 40)} · ${escapeHtml(row.setting ?? "practical raid ranking")}</p>
      </details>
    </article>
  </li>`;
}


// Each lane is 15 cards deep; a reader who jumped straight to Shadow via the
// nav below has no way back to Regular except scrolling by hand.
function backToTop(targetId) {
  return `<div class="jump-nav jump-nav-end"><button type="button" data-action="scroll-to" data-scroll-target="${escapeHtml(targetId)}">↑ Back to top</button></div>`;
}


export function renderRaidRankings({ attackingType = "Bug", raids = {}, forms = {}, pvp = {} } = {}) {
  const selectedType = ATTACK_TYPES.includes(attackingType) ? attackingType : attackingType;
  const lane = (name, rows) => `<section class="raid-lane" aria-labelledby="${name}-raid-title">
    <h3 id="${name}-raid-title">${name === "shadow" ? "Shadow" : "Regular, Mega & Primal"}</h3>
    <ol class="raid-card-list">${raidSlots(rows, selectedType).map((row) => rankCard(row, name, forms, pvp)).join("")}</ol>
    ${backToTop("raid-rankings-title")}
  </section>`;
  return `<section class="raid-rankings" aria-labelledby="raid-rankings-title">
    <p class="status-kicker">Level 40 practical performance</p>
    <h2 id="raid-rankings-title">${escapeHtml(selectedType)} raid attackers</h2>
    <p class="raid-method-note">Practical rank and points are distinct from standardized move-cycle DPS.</p>
    <p class="raid-method-note">Which moves need an Elite TM, aren't obtainable via any TM, or are a Community
      Day classic every serious player already has is a <span class="acq-flag">hand-researched</span>
      classification, not read straight from the game's own data.</p>
    <nav class="jump-nav" aria-label="Jump to a lane">
      <button type="button" data-action="scroll-to" data-scroll-target="regular-raid-title">Regular, Mega &amp; Primal</button>
      <button type="button" data-action="scroll-to" data-scroll-target="shadow-raid-title">Shadow</button>
    </nav>
    <div class="raid-lanes">${lane("regular", raids.regular)}${lane("shadow", raids.shadow)}</div>
    ${honorableMentions(raids.honorableMentions, selectedType)}
  </section>`;
}


export function renderRaids({ attackingType = "Bug", raids = {}, forms = {}, pvp = {} } = {}) {
  return `<div class="raids-view">${renderRaidRankings({ attackingType, raids, forms, pvp })}</div>`;
}


// Attackers that miss the fifteen on a moveset you can build, but would make it
// on one you probably cannot. Kept OUT of the ranking rather than interleaved:
// the list above is what to build today, and mixing in "if you had an Elite TM"
// would quietly change what the ranks mean. Regieleki is the case that prompted
// this — honestly 16th on Zap Cannon, first in the game with Thunder Cage, and
// previously absent from the page entirely, so a reader holding an Elite TM had
// no way to find out.
function honorableMentions(mentions, attackingType) {
  const rows = (mentions ?? []).filter((row) => row.attackingType === attackingType);
  if (!rows.length) return "";
  const items = rows.map((row) => {
    const move = displayMove(row.restrictedMove);
    const cost = row.availabilityClass === "eventOnly"
      ? "not obtainable by any TM — event distribution only"
      : "needs an Elite TM";
    const shadow = row.shadow ? " (Shadow)" : "";
    return `<li><strong>${escapeHtml(row.pokemon)}${shadow}</strong> — would rank
      <strong>#${row.rankIfUsed}</strong> with ${escapeHtml(move)}
      (${escapeHtml(row.restrictedSlot)} move, ${cost}). Ranked above on
      ${escapeHtml(displayMove(row.obtainableChargedMove))}, which is what you can build now.</li>`;
  }).join("");
  return `<section class="raid-honorable" aria-labelledby="raid-honorable-title">
    <h3 id="raid-honorable-title">Honourable mentions</h3>
    <p class="raid-method-note">Outside the fifteen on a buildable moveset — but strong enough to change
      the list if you spend a restricted move on them.</p>
    <ul class="raid-honorable-list">${items}</ul>
  </section>`;
}
