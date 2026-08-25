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
import { dexPvpOptimal } from "./dex-pvp-optimal.js";
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
    const hit = {
      attackingType: row.attackingType, rank: row.rank, investmentTier: row.investmentTier,
      fastMove: row.optimalFastMove, chargedMove: row.optimalChargedMove,
    };
    // A shadow-sibling hit is real advice (you can evolve an owned shadow
    // pre-evolution) but must not set the WILD hunt order — flagged so
    // bestClaim can prefer the catchable form's own ranks.
    if (row.formId === siblingId) hit.shadow = true;
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
      hits.push({ league, rank: row.rank, fastMove: row.fastMove, chargedMoves: [...(row.chargedMoves ?? [])] });
    }
  }
  return hits;
}

function gymHitsFor(evolvedFormId, move, gym) {
  const row = (gym?.defenderRanking ?? []).find((entry) => entry.formId === evolvedFormId);
  if (!row) return [];
  if (row.bestFastMove === move || row.bestChargedMove === move) {
    return [{ rank: row.rank, tier: row.tier, upgrade: null, fastMove: row.bestFastMove, chargedMove: row.bestChargedMove }];
  }
  // The defender rows carry the elite-move UPGRADE as an object (r152's
  // defense-side gain data): eliteCharged = {move, gainPct, rank, tier} —
  // a granted move matching the upgrade is a real gym role the string
  // compare above misses (operator catch 2026-08-25: Togekiss Aura Sphere
  // +20.1% defense read as "no role").
  const upgrade = row.eliteCharged;
  if (upgrade && typeof upgrade === "object" && upgrade.move === move) {
    return [{
      rank: upgrade.rank ?? row.rank,
      tier: upgrade.tier ?? row.tier,
      upgrade: { gainPct: typeof upgrade.gainPct === "number" ? upgrade.gainPct : null },
      fastMove: row.bestFastMove, chargedMove: upgrade.move,
    }];
  }
  return [];
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
  // The shadow sibling reads as a separate labeled claim — two unlabeled
  // "Dark raid role" phrases on one row confused the operator (2026-08-25).
  return `${hit.shadow ? "as Shadow: " : ""}${hit.attackingType} raid role at rank #${hit.rank}${gainNote}`;
}

function pvpHitPhrase(hit) {
  return `${LEAGUE_LABEL[hit.league]} rank #${hit.rank}`;
}

