// #hundo: hundo-hunting priority list (round 15). Composes existing engines
// only — no new IV/CP/rank math forked here:
//   - raid relevance -> data.raids.regular/shadow ranked rows, the same
//     signal triage.js's displayedRaidRelevance and rocket.js already read
//   - Master League relevance -> data.pvp.master ranked rows. Master has no
//     CP cap (LEAGUE_CP_CAP.master === null in pvp-team.js), so no build ever
//     trades Attack IV for a lower level there — max IVs always win.
//   - Great/Ultra relevance, and the honest "hundo often ranks worse than
//     rank-1 under a CP cap" fact-check -> pvp-team.js's rankIvSpread(), the
//     app's own exhaustive 4096-IV-spread search (same one instanceLeagueRank
//     and Triage/PvP already use) — never re-derived or asserted without it.
//   - hundo CP for raid bosses -> raidTargetTool.targets, the exact figure
//     currentBossCard already shows on Home/Raids/Rocket for a raid encounter
//   - hundo CP for wild-only Spotlight Hour/Community Day spawns ->
//     instances.js calculateCp() at level 40, the same reference calc
//     pvp-team.js's starEligibility uses — labeled as a ceiling reference
//     since a wild encounter isn't a fixed level the way a raid is
//   - "available now/upcoming" -> data.currentBosses + data.currentEvents,
//     the same two feeds Home/Rocket/Today already compose
import { calculateCp } from "../instances.js";
import { rankIvSpread, rankSummaryText } from "../pvp-team.js";
import { spriteHtml } from "../sprites.js";
import { escapeHtml } from "./home.js";
import { jargonTerm } from "../glossary.js";

const HUNDO_IVS = Object.freeze({ atk: 15, def: 15, sta: 15 });

// Raid Hour / Max Monday / Max Battle events name an *upcoming* raid-boss
// appearance the same way current-bosses.json names the *current* rotation —
// folded together below so "current + upcoming raid bosses" covers both.
const RAID_EVENT_KINDS = new Set(["raid-hour", "max-mondays", "max-battles"]);
// Spotlight Hour / Community Day are wild-catch features, not raids — no
// fixed encounter level, so they get the honestly-different hundo CP below.
const SPAWN_EVENT_KINDS = new Set(["pokemon-spotlight-hour", "community-day"]);

const CATEGORY_WEIGHT = Object.freeze({ chase: 2, "dont-chase": 1, neutral: 0 });
const TIER_WEIGHT = Object.freeze({ "S+": 4, S: 3, A: 2, B: 1, C: 0 });

function notEnded(event, now) {
  return !event?.endsAt || new Date(event.endsAt) >= now;
}

function isHappeningNow(event, now) {
  return Boolean(event?.startsAt) && new Date(event.startsAt) <= now && notEnded(event, now);
}

// One entry per candidate species, folding rotation + event data together so
// a boss that's both in the current rotation and this week's Raid Hour only
// shows up once.
function collectCandidates(currentBosses, currentEvents, now) {
  const byForm = new Map();
  const ensure = (formId) => {
    if (!byForm.has(formId)) {
      byForm.set(formId, {
        formId, isRaidBoss: false, tier: null, endsAt: null, raidEvents: [], spawnEvents: [],
      });
    }
    return byForm.get(formId);
  };
  for (const boss of currentBosses?.bosses ?? []) {
    if (!boss?.formId) continue;
    const entry = ensure(boss.formId);
    entry.isRaidBoss = true;
    entry.tier = boss.tier;
    entry.endsAt = boss.endsAt;
  }
  for (const event of currentEvents?.events ?? []) {
    if (!event?.formId || !notEnded(event, now)) continue;
    if (RAID_EVENT_KINDS.has(event.kind)) {
      const entry = ensure(event.formId);
      entry.isRaidBoss = true;
      entry.raidEvents.push(event);
    } else if (SPAWN_EVENT_KINDS.has(event.kind)) {
      ensure(event.formId).spawnEvents.push(event);
    }
  }
  return [...byForm.values()];
}

function bestRaidRow(formId, raids) {
  let best = null;
  for (const lane of ["regular", "shadow"]) {
    for (const row of raids?.[lane] ?? []) {
      if (row?.formId !== formId || row.status !== "ranked") continue;
      if (!best || Number(row.rank) < Number(best.rank)) best = row;
    }
  }
  return best;
}

// pvp.json's great/ultra/master arrays are already just the ranked list (no
// "no_released_option" placeholders the way raids.json's 15-slot rows have),
// same assumption triage.js's pvpRows() makes — so this is a plain lookup.
function rankedRow(formId, rows) {
  return (rows ?? []).find((row) => row?.formId === formId) ?? null;
}

function bestTierWeight(...tiers) {
  return Math.max(0, ...tiers.map((tier) => TIER_WEIGHT[tier] ?? -1));
}

