// "Which grants are actually worth the evolve?" advisor for eventEvolveMoves
// (data/curated/current-events.json's per-event, per-species move-grant list —
// current-events.json's build-time contract, not scraped). Composes existing
// machinery only:
//   local-day window   -> boss-countdown.js's localDateFromISO/dateOnly
//                          part-wise Date() construction, mirrored here.
//                          eventEvolveMoves dates are bare "YYYY-MM-DD" —
//                          `new Date("YYYY-MM-DD")` parses as UTC midnight
//                          per spec, so a US-Pacific evening would read as
//                          "already ended" — appending nothing and
//                          constructing (year, month-1, day) locally is what
//                          evolution-holds.js/boss-countdown.js already do
//                          for this exact bug.
//   pre-evolution chain -> evolution-holds.js's preEvolutionsOf (not
//                          exported there), mirrored below — same upward
//                          walk over forms[].evolves_to.
//   raid/pvp/gym ranked
//   rows                -> raids.regular/.shadow, pvp.great/ultra/master,
//                          gym.defenderRanking — the same served rows
//                          views/raids.js, views/pvp.js, views/gyms.js,
//                          elite-tm-planner.js already read (optimalFastMove/
//                          optimalChargedMove, fastMove/chargedMoves,
//                          bestFastMove/bestChargedMove).
//   PvP IV rank         -> pvp-team.js's rankIvSpread (percentile of one IV
//                          spread among all 4096, for a league, on the
//                          EVOLVED form — IVs survive evolution unchanged).
import { escapeHtml, whyLine } from "./views/home.js";
import { spriteHtml } from "./sprites.js";
import { displayMoveName } from "./views/move-sheet.js";
import { rankIvSpread } from "./pvp-team.js";

const LEAGUE_LABEL = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });

// --- local-day window (mirrors boss-countdown.js) ---

function localDateFromISO(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function dateOnly(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(dateString, now) {
  const target = localDateFromISO(dateString);
  if (target === null) return null;
  return Math.round((target - dateOnly(now)) / 86400000);
}

function daysLeftLineFor(status, startDays, endDays) {
  if (status === "upcoming") return startDays === 0 ? "Starts today" : `Starts in ${startDays} day${startDays === 1 ? "" : "s"}`;
  return endDays <= 0 ? "Ends today" : `${endDays} day${endDays === 1 ? "" : "s"} left`;
}

// --- pre-evolution chain (mirrors evolution-holds.js's preEvolutionsOf,
// not exported there) ---

function preEvolutionsOf(formId, forms, visited = new Set([formId])) {
  const parent = Object.values(forms)
    .find((candidate) => (candidate.evolves_to ?? []).some((step) => step.formId === formId));
  if (!parent || visited.has(parent.form_id)) return [];
  visited.add(parent.form_id);
  return [...preEvolutionsOf(parent.form_id, forms, visited), parent.form_id];
}

// --- role detection: does this grant's move actually matter anywhere? ---

function matchesMove(row, move, kind) {
  if (kind === "fast") return row.optimalFastMove === move;
  if (kind === "charged") return row.optimalChargedMove === move;
  return row.optimalFastMove === move || row.optimalChargedMove === move;
}

function raidHitsFor(evolvedFormId, move, kind, raids) {
  const siblingId = `${evolvedFormId}-shadow`;
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])]
    .filter((row) => row.status === "ranked" && (row.formId === evolvedFormId || row.formId === siblingId)
      && matchesMove(row, move, kind));
  return rows.map((row) => {
    const hit = { attackingType: row.attackingType, rank: row.rank, investmentTier: row.investmentTier };
    // eliteGainPct: present-and-null means "no TM-able alternative" (assemble.py),
    // absent means the row predates the field — keep that distinction, don't
    // coerce either into the other (see elite-tm-planner.js's own doc comment).
    if (Object.prototype.hasOwnProperty.call(row, "eliteGainPct")) hit.eliteGainPct = row.eliteGainPct;
    return hit;
  });
}

function pvpHitsFor(evolvedFormId, move, pvp) {
  const hits = [];
  for (const league of Object.keys(LEAGUE_LABEL)) {
    const row = (pvp?.[league] ?? []).find((entry) => entry.formId === evolvedFormId);
    if (row && (row.fastMove === move || (row.chargedMoves ?? []).includes(move))) {
      hits.push({ league, rank: row.rank });
    }
  }
  return hits;
}

