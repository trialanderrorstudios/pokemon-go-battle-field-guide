// Cup view (#pvp/cup, P3 2026-10-05) — the live or next GO Battle League cup:
// its rules, the legal field, and the best trio from your own box. Props in,
// HTML out; cup-team.js does the work.
import { escapeHtml } from "./home.js";
import { bestCupTeam, cupCalendar, cupMeta, ownedCupPool, simulateVsMeta } from "../cup-team.js";
import { MEASURED_AGREEMENT_PCT } from "../pvp-sim.js";

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

// H2: compact W/L/T per member against the cup meta's top 8, via the real
// turn-by-turn simulator (simulateVsMeta) — distinct from the sim/ H1 line
// above, which is PvPoke's own precomputed keyMatchups coverage.
function vsMetaHtml(vsMeta) {
  if (!vsMeta?.length) return "";
  const rows = vsMeta.map((member) => {
    if (member.noData) return `<li><strong>${escapeHtml(member.name)}</strong>: no build to simulate.</li>`;
    // Name is printed next to the mark, not only in a title/hover — a
    // phone has no hover, so the mark alone would be unreadable there.
    const marks = member.results
      .map((r) => `<span class="cup-sim-mark cup-sim-${r.result.toLowerCase()}" aria-label="${r.result} vs ${escapeHtml(r.name)}">${r.result} ${escapeHtml(r.name)}</span>`)
      .join(" ");
    const note = member.assumedPublished ? " <small>(assumes PvPoke's default IVs and recommended moves)</small>" : "";
    return `<li><strong>${escapeHtml(member.name)}</strong>${note}: ${marks}</li>`;
  }).join("");
  const agreementPct = Math.round(MEASURED_AGREEMENT_PCT);
  return `<details class="cup-sim-section">
    <summary>Simulate your team vs the cup meta</summary>
    <p class="briefing-note">Approximate: this app's PvPoke-derived simulator agrees with PvPoke's published winner in ~${agreementPct}% of tested Great League matchups, 1-1 shields. Opponents at PvPoke's own default IVs with the moveset PvPoke uses for 1-1 (leads) fights.</p>
    <ul class="cup-sim-rows">${rows}</ul>
  </details>`;
}

function teamHtml(team, pool, cupName = "", meta = [], ctx = null, cup = null) {
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
  // Guarded: an instance carrying a retired/unknown move id, or no
  // moveCatalog wired up yet, drops this optional section rather than
  // breaking the whole cup view.
  let vsMeta = "";
  if (ctx?.moveCatalog && Object.keys(ctx.moveCatalog).length) {
    try {
      vsMeta = vsMetaHtml(simulateVsMeta(team, meta, ctx, cup));
    } catch {
      vsMeta = "";
    }
  }
  return `${share}<ol class="cup-team">${members}</ol>${sim}
    ${warnings.length ? `<ul class="cup-warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>` : `<p class="briefing-note">No shared weakness across the trio.</p>`}
    ${bench.length ? `<p class="briefing-note">Bench: ${bench.map((m) => `${escapeHtml(m.name)} (#${m.openRank})`).join(", ")}</p>` : ""}
    <p class="briefing-note">Picked by summed open rank, penalized for weaknesses two members share — a starting point, not a simulation.</p>
    ${vsMeta}`;
}

function littleCupHtml(pool) {
  return `<p class="briefing-note">No Little Cup ranking ships with this app — open Great League ranks mean nothing at 500 CP, so there's no meta order here, only eligibility.</p>
    ${pool.length ? `<p class="briefing-note">Eligible in your box: ${pool.map((m) => escapeHtml(m.name)).join(", ")}</p>` : `<p class="briefing-note">Nothing logged in your box is eligible.</p>`}`;
}

export function renderCupView({ currentEvents, forms = {}, pvp = {}, pvpDeepRanks = null, roster = null, moveCatalog = {}, now = new Date() } = {}) {
  const { cups, uncurated } = cupCalendar(currentEvents, now);
  const ctx = { forms, pvp, pvpDeepRanks, roster, moveCatalog };
  if (!cups.length && !uncurated.length) {
    return `<div class="fallback-section"><p class="briefing-note">No GO Battle League cup is live or announced in the current feed.</p></div>`;
  }
  const sections = cups.map((cup, index) => {
    const pool = ownedCupPool(cup, ctx);
    const meta = cupMeta(cup, ctx);
    const body = cup.rule === "unevolved"
      ? littleCupHtml(pool)
      : `<h4>From your box</h4>${teamHtml(bestCupTeam(cup, ctx), pool, cup.name, meta, ctx, cup)}${metaHtml(meta)}`;
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
