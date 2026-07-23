import { escapeHtml } from "./home.js";
import { buildCoachSummary } from "../coach.js";
import { jargonTerm } from "../glossary.js";
import { DAILY_HEART_CAP } from "../buddy.js";

const BAND_LEAD = Object.freeze({
  "solo-able": "Solo-able",
  duoable: "Ready",
  "bring-3-4": "Bring friends",
  "full-lobby": "Full lobby",
  "not-enough-data": "Skip for now",
});

const LEAGUE_NAMES = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });

const STATUS_LABELS = Object.freeze({
  empty: "No eligible Pokémon owned yet",
  "moves-needed": "Moves needed",
  complete: "Team complete",
});


function raidCard(row) {
  const counterNote = row.ownedCounterCount
    ? `${row.ownedCounterCount} owned counter${row.ownedCounterCount === 1 ? "" : "s"}${row.topCounterNames.length ? ` (${row.topCounterNames.join(", ")})` : ""}`
    : "No owned counters yet";
  return `<a class="fallback-section coach-card" href="${escapeHtml(row.href)}" data-form-id="${escapeHtml(row.formId)}">
    <p class="coach-card-kicker">${escapeHtml(BAND_LEAD[row.band] ?? "")}</p>
    ${row.raidHourWhen ? `<p class="coach-card-raid-hour">${escapeHtml(row.raidHourWhen)}: every gym has ${escapeHtml(row.name)}</p>` : ""}
    <h4>${escapeHtml(row.name)}</h4>
    <p>${escapeHtml(row.headline)}</p>
    <p class="coach-card-meta">${escapeHtml(counterNote)}</p>
  </a>`;
}


function powerUpCard(row) {
  const levelLine = row.maxed
    ? "Already Level 40 — no more power-ups needed."
    : `${row.assumption ? "Assuming a fresh raid catch, " : ""}Level ${row.fromLevel} → 40: ${row.candy} Candy + ${row.stardust.toLocaleString()} Stardust`;
  return `<a class="fallback-section coach-card" href="${escapeHtml(row.href)}" data-form-id="${escapeHtml(row.formId)}">
    <p class="coach-card-kicker">${escapeHtml(row.investmentTier)} · ${escapeHtml(row.recommendation)}</p>
    <h4>${escapeHtml(row.name)}</h4>
    <p>${escapeHtml(levelLine)}</p>
    ${row.assumption && !row.maxed ? `<p class="coach-card-meta">Add exact CP/IVs on My Roster for a precise number.</p>` : ""}
    ${row.capNote ? `<p class="coach-card-meta">${escapeHtml(row.capNote)}</p>` : ""}
  </a>`;
}


function buddyCard(pick) {
  return `<a class="fallback-section coach-card" href="${escapeHtml(pick.href)}" data-form-id="${escapeHtml(pick.formId)}">
    <h4>${escapeHtml(pick.name)}</h4>
    <p>1 Candy per ${escapeHtml(pick.buddyKm)} km walked${pick.relevant ? " — also on your Power up next list" : ""}.</p>
  </a>`;
}


// Buddy plan picker: choose an owned, walkable-buddy Pokémon (favorites
// first), then optionally pin the plan to one specific detailed instance —
// buddy hearts/level track a single Pokémon, not the whole species.
function buddyPlanPicker(candidates, plan) {
  if (!candidates.length) {
    return `<p class="coach-empty">Star or add a Pokémon with a buddy walking distance to start a Best Buddy plan.</p>`;
  }
  const selected = candidates.find((candidate) => candidate.formId === plan?.formId);
  const instancePicker = selected?.instances?.length
    ? `<label class="coach-buddy-plan-field">Which one <span class="coach-card-meta">(optional — only if you track exact CP)</span>
        <select data-buddy-plan-instance>
          <option value=""${!plan?.instanceId ? " selected" : ""}>Not tracked / unsure which copy</option>
          ${selected.instances.map((instance) => `<option value="${escapeHtml(instance.id)}"${instance.id === plan?.instanceId ? " selected" : ""}>${escapeHtml(instance.label)}</option>`).join("")}
        </select>
      </label>`
    : "";
  return `<div class="coach-buddy-plan-picker">
    <label class="coach-buddy-plan-field">Buddy target
      <select data-buddy-plan-form>
        <option value=""${!plan?.formId ? " selected" : ""}>Choose a Pokémon…</option>
        ${candidates.map((candidate) => `<option value="${escapeHtml(candidate.formId)}"${candidate.formId === plan?.formId ? " selected" : ""}>${candidate.favorite ? "★ " : ""}${escapeHtml(candidate.name)}</option>`).join("")}
      </select>
    </label>
    ${instancePicker}
  </div>`;
}