function gymHitsFor(evolvedFormId, move, gym) {
  const row = (gym?.defenderRanking ?? []).find((entry) => entry.formId === evolvedFormId);
  if (!row || (row.bestFastMove !== move && row.bestChargedMove !== move)) return [];
  return [{ rank: row.rank, tier: row.tier }];
}

// --- why / whyNot ---

function naturalJoin(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function raidHitPhrase(hit) {
  let gainNote = "";
  if (hit.eliteGainPct === null) gainNote = " (no TM-able alternative)";
  else if (typeof hit.eliteGainPct === "number") gainNote = ` (+${hit.eliteGainPct}% over any TM-able set)`;
  return `${hit.attackingType} raid role at rank #${hit.rank}${gainNote}`;
}

function pvpHitPhrase(hit) {
  return `${LEAGUE_LABEL[hit.league]} rank #${hit.rank}`;
}

function gymHitPhrase(hit) {
  return `gym defense rank #${hit.rank} (Tier ${hit.tier})`;
}

function whyFor(roles) {
  const parts = [...roles.raid.map(raidHitPhrase), ...roles.pvp.map(pvpHitPhrase), ...roles.gym.map(gymHitPhrase)];
  return `Headlines the ${naturalJoin(parts)}.`;
}

function movePair(fast, charged) {
  const chargedText = Array.isArray(charged) ? charged.map(displayMoveName).join("/") : displayMoveName(charged);
  return `${displayMoveName(fast)} + ${chargedText}`;
}

function bestRankedRaidRow(evolvedFormId, raids) {
  const siblingId = `${evolvedFormId}-shadow`;
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])]
    .filter((row) => row.status === "ranked" && (row.formId === evolvedFormId || row.formId === siblingId));
  if (!rows.length) return null;
  return rows.reduce((best, row) => (row.rank < best.rank ? row : best));
}

function bestRankedPvpRow(evolvedFormId, pvp) {
  let best = null;
  for (const league of Object.keys(LEAGUE_LABEL)) {
    const row = (pvp?.[league] ?? []).find((entry) => entry.formId === evolvedFormId);
    if (row && (!best || row.rank < best.rank)) best = { ...row, league };
  }
  return best;
}

function bestGymRow(evolvedFormId, gym) {
  return (gym?.defenderRanking ?? []).find((entry) => entry.formId === evolvedFormId) ?? null;
}

// Skips must name what actually beats this move, never just assert "skip" —
// the evolved form's own best ranked raid/PvP role, in its own optimal
// moves. Gym only steps in when raid and PvP are both silent. All three
// silent -> honest "nothing ranked here", never a fabricated comparison.
function whyNotFor(evolvedFormId, name, raids, pvp, gym) {
  const bestRaid = bestRankedRaidRow(evolvedFormId, raids);
  const bestPvp = bestRankedPvpRow(evolvedFormId, pvp);
  const clauses = [];
  if (bestRaid) clauses.push(`best raid role runs ${movePair(bestRaid.optimalFastMove, bestRaid.optimalChargedMove)}`);
  if (bestPvp) clauses.push(`best PvP role (${LEAGUE_LABEL[bestPvp.league]}) runs ${movePair(bestPvp.fastMove, bestPvp.chargedMoves)}`);
  if (!clauses.length) {
    const bestGym = bestGymRow(evolvedFormId, gym);
    if (bestGym) clauses.push(`gym role runs ${movePair(bestGym.bestFastMove, bestGym.bestChargedMove)}`);
  }
  if (!clauses.length) return "No ranked raid, PvP, or gym role in this data.";
  return `${name}'s ${clauses.join("; ")} — this move changes nothing.`;
}

// --- yourCopies / ivAdvice ---

function ivSum(ivs) {
  return ivs.atk + ivs.def + ivs.sta;
}

function bestByIvSum(copies) {
  return copies.reduce((best, candidate) => (ivSum(candidate.ivs) > ivSum(best.ivs) ? candidate : best));
}

