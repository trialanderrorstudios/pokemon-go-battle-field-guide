// Cup view (#pvp/cup, P3 2026-10-05) — the live or next GO Battle League cup:
// its rules, the legal field, and the best trio from your own box. Props in,
// HTML out; cup-team.js does the work.
import { escapeHtml } from "./home.js";
import { bestCupTeam, cupCalendar, cupMeta, ownedCupPool } from "../cup-team.js";

function day(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rulesLine(cup) {
  const parts = [`≤${cup.cpCap} CP`];
  if (cup.allowedTypes?.length) parts.push(`only ${cup.allowedTypes.join(", ")}`);
  if (cup.bannedTypes?.length) parts.push(`no ${cup.bannedTypes.join(", ")}`);
  if (cup.rule === "unevolved") parts.push("unevolved Pokémon that can still evolve");
  if (cup.megasAllowed) parts.push("Megas allowed");
  return parts.join(" · ");
}

function metaHtml(meta) {
  if (!meta.length) return "";
  const rows = meta.slice(0, 12).map((m) => {
    const record = m.record
      ? ` — beats ${m.record.beats.length}, loses to ${m.record.losesTo.length} of its published matchups still legal here`
      : "";
    return `<li><strong>${m.legalRank}. ${escapeHtml(m.name)}</strong> <small>open GL #${m.openRank}${m.role ? ` · ${escapeHtml(m.role)}` : ""}${escapeHtml(record)}</small></li>`;
  }).join("");
  return `<h4>Legal field</h4>
    <p class="briefing-note">Open Great League ranks, filtered to what's legal — a proxy for the cup meta, not a cup-specific ranking.</p>
    <ol class="cup-meta">${rows}</ol>`;
}

function teamHtml(team, pool, cupName = "") {
  if (!pool.length) {
    return `<p class="briefing-note">Nothing in your logged box is legal here yet. Star or scan what you own and this fills in.</p>`;
  }
  if (team?.short) {
    return `<p class="briefing-note">Only ${pool.length} legal Pokémon in your box: ${pool.map((m) => escapeHtml(m.name)).join(", ")}.</p>`;
  }
  const roles = ["Lead", "Safe swap", "Closer"];
  const members = team.members.map((m, i) => `<li><span class="cup-role">${roles[i]}</span> <strong>${escapeHtml(m.name)}</strong> <small>open GL #${m.openRank}${m.spreadRank ? ` · your spread #${m.spreadRank}` : m.ivs ? "" : " · IVs not logged"}</small></li>`).join("");
  const warnings = [
    ...team.sharedWeaknesses.map((type) => `Two members are weak to ${type}.`),
    ...team.doubleWeaknesses.map((w) => `${w.name} takes ${w.type} at ×2.56.`),
  ];
  const bench = pool.filter((p) => !team.members.includes(p)).slice(0, 6);
  // H1: simulated 1v1 results against the cup meta (PvPoke).
  const sim = team.sim && (team.sim.covered.length || team.sim.unanswered.length)
    ? `<p class="briefing-note">Simulated vs the cup meta: ${team.sim.covered.length ? `beats ${escapeHtml(team.sim.covered.join(", "))}` : "no confirmed wins"}${team.sim.unanswered.length ? `; no answer to ${escapeHtml(team.sim.unanswered.join(", "))}` : ""}.</p>`
    : "";
  // I2: the team as a share card; the button carries the card data inline.
  const payload = JSON.stringify({
    cupName,
    members: team.members.map((m, i) => ({ name: m.name, role: roles[i], note: `open GL #${m.openRank}${m.spreadRank ? ` · spread #${m.spreadRank}` : ""}` })),
    warnings,
  });
  const share = cupName ? `<button type="button" data-action="share-card-payload" data-share-type="cupTeam" data-share-payload="${escapeHtml(payload)}">Share this team</button>` : "";
  return `${share}<ol class="cup-team">${members}</ol>${sim}
    ${warnings.length ? `<ul class="cup-warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>` : `<p class="briefing-note">No shared weakness across the trio.</p>`}
    ${bench.length ? `<p class="briefing-note">Bench: ${bench.map((m) => `${escapeHtml(m.name)} (#${m.openRank})`).join(", ")}</p>` : ""}
    <p class="briefing-note">Picked by summed open rank, penalized for weaknesses two members share — a starting point, not a simulation.</p>`;
}

function littleCupHtml(pool) {
  return `<p class="briefing-note">No Little Cup ranking ships with this app — open Great League ranks mean nothing at 500 CP, so there's no meta order here, only eligibility.</p>
    ${pool.length ? `<p class="briefing-note">Eligible in your box: ${pool.map((m) => escapeHtml(m.name)).join(", ")}</p>` : `<p class="briefing-note">Nothing logged in your box is eligible.</p>`}`;
}

export function renderCupView({ currentEvents, forms = {}, pvp = {}, pvpDeepRanks = null, roster = null, now = new Date() } = {}) {
  const { cups, uncurated } = cupCalendar(currentEvents, now);
  const ctx = { forms, pvp, pvpDeepRanks, roster };
  if (!cups.length && !uncurated.length) {
    return `<div class="fallback-section"><p class="briefing-note">No GO Battle League cup is live or announced in the current feed.</p></div>`;
  }
  const sections = cups.map((cup, index) => {
    const pool = ownedCupPool(cup, ctx);
    const body = cup.rule === "unevolved"
      ? littleCupHtml(pool)
      : `<h4>From your box</h4>${teamHtml(bestCupTeam(cup, ctx), pool, cup.name)}${metaHtml(cupMeta(cup, ctx))}`;
    return `<details class="fallback-section cup-section"${index === 0 ? " open" : ""} data-cup-event="${escapeHtml(cup.eventId)}">
      <summary><strong>${escapeHtml(cup.name)}</strong> · ${cup.live ? `live until ${escapeHtml(day(cup.endsAt))}` : `starts ${escapeHtml(day(cup.startsAt))}`}</summary>
      <p class="cup-rules">${escapeHtml(rulesLine(cup))}</p>
      ${body}
    </details>`;
  }).join("");
  const missing = uncurated.length
    ? `<p class="briefing-note">Rules not curated yet: ${uncurated.map((u) => `${escapeHtml(u.name)} (${escapeHtml(day(u.startsAt))})`).join("; ")}.</p>`
    : "";
  return `<div class="cup-view">${sections}${missing}</div>`;
}