// Great/Ultra "don't chase" fact-check: how the hundo's own 15/15/15 spread
// actually ranks in this league's 4096-spread search, not an assumed claim.
function hundoCapCheck(form, league, row) {
  const rank = rankIvSpread(form, HUNDO_IVS, league);
  if (!rank) return null;
  return {
    rank: rank.rank,
    total: rank.total,
    percentile: rank.percentile,
    ratio: row?.rankOne?.statProduct ? rank.statProduct / row.rankOne.statProduct : null,
  };
}

function verdictFor(form, formId, data) {
  const raidRow = bestRaidRow(formId, data?.raids);
  const masterRow = rankedRow(formId, data?.pvp?.master);
  if (raidRow || masterRow) {
    return {
      category: "chase", raid: raidRow, master: masterRow, league: null, leagueRow: null, capCheck: null,
      tierWeight: bestTierWeight(raidRow?.investmentTier, masterRow?.investmentTier),
    };
  }
  const greatRow = rankedRow(formId, data?.pvp?.great);
  const ultraRow = rankedRow(formId, data?.pvp?.ultra);
  if (greatRow || ultraRow) {
    const league = greatRow ? "great" : "ultra";
    const leagueRow = greatRow ?? ultraRow;
    const capCheck = hundoCapCheck(form, league, leagueRow);
    // capCheck.rank === 1 means the hundo's own 15/15/15 spread IS the
    // rank-1 build under this league's cap (no lower-Attack spread beats
    // it) — chase it, don't tell the user to chase "rank-1 instead".
    return {
      category: capCheck?.rank === 1 ? "chase" : "dont-chase", raid: null, master: null, league, leagueRow,
      capCheck,
      tierWeight: bestTierWeight(leagueRow?.investmentTier),
    };
  }
  return {
    category: "neutral", raid: null, master: null, league: null, leagueRow: null, capCheck: null, tierWeight: 0,
  };
}

function availabilityFor(candidate, now) {
  const events = [...candidate.raidEvents, ...candidate.spawnEvents];
  const nowEvent = events.find((event) => isHappeningNow(event, now));
  if (nowEvent) return { kind: "now", label: `Featured now — ${nowEvent.name}`, weight: 3 };
  if (candidate.isRaidBoss && candidate.tier) {
    return {
      kind: "rotation",
      label: `${candidate.tier} raid, in rotation${candidate.endsAt ? ` through ${candidate.endsAt}` : ""}`,
      weight: 2,
    };
  }
  const upcoming = events
    .filter((event) => new Date(event.startsAt) > now)
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))[0];
  if (upcoming) return { kind: "upcoming", label: `Upcoming — ${upcoming.name}`, weight: 1 };
  return { kind: "rotation", label: "In rotation", weight: 0 };
}

function hundoCpFor(form, candidate, raidTargetTool) {
  if (candidate.isRaidBoss) {
    const target = (raidTargetTool?.targets ?? []).find((row) => row.bossFormId === candidate.formId);
    if (Number.isFinite(target?.normal?.hundoCP)) {
      return { cp: target.normal.hundoCP, label: "Raid hundo CP (Level 20 encounter)" };
    }
  }
  return {
    cp: calculateCp(form, HUNDO_IVS, 40),
    label: "Level 40 hundo CP (reference — wild encounters aren't a fixed level)",
  };
}

// Pure data layer — web/src/app.js's hundo() renderer and this file's
// renderHundo() are the only consumers.
export function buildHundoRows({ data = {}, now = new Date(), weakLaneTypes = new Set() } = {}) {
  const forms = data.forms ?? data.core?.forms ?? {};
  const candidates = collectCandidates(data.currentBosses, data.currentEvents, now);
  const rows = candidates.map((candidate) => {
    const form = forms[candidate.formId];
    if (!form) return null; // unreleased/unknown form id — never guess at one
    const verdict = verdictFor(form, candidate.formId, data);
    const availability = availabilityFor(candidate, now);
    const hundo = hundoCpFor(form, candidate, data.raidTargetTool);
    return {
      formId: candidate.formId,
      name: form.name,
      primaryType: form.primary_type,
      isRaidBoss: candidate.isRaidBoss,
      ...verdict,
      // Integration seam (round 15): this hundo is also a ranked raid
      // attacker of a type the roster has no solid counter for yet
      // (gap-analyzer.js's weakLanes), so building it closes a coverage gap
      // too — surface the Build Next cross-link. Empty set (the default, and
      // whenever raids/roster data hasn't loaded) means no link, never a
      // guessed gap.
      fillsWeakLane: Boolean(verdict.raid && weakLaneTypes.has(verdict.raid.attackingType)),
      hundoCp: hundo.cp,
      hundoCpLabel: hundo.label,
      availability,
      href: candidate.isRaidBoss ? `./?boss=${encodeURIComponent(candidate.formId)}#raids` : "./#pvp",
      score: CATEGORY_WEIGHT[verdict.category] * 100 + availability.weight * 10 + verdict.tierWeight,
    };
  }).filter(Boolean);
  rows.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const counts = { chase: 0, "dont-chase": 0, neutral: 0 };
  for (const row of rows) counts[row.category] += 1;
  return { rows, counts };
}

