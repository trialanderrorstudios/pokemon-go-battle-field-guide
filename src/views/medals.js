// Medals & levels page (F1-F3). Pure HTML from medals.js; edits arrive via
// data-medal-edit inputs that app.js's change handler saves per profile.
import {
  levelPlan, medalRows, nextPlatinums, platinumCount, TIER_LABEL, TIER_ORDER, TYPE_MEDAL_COUNT, TYPE_MEDAL_PLATINUM, xpPlan,
} from "../medals.js";
import { escapeHtml } from "./home.js";

const fmt = (n) => Number(n).toLocaleString("en-US");

function editInput(kind, key, value, label, attrs = "") {
  return `<input type="number" inputmode="numeric" min="0" class="medal-input" data-medal-edit="${kind}" data-medal-key="${escapeHtml(key)}" value="${value ?? ""}" aria-label="${escapeHtml(label)}" ${attrs}>`;
}

function xpSection(state, trainerLevel) {
  const plan = xpPlan(state.xp, trainerLevel);
  const body = plan
    ? `<p><strong>${plan.toNext === null ? "" : `${fmt(plan.toNext)} XP to level ${plan.nextLevel}`}</strong>${plan.toNext === null ? "" : " · "}${fmt(plan.to80)} XP to level 80</p>
      ${plan.toNext ? `<p class="briefing-note">With a Lucky Egg, each evolve is ${fmt(plan.perEvolve)} XP: about ${fmt(plan.evolvesToNext)} evolves, roughly ${fmt(plan.eggsToNext)} egg${plan.eggsToNext === 1 ? "" : "s"} at ~60 evolves per egg (an estimate). A double evolution-XP event doubles that again.</p>` : ""}`
    : `<p class="briefing-note">Enter the total XP from your trainer profile to see what's left.</p>`;
  return `<section class="fallback-section medal-xp">
    <h3>XP</h3>
    <label>Total XP ${editInput("xp", "xp", state.xp, "Total XP")}</label>
    ${body}
  </section>`;
}

function levelSection(state, trainerLevel) {
  const levels = levelPlan(state, trainerLevel);
  const rows = levels.map((level) => `<details class="medal-level"${level.next ? " open" : ""}>
      <summary><strong>Level ${level.level}</strong> · ${level.reached ? "reached" : `${level.tasks.filter((t) => t.done).length}/4 tasks`}${level.platinumShort && !level.reached ? ` · ${level.platinumShort} platinum short` : ""}</summary>
      <ul class="medal-tasks">${level.tasks.map((task) => `<li><label>
        <input type="checkbox" ${task.auto ? "disabled" : `data-medal-edit="task" data-medal-key="${task.key}"`} ${task.done || level.reached ? "checked" : ""}>
        ${escapeHtml(task.text)}${task.auto ? " <small>(counted from your medals below)</small>" : ""}</label></li>`).join("")}</ul>
    </details>`).join("");
  return `<section class="fallback-section"><h3>Levels 71–80</h3>
    <p class="briefing-note">Tasks and XP from Leek Duck's trainer-level reference.</p>${rows}</section>`;
}

function medalSection(state, dexCaught) {
  const rows = medalRows(state);
  const byTier = TIER_ORDER.map((tier) => {
    const group = rows.filter((row) => row.tier === tier);
    return `<details class="medal-tier"${tier === "cheap" ? " open" : ""}><summary><strong>${escapeHtml(TIER_LABEL[tier])}</strong> · ${group.filter((r) => r.done).length}/${group.length} platinum</summary>
      <ul class="medal-list">${group.map((row) => `<li class="${row.done ? "is-done" : ""}">
        <span class="medal-name">${row.done ? "✓ " : ""}${escapeHtml(row.name)} <small>${escapeHtml(row.counts)}${Number.isInteger(dexCaught?.[row.name]) ? ` · Living Dex: ${dexCaught[row.name]}` : ""}</small></span>
        <span class="medal-edit">${editInput("count", row.name, row.count, `${row.name} count`)} / ${editInput("target", row.name, row.target, `${row.name} platinum target`)}</span>
      </li>`).join("")}</ul></details>`;
  }).join("");
  return `<section class="fallback-section"><h3>Medals</h3>
    <p class="briefing-note">Enter the count from each medal in-game. Targets are community-sourced; if the game shows a different platinum number, change it here.</p>
    <label>Type medals at platinum (of ${TYPE_MEDAL_COUNT}, ${fmt(TYPE_MEDAL_PLATINUM)} catches each) ${editInput("types", "types", state.typePlatinums, "Type medals at platinum", `max="${TYPE_MEDAL_COUNT}"`)}</label>
    ${byTier}</section>`;
}

// dexCaught: { Kanto: n, ... } from the Living Dex (G3) — shown beside each
// regional medal as a hint, never written into the count: the dex only knows
// what you've marked, the medal screen knows what you've registered.
export function renderMedalsView({ state, trainerLevel = null, profileName = null, dexCaught = null } = {}) {
  const platinums = platinumCount(state);
  const next = nextPlatinums(state, 6);
  return `<section class="medals-view" aria-labelledby="medals-title">
    <p class="status-kicker">Progression${profileName ? ` · ${escapeHtml(profileName)}` : ""}</p>
    <h2 id="medals-title">Medals &amp; levels</h2>
    <p><strong>${platinums}</strong> platinum medal${platinums === 1 ? "" : "s"}${Number.isInteger(trainerLevel) ? ` · level ${trainerLevel}` : ""}</p>
    ${next.length ? `<div class="fallback-section"><h3>Cheapest next platinums</h3><ol>${next.map((row) => `<li><strong>${escapeHtml(row.name)}</strong> — ${row.remaining === null ? `count not entered (target ${fmt(row.target)})` : `${fmt(row.remaining)} ${escapeHtml(row.counts)} to go`} <small>(${escapeHtml(TIER_LABEL[row.tier])})</small></li>`).join("")}</ol></div>` : ""}
    ${levelSection(state, trainerLevel)}
    ${xpSection(state, trainerLevel)}
    ${medalSection(state, dexCaught)}
  </section>`;
}