function ivAdviceFor(hasRaidMl, hasGlUl) {
  if (hasRaidMl && hasGlUl) {
    return "Chase high IVs for raids/Master League — hundo best. For Great/Ultra League, low attack, high bulk "
      + "spreads rank best instead — a hundo is NOT the PvP pick there.";
  }
  if (hasRaidMl) return "Chase high IVs — hundo best.";
  if (hasGlUl) return "Low attack, high bulk spreads rank best — a hundo is NOT the PvP pick.";
  return "No raid or PvP role for this move — IV chase doesn't matter here.";
}

function yourCopiesFor({
  evolvedFormId, forms, roster, hasRaidMl, hasGlUl, bestGlUlLeague,
}) {
  const preFormIds = new Set(preEvolutionsOf(evolvedFormId, forms ?? {}));
  const owned = (roster?.instances ?? []).filter((instance) => preFormIds.has(instance.formId));
  if (!owned.length) return { ownedCount: 0, lines: ["None owned."] };

  const withIvs = owned.filter((instance) => instance.ivs);
  const unrecordedCount = owned.length - withIvs.length;
  if (!withIvs.length) {
    return { ownedCount: owned.length, lines: [`Own ${owned.length} — IVs unrecorded, can't rank.`] };
  }
  const unrecordedNote = unrecordedCount > 0 ? ` (+${unrecordedCount} more owned, IVs unrecorded)` : "";

  const lines = [];
  if (hasRaidMl) {
    const pick = bestByIvSum(withIvs);
    const spread = `${pick.ivs.atk}/${pick.ivs.def}/${pick.ivs.sta}`;
    const label = ivSum(pick.ivs) === 45 ? "hundo" : spread;
    lines.push(`${label} for raids/Master League${unrecordedNote}`);
  }
  if (hasGlUl && bestGlUlLeague) {
    const evolvedForm = forms?.[evolvedFormId];
    const ranked = withIvs
      .map((instance) => ({ instance, rank: evolvedForm ? rankIvSpread(evolvedForm, instance.ivs, bestGlUlLeague) : null }))
      .filter((entry) => entry.rank);
    if (ranked.length) {
      const best = ranked.reduce((top, entry) => (entry.rank.rank < top.rank.rank ? entry : top));
      const spread = `${best.instance.ivs.atk}/${best.instance.ivs.def}/${best.instance.ivs.sta}`;
      lines.push(`your ${spread} ranks #${best.rank.rank} for ${LEAGUE_LABEL[bestGlUlLeague]}${lines.length ? "" : unrecordedNote}`);
    }
  }
  if (!lines.length) {
    lines.push(`Own ${owned.length} cop${owned.length > 1 ? "ies" : "y"}, but this move has no ranked role — IV chase doesn't matter.`);
  }
  return { ownedCount: owned.length, lines: lines.slice(0, 2) };
}

// --- per-grant row ---

function grantRow(grant, { forms, roster, raids, pvp, gym }) {
  const { evolvedFormId, move, kind } = grant;
  const name = forms?.[evolvedFormId]?.name ?? evolvedFormId;
  const roles = {
    raid: raidHitsFor(evolvedFormId, move, kind, raids),
    pvp: pvpHitsFor(evolvedFormId, move, pvp),
    gym: gymHitsFor(evolvedFormId, move, gym),
  };
  const verdict = (roles.raid.length || roles.pvp.length || roles.gym.length) ? "evolve" : "skip";
  const hasRaidMl = roles.raid.length > 0 || roles.pvp.some((hit) => hit.league === "master");
  const glUlHits = roles.pvp.filter((hit) => hit.league === "great" || hit.league === "ultra");
  const bestGlUlLeague = glUlHits.length
    ? [...glUlHits].sort((a, b) => a.rank - b.rank)[0].league
    : null;

  return {
    evolvedFormId,
    name,
    move,
    kind,
    roles,
    verdict,
    why: verdict === "evolve" ? whyFor(roles) : null,
    whyNot: verdict === "skip" ? whyNotFor(evolvedFormId, name, raids, pvp, gym) : null,
    yourCopies: yourCopiesFor({
      evolvedFormId, forms, roster, hasRaidMl, hasGlUl: !!bestGlUlLeague, bestGlUlLeague,
    }),
    ivAdvice: ivAdviceFor(hasRaidMl, !!bestGlUlLeague),
  };
}