const LEAGUE_LABEL = Object.freeze({ great: "Great League", ultra: "Ultra League" });

function verdictLine(row) {
  const hundoTerm = jargonTerm("hundo");
  if (row.category === "chase") {
    if (row.raid) {
      return `Top raid attacker — ranks #${escapeHtml(row.raid.rank)} for ${escapeHtml(row.raid.attackingType)} (${escapeHtml(row.raid.investmentTier)}). Max stats matter here — chase the ${hundoTerm}.`;
    }
    if (row.master) {
      return `Master League pick (#${escapeHtml(row.master.rank)}, ${escapeHtml(row.master.investmentTier)}) with no CP cap — every IV point helps, no trade-off to make. The ${hundoTerm} is simply the best build here.`;
    }
    const leagueLabel = LEAGUE_LABEL[row.league] ?? "This league";
    return `${leagueLabel}-relevant (#${escapeHtml(row.leagueRow.rank)}, ${escapeHtml(row.leagueRow.investmentTier)}) — its 15/15/15 spread is already the rank-1 IV spread under this league's cap, so chase the ${hundoTerm} here.`;
  }
  if (row.category === "dont-chase") {
    const leagueLabel = LEAGUE_LABEL[row.league] ?? "This league";
    const check = row.capCheck;
    const standing = check
      ? `its 15/15/15 spread only ${rankSummaryText({ eligible: true, rank: check.rank, total: check.total, percentile: check.percentile })}${Number.isFinite(check.ratio) ? ` (${(check.ratio * 100).toFixed(1)}% of rank-1's ${jargonTerm("stat-product", "stat product")})` : ""}`
      : "a lower-Attack IV spread usually beats it under the CP cap";
    return `${leagueLabel}-relevant (#${escapeHtml(row.leagueRow.rank)}, ${escapeHtml(row.leagueRow.investmentTier)}), but don't chase the ${hundoTerm} here — ${standing}. A capped league lets a lower Attack IV reach a higher level under the same cap, and the extra Defense/HP from that higher level usually outweighs the Attack it gave up — chase the rank-1 IV spread instead on the PvP page.`;
  }
  return `Not currently in the raid or PvP guides — a ${hundoTerm} here is a nice collection stat, not a competitive need.`;
}

const CATEGORY_BADGE = Object.freeze({ chase: "Chase it", "dont-chase": "Don't chase", neutral: "Optional" });

// Reuses home.js's fallback-section/home-boss-card/home-boss-heading/boss-tier
// classes (currentBossCard's own layout) and triage.js's badge-pill class —
// only the 3 category colors below are new CSS.
function rowHtml(row, forms) {
  return `<a class="fallback-section home-boss-card" href="${escapeHtml(row.href)}" data-form-id="${escapeHtml(row.formId)}">
    <div class="home-boss-heading">${spriteHtml(row.formId, forms, row.name, row.primaryType)}<h3>${escapeHtml(row.name)}</h3><span class="triage-badge" data-hundo-category="${row.category}">${CATEGORY_BADGE[row.category]}</span></div>
    <p class="boss-tier">${escapeHtml(row.hundoCp)} CP — ${escapeHtml(row.hundoCpLabel)}</p>
    <p class="boss-tier">${escapeHtml(row.availability.label)}</p>
    <p class="today-task-detail">${verdictLine(row)}</p>
    ${row.fillsWeakLane ? `<p class="event-action">Also fills a weak lane in your roster — <a class="safe-escape" href="./#buildnext">See Build Next →</a></p>` : ""}
  </a>`;
}

export function renderHundo({ data = {}, now = new Date(), weakLaneTypes = new Set() } = {}) {
  const forms = data.forms ?? data.core?.forms ?? {};
  const { rows } = buildHundoRows({ data, now, weakLaneTypes });
  const body = rows.length
    ? `<div class="home-boss-grid">${rows.map((row) => rowHtml(row, forms)).join("")}</div>`
    : `<p class="gym-empty">No raid bosses or featured spawns in rotation right now — check back once a new one goes live.</p>`;
  return `<section class="hundo-view" aria-labelledby="hundo-view-title">
    <p class="status-kicker">Hundo-hunting priority</p>
    <h2 id="hundo-view-title">Is a hundo of this worth chasing?</h2>
    <p>A ${jargonTerm("hundo")} is always the strongest build for raids and Master League — no CP cap means every extra IV helps. But in Great and Ultra League, a capped ${jargonTerm("cp", "CP")} often rewards a <em>lower</em> Attack IV over a hundo, because it lets the build reach a higher level (more Defense and HP) under the same cap. This list ranks today's raid bosses and featured spawns by whether the hundo is actually worth chasing, or whether you should chase the rank-1 spread instead.</p>
    ${body}
  </section>`;
}