function buddyPlanCard(card) {
  if (!card) return "";
  return `<div class="fallback-section coach-card coach-buddy-plan-card">
    <p class="coach-card-kicker">${card.owned ? "Active plan" : "Active plan — no longer marked owned"}</p>
    <h4>${escapeHtml(card.nickname ?? card.name)}</h4>
    <label class="resource-inline-input">Current ${jargonTerm("buddy-hearts", "hearts")} <span class="coach-card-meta">(manual — the game doesn't share this with apps)</span>
      <input inputmode="numeric" data-buddy-plan-hearts value="${card.hearts === null ? "" : escapeHtml(card.hearts)}" placeholder="0–300">
    </label>
    ${card.hearts === null
      ? `<p class="coach-card-meta">Enter hearts so far to see progress to ${jargonTerm("best-buddy", "Best Buddy")}.</p>`
      : card.isBest
        ? `<p>${jargonTerm("best-buddy", "Best Buddy")} already — the CP boost is active while this is your buddy.</p>`
        : `<p>${escapeHtml(card.levelLabel)} · ${card.heartsToBest} hearts to ${jargonTerm("best-buddy", "Best Buddy")} · about ${card.daysToBest} day${card.daysToBest === 1 ? "" : "s"} at the ${DAILY_HEART_CAP}-heart/day cap</p>`}
    <p class="coach-card-meta">${escapeHtml(card.reason)}</p>
    <button type="button" data-action="clear-buddy-plan">Clear plan</button>
  </div>`;
}


function pvpLeagueCard(row) {
  const status = row.status === "partial"
    ? `${row.emptySlots} slot${row.emptySlots === 1 ? "" : "s"} open`
    : STATUS_LABELS[row.status];
  const todoLines = row.moveTodos.flatMap((entry) => entry.lines.map((line) => `${entry.name} (${entry.slot}): ${line}`));
  return `<a class="fallback-section coach-card" href="${escapeHtml(row.href)}" data-league="${escapeHtml(row.league)}">
    <p class="coach-card-kicker">${escapeHtml(LEAGUE_NAMES[row.league] ?? row.league)}</p>
    <h4>${escapeHtml(status)}</h4>
    ${todoLines.length ? `<ul class="coach-move-todos">${todoLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
  </a>`;
}


export function renderCoach({
  data = {}, roster = {}, now = new Date(), trainerLevel = null, buddyPlan = null,
} = {}) {
  const summary = buildCoachSummary({
    data, roster, now, trainerLevel, buddyPlan,
  });
  return `<section class="coach-view" aria-labelledby="coach-view-title">
    <p class="status-kicker">Your week, planned</p>
    <h2 id="coach-view-title">Weekly Coach</h2>

    <section class="coach-section" aria-labelledby="coach-raid-title">
      <h3 id="coach-raid-title">Worth raiding this week</h3>
      ${summary.worthRaiding.length
        ? `<div class="coach-card-grid">${summary.worthRaiding.map(raidCard).join("")}</div>`
        : `<p class="coach-empty">No raid bosses are in rotation right now. <a href="./#raids">Browse raid targets</a>.</p>`}
    </section>

    <section class="coach-section" aria-labelledby="coach-power-title">
      <h3 id="coach-power-title">Power up next</h3>
      ${summary.powerUpNext.length
        ? `<div class="coach-card-grid">${summary.powerUpNext.map(powerUpCard).join("")}</div>`
        : `<p class="coach-empty">None of the top future-proof investments are in your roster yet. <a href="./?list=future#more">See the Future-Proof list</a> to plan what to save Candy and Stardust for.</p>`}
    </section>

    <section class="coach-section" aria-labelledby="coach-buddy-title">
      <h3 id="coach-buddy-title">Walk this buddy</h3>
      ${summary.buddyPick
        ? `<div class="coach-card-grid">${buddyCard(summary.buddyPick)}</div>`
        : `<p class="coach-empty">Star Pokémon you own to get a buddy-walking pick. <a href="./#more">Open My Roster</a>.</p>`}
      <h4>Best Buddy plan</h4>
      ${buddyPlanPicker(summary.buddyPlanCandidates, buddyPlan)}
      ${buddyPlanCard(summary.buddyPlanCard)}
    </section>

    <section class="coach-section" aria-labelledby="coach-pvp-title">
      <h3 id="coach-pvp-title">Your PvP team</h3>
      <div class="coach-card-grid">${summary.pvpTeams.map(pvpLeagueCard).join("")}</div>
    </section>
  </section>`;
}