// eventEvolveAdvice({eventEvolveMoves, forms, roster, raids, pvp, gym, now})
// -> {events: [{eventId, name, status, endsAt, daysLeftLine, rows}]}. Past
// events (endsAt already gone, local-day) are excluded entirely — same
// fail-closed contract evolution-holds.js's evolutionHolds uses.
export function eventEvolveAdvice({
  eventEvolveMoves, forms = {}, roster = {}, raids = {}, pvp = {}, gym = {}, now = new Date(),
} = {}) {
  const sourceEvents = eventEvolveMoves?.events ?? [];
  const events = sourceEvents
    .map((event) => ({ event, startDays: daysUntil(event.startsAt, now), endDays: daysUntil(event.endsAt, now) }))
    .filter(({ startDays, endDays }) => startDays !== null && endDays !== null && endDays >= 0)
    .map(({ event, startDays, endDays }) => {
      const status = startDays <= 0 ? "live" : "upcoming";
      return {
        eventId: event.eventId,
        name: event.name,
        status,
        endsAt: event.endsAt,
        daysLeftLine: daysLeftLineFor(status, startDays, endDays),
        rows: (event.grants ?? []).map((grant) => grantRow(grant, {
          forms, roster, raids, pvp, gym,
        })),
      };
    });
  return { events };
}

// --- Home card ---

function rankOf(hits) {
  return hits.length ? Math.min(...hits.map((hit) => hit.rank)) : Infinity;
}

function rowCompare(left, right) {
  return rankOf(left.roles.raid) - rankOf(right.roles.raid) || rankOf(left.roles.pvp) - rankOf(right.roles.pvp);
}

function rowHtml(row, forms) {
  const form = forms?.[row.evolvedFormId];
  return `<li class="xl-row" data-form-id="${escapeHtml(row.evolvedFormId)}" data-verdict="${escapeHtml(row.verdict)}">
    <div class="xl-row-heading">
      ${spriteHtml(row.evolvedFormId, forms, row.name, form?.primary_type)}
      <strong>${escapeHtml(row.name)}</strong>
      <span class="xl-row-level">${escapeHtml(displayMoveName(row.move))}</span>
      <span class="xl-row-level">${row.verdict === "evolve" ? "Evolve" : "Skip"}</span>
    </div>
    ${whyLine(row.verdict === "evolve" ? row.why : row.whyNot)}
    ${row.yourCopies.lines.map((line) => `<p class="event-evolve-copies">${escapeHtml(line)}</p>`).join("")}
    <p class="event-evolve-iv-advice">${escapeHtml(row.ivAdvice)}</p>
  </li>`;
}

function eventBlockHtml(event, forms) {
  const evolveRows = event.rows.filter((row) => row.verdict === "evolve").sort(rowCompare);
  const skipRows = event.rows.filter((row) => row.verdict === "skip").sort(rowCompare);
  const skipsHtml = skipRows.length
    ? `<details class="event-evolve-skips">
      <summary>${skipRows.length} not worth an evolve — why</summary>
      <ul class="xl-list">${skipRows.map((row) => rowHtml(row, forms)).join("")}</ul>
    </details>`
    : "";
  return `<div class="event-evolve-block" data-status="${escapeHtml(event.status)}">
    <h2>${escapeHtml(event.name)}</h2>
    <p class="briefing-note">${escapeHtml(event.daysLeftLine)}</p>
    <ul class="xl-list">${evolveRows.map((row) => rowHtml(row, forms)).join("")}</ul>
    ${skipsHtml}
  </div>`;
}

// Home briefing card, one block per live/upcoming eventEvolveAdvice() event.
// "" when nothing's live/upcoming — same silent-empty-state contract as
// evolution-holds.js's renderEvolutionHoldsCard. New classes introduced here
// (not yet in web/styles/app.css): event-evolve-card, event-evolve-block,
// event-evolve-skips, event-evolve-copies, event-evolve-iv-advice. Everything
// else reuses fallback-section/status-kicker/why-line/xl-list/xl-row/
// xl-row-heading/xl-row-level, already styled for elitetm.js/xl.js.
export function renderEventEvolveCard({ advice, forms = {} } = {}) {
  const events = advice?.events ?? [];
  if (!events.length) return "";
  return `<div class="fallback-section event-evolve-card">
    <p class="status-kicker">Evolve-exclusive moves</p>
    ${events.map((event) => eventBlockHtml(event, forms)).join("")}
  </div>`;
}