function gymHitPhrase(hit) {
  if (hit.upgrade) {
    const gain = hit.upgrade.gainPct != null ? ` (+${hit.upgrade.gainPct}% defense output)` : "";
    return `gym-defense upgrade to rank #${hit.rank}${gain}`;
  }
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

// The exact league target comes from dex-pvp-optimal.js's rank-1 scan
// (operator ask 2026-08-25: "note what the optimal IV is") — same math the
// dex league cards show, so the two surfaces can never disagree.
// The target spread renders as its OWN emphasized line (operator ask
// 2026-08-25: "shouldn't get glanced over"), so ivAdvice stays prose and
// ivTarget carries the number.
function leagueTargetSpread(form, league) {
  const { optimal } = dexPvpOptimal(form ?? {}, league);
  if (!optimal) return null;
  return `${optimal.ivs.atk}/${optimal.ivs.def}/${optimal.ivs.sta} @ L${optimal.level}`;
}

function ivAdviceFor(hasRaidMl, hasGlUl, hasGym = false) {
  if (hasRaidMl && hasGlUl) {
    return "Chase high IVs for raids/Master League — hundo best. For Great/Ultra League, low attack, high bulk "
      + "spreads rank best instead — a hundo is NOT the PvP pick there.";
  }
  if (hasRaidMl) return "Chase high IVs — hundo best.";
  if (hasGlUl) return "Low attack, high bulk spreads rank best — a hundo is NOT the PvP pick.";
  // Gym defense wants bulk (operator catch 2026-08-25: this said "IV chase
  // doesn't matter" on gym-role rows like Incineroar's).
  if (hasGym) return "Gym defense wants bulk — high Defense/HP IVs; a hundo is the safe chase.";
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
  // The species' standing defender rank (full 955-form index), independent
  // of whether the granted move touches its gym set — informational context
  // the operator asked for beside the move-driven role lines.
  const indexRow = (gym?.defenderIndex ?? []).find((entry) => entry.formId === evolvedFormId);
  const gymDefenderRank = indexRow ? { rank: indexRow.rank, of: (gym.defenderIndex ?? []).length } : null;
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
    gymDefenderRank,
    ivAdvice: ivAdviceFor(hasRaidMl, !!bestGlUlLeague, roles.gym.length > 0),
    leagueTargets: Object.fromEntries(roles.pvp
      .filter((hit) => hit.league !== "master")
      .map((hit) => [hit.league, leagueTargetSpread(forms?.[grant.evolvedFormId], hit.league)])
      .filter(([, spread]) => spread)),
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

// Hunt priority = the row's single best claim to your candy, whichever lane
// it comes from — a GL #1 (Lickilicky) must not sort below a raid #6 just
// because it has no raid row. Ties break toward the raid lane, then name.
function bestClaim(row) {
  // Shadow-sibling raid ranks are excluded from the hunt order: a wild
  // catch can never be shadow, so Shadow Greninja's #4 must not rank plain
  // Greninja above hundo-worthy Inteleon (device report 2026-08-25).
  const raid = rankOf((row.roles.raid ?? []).filter((hit) => !hit.shadow));
  const pvp = rankOf(row.roles.pvp);
  const gym = row.roles.gym?.length ? Math.min(...row.roles.gym.map((hit) => hit.rank ?? 999)) : 999;
  return Math.min(raid, pvp, gym);
}

function rowCompare(left, right) {
  return bestClaim(left) - bestClaim(right)
    || rankOf(left.roles.raid) - rankOf(right.roles.raid)
    || String(left.name).localeCompare(String(right.name));
}

// Purpose-built row (r156): the borrowed .xl-row baseline-flex heading
// collapsed its text spans to a one-character column beside the 48px sprite
// on portrait tablets — text rendered VERTICALLY (device report
// 2026-08-25). Own grid classes, and evolve rows carry an explicit hunt
// priority number so the order reads as a ranking, not a list.
// The full moveset recipe per role lane (operator ask 2026-08-25: "the full
// recipe for what their moves should be") — straight from the role rows'
// own optimal sets, deduped when lanes agree. PvP sets with a second
// charged move carry the form's real third-slot dust cost.
// The full moveset recipe per role lane, as LABELED SLOT LINES rather than
// prose (operator ask 2026-08-25: "Fast move? Elite move, and second charge
// move? Separate lines, not one sentence") — this is the part of the card
// you act on at the TM screen. The event-granted move is flagged in place.
function recipeBlocks(row, forms) {
  const form = forms?.[row.evolvedFormId];
  const granted = new Set(row.moves ?? [row.move]);
  const tag = (move) => (granted.has(move) ? " — the event move" : "");
  const blocks = [];
  const seen = new Set();
  const bestRaid = (row.roles.raid ?? []).filter((hit) => !hit.shadow).sort((a, b) => a.rank - b.rank)[0];
  if (bestRaid?.fastMove && bestRaid?.chargedMove) {
    seen.add(`${bestRaid.fastMove}|${bestRaid.chargedMove}`);
    blocks.push({ label: `Raids (${bestRaid.attackingType})`, lines: [
      `Fast: ${displayMoveName(bestRaid.fastMove)}${tag(bestRaid.fastMove)}`,
      `Charged: ${displayMoveName(bestRaid.chargedMove)}${tag(bestRaid.chargedMove)}`,
    ] });
  }
  for (const hit of row.roles.pvp ?? []) {
    const charged = (hit.chargedMoves ?? []).filter(Boolean);
    if (!hit.fastMove || !charged.length) continue;
    const key = `${hit.fastMove}|${charged.join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lines = [
      `Fast: ${displayMoveName(hit.fastMove)}${tag(hit.fastMove)}`,
      `Charged: ${displayMoveName(charged[0])}${tag(charged[0])}`,
    ];
    if (charged[1]) {
      const cost = form?.third_move_cost ? ` (${Number(form.third_move_cost).toLocaleString()} dust to unlock)` : "";
      lines.push(`2nd Charged: ${displayMoveName(charged[1])}${tag(charged[1])}${cost}`);
    }
    blocks.push({ label: LEAGUE_LABEL[hit.league], lines });
  }
  const gymHit = (row.roles.gym ?? [])[0];
  if (gymHit?.fastMove && gymHit?.chargedMove && !seen.has(`${gymHit.fastMove}|${gymHit.chargedMove}`)) {
    blocks.push({ label: "Gym defense", lines: [
      `Fast: ${displayMoveName(gymHit.fastMove)}${tag(gymHit.fastMove)}`,
      `Charged: ${displayMoveName(gymHit.chargedMove)}${tag(gymHit.chargedMove)}`,
    ] });
  }
  return blocks;
}

// Per-league/role rank as its OWN LINE (operator ask 2026-08-25, twice:
// the ranks are the headline claim — buried-in-prose first, chips second;
// stacked labeled lines is the read they want).
function rankLinesHtml(row) {
  const lines = [];
  for (const hit of (row.roles.raid ?? []).slice().sort((a, b) => (a.shadow ? 1 : 0) - (b.shadow ? 1 : 0) || a.rank - b.rank)) {
    lines.push(`<p class="ev-adv-rank-line is-raid">${escapeHtml(`${hit.shadow ? "Shadow " : ""}${hit.attackingType} raids: #${hit.rank}`)}</p>`);
  }
  for (const hit of row.roles.pvp ?? []) {
    // Each league's own rank-1 target rides ITS line (operator ask
    // 2026-08-25: IVs with the league, not at the card bottom).
    const target = row.leagueTargets?.[hit.league];
    lines.push(`<p class="ev-adv-rank-line is-pvp">${escapeHtml(`${LEAGUE_LABEL[hit.league]}: #${hit.rank}${target ? ` — target ${target}` : ""}`)}</p>`);
  }
  for (const hit of row.roles.gym ?? []) {
    lines.push(`<p class="ev-adv-rank-line is-gym">${escapeHtml(`Gym defense: #${hit.rank}${hit.upgrade?.gainPct != null ? ` (+${hit.upgrade.gainPct}% output)` : ""}`)}</p>`);
  }
  // Standing defender rank as context when the move itself has no gym role.
  if (!(row.roles.gym ?? []).length && row.gymDefenderRank) {
    lines.push(`<p class="ev-adv-rank-line is-gym">${escapeHtml(`Gym defender: #${row.gymDefenderRank.rank} of ${row.gymDefenderRank.of}`)}</p>`);
  }
  return lines.join("");
}

function rowHtml(row, forms, priority = null) {
  const form = forms?.[row.evolvedFormId];
  return `<li class="ev-adv-row" data-form-id="${escapeHtml(row.evolvedFormId)}" data-verdict="${escapeHtml(row.verdict)}">
    ${priority != null ? `<span class="ev-adv-priority">#${escapeHtml(priority)}</span>` : `<span class="ev-adv-priority is-skip">–</span>`}
    ${spriteHtml(row.evolvedFormId, forms, row.name, form?.primary_type)}
    <div class="ev-adv-body">
      <p class="ev-adv-heading"><strong>${escapeHtml(row.name)}</strong> · ${escapeHtml((row.moves ?? [row.move]).map(displayMoveName).join(" + "))} · <span class="ev-adv-verdict">${row.verdict === "evolve" ? "Evolve" : "Skip"}</span></p>
      ${row.verdict === "evolve" ? rankLinesHtml(row) : ""}
      ${whyLine(row.verdict === "evolve" ? row.why : row.whyNot)}
      ${row.verdict === "evolve" ? recipeBlocks(row, forms).map((block) => `<div class="ev-adv-recipe-block">
        <p class="ev-adv-recipe-label">${escapeHtml(block.label)}</p>
        ${block.lines.map((line) => `<p class="ev-adv-recipe-line">${escapeHtml(line)}</p>`).join("")}
      </div>`).join("") : ""}
      ${row.yourCopies.lines.map((line) => `<p class="event-evolve-copies">${escapeHtml(line)}</p>`).join("")}
      <p class="event-evolve-iv-advice">${escapeHtml(row.ivAdvice)}</p>

    </div>
  </li>`;
}

// Two grants on one species (Walrein's fast + charged) render as ONE row —
// duplicate cards read as a bug on-device. Moves join with " + "; roles are
// identical between the merged rows by construction when both moves hit the
// same lanes, and unioned when they differ.
function mergeRowsByForm(rows) {
  const byForm = new Map();
  for (const row of rows) {
    const existing = byForm.get(row.evolvedFormId);
    if (!existing) { byForm.set(row.evolvedFormId, { ...row, moves: [row.move] }); continue; }
    existing.moves.push(row.move);
    for (const lane of ["raid", "pvp", "gym"]) {
      const seen = new Set(existing.roles[lane].map((hit) => JSON.stringify(hit)));
      for (const hit of row.roles[lane]) if (!seen.has(JSON.stringify(hit))) existing.roles[lane].push(hit);
    }
    if (row.why && existing.why && row.why !== existing.why) existing.why = `${existing.why} ${row.why}`;
  }
  return [...byForm.values()];
}

function eventBlockHtml(event, forms) {
  const evolveRows = mergeRowsByForm(event.rows.filter((row) => row.verdict === "evolve")).sort(rowCompare);
  const skipRows = mergeRowsByForm(event.rows.filter((row) => row.verdict === "skip")).sort(rowCompare);
  const skipsHtml = skipRows.length
    ? `<details class="event-evolve-skips">
      <summary>${skipRows.length} not worth an evolve — why</summary>
      <ul class="ev-adv-list">${skipRows.map((row) => rowHtml(row, forms)).join("")}</ul>
    </details>`
    : "";
  return `<div class="event-evolve-block" data-status="${escapeHtml(event.status)}">
    <h2>${escapeHtml(event.name)}</h2>
    <p class="briefing-note">${escapeHtml(event.daysLeftLine)} Hunt order — best use of your candy first.</p>
    <ol class="ev-adv-list">${evolveRows.map((row, index) => rowHtml(row, forms, index + 1)).join("")}</ol>
    <p class="ev-adv-shadow-warning">Shadow pre-evolutions: evolving keeps Frustration and does not reliably grant the event move — clear Frustration at a Team GO Rocket takeover first. (Learned the hard way, 2026-08-25.)</p>
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
