// Cup team builder (P3, 2026-10-05). Retro Cup and Mega Color Cup were both
// built by hand in chat: filter the Great League list to what's legal, re-read
// each mon's published wins/losses against only the legal field, then pick a
// trio from the operator's own box that doesn't share a weakness. This is
// that procedure, against whatever cup the feed says is live or next.
//
// Rules come from event rows (`event.cups`, merged by assemble.py from
// data/curated/cup-rules.json); the window comes from the feed. Ranking uses
// the open Great League list (pvpDeepRanks) filtered to legal forms — a proxy
// for a cup meta, labelled as such, because no cup-specific ranking ships.
// Little Cup is the exception: open GL rank means nothing at 500 CP, so it
// reports eligibility and spreads but never claims a meta order.
import { effectivenessOf } from "./type-chart.js";
import { solveLevel } from "./instances.js";
import { rankIvSpread } from "./pvp-team.js";
import { simulatePvp } from "./pvp-sim.js";

const META_SIZE = 20;
const CANDIDATE_POOL = 12;
// Two members weak (x1.6+) to the same threat type cost a trio this many rank
// points. Heuristic — Color Cup's Cradily problem was exactly this shape.
const SHARED_WEAKNESS_COST = 40;
// Which pvp.<league> list a cup's CP cap reads from — the only two capped
// leagues this app ships rankings/builds for. A cup at any other cap (the
// curated 500-CP cups are all Little Cup, rule "unevolved", which never
// reaches this map) has no matching list to simulate or rank-spread against.
const CP_CAP_LEAGUE = { 1500: "great", 2500: "ultra" };

function typesOf(form) {
  return [form?.primary_type, form?.secondary_type].filter(Boolean);
}

function regularIdOf(formId) {
  return formId.replace(/-shadow$/, "");
}

function isMega(formId, form) {
  // includes(), not regex literals: the public-safety scanner reads a regex
  // literal like "slash-mega-slash" as an absolute filesystem path.
  return formId.includes("-mega") || (form?.tags ?? []).includes("mega") || (form?.name ?? "").includes("(Mega");
}

// Little Cup: "able to evolve and has not evolved even once". Shadow forms
// carry no evolves_to edges in the data, so the regular form decides.
function unevolvedBase(formId, forms, evolvedTargets) {
  const regular = regularIdOf(formId);
  return (forms[regular]?.evolves_to ?? []).length > 0 && !evolvedTargets.has(regular);
}

export function evolvedTargetSet(forms) {
  const targets = new Set();
  for (const form of Object.values(forms)) for (const edge of form.evolves_to ?? []) targets.add(edge.formId);
  return targets;
}

export function isCupLegal(formId, cup, forms, evolvedTargets = evolvedTargetSet(forms)) {
  const form = forms[formId];
  if (!form || form.released === false) return false;
  if (isMega(formId, form) && !cup.megasAllowed) return false;
  const types = typesOf(form);
  if (cup.allowedTypes?.length && !types.some((type) => cup.allowedTypes.includes(type))) return false;
  if (cup.bannedTypes?.length && types.some((type) => cup.bannedTypes.includes(type))) return false;
  if (cup.rule === "unevolved" && !unevolvedBase(formId, forms, evolvedTargets)) return false;
  return true;
}

// The live cup, else the soonest upcoming one — with its window from the feed.
// Rotations whose rules aren't curated come back separately so the view can
// say so instead of silently skipping a week.
export function cupCalendar(currentEvents, now = new Date()) {
  const rows = (currentEvents?.events ?? [])
    .filter((event) => event.kind === "go-battle-league" && new Date(event.endsAt) >= now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const cups = [];
  for (const event of rows) {
    for (const cup of event.cups ?? []) {
      cups.push({ ...cup, eventId: event.eventId, startsAt: event.startsAt, endsAt: event.endsAt, live: new Date(event.startsAt) <= now });
    }
  }
  const uncurated = rows
    .filter((event) => !(event.cups ?? []).length && event.name.toLowerCase().includes("cup"))
    .map((event) => ({ name: event.name.split("|")[0].trim(), startsAt: event.startsAt }));
  return { cups, uncurated };
}

// Published wins/losses re-read against only the legal field — the "food 4/5,
// threats 1/5" count used for both cups. Only top-50 rows carry these lists.
function legalRecord(row, cup, forms, evolvedTargets) {
  if (!row) return null;
  const legal = (entry) => isCupLegal(entry.opponentFormId, cup, forms, evolvedTargets);
  return {
    beats: (row.keyMatchups ?? []).filter(legal).map((m) => ({ name: m.opponentName, rating: m.rating })),
    losesTo: (row.keyCounters ?? []).filter(legal).map((m) => ({ name: m.opponentName, rating: m.rating })),
  };
}

export function cupMeta(cup, { forms, pvp, pvpDeepRanks }) {
  if (cup.rule === "unevolved") return [];
  const evolvedTargets = evolvedTargetSet(forms);
  const rows = new Map((pvp?.great ?? []).map((row) => [row.formId, row]));
  return Object.entries(pvpDeepRanks?.ranks ?? {})
    .filter(([formId, ranks]) => Number.isInteger(ranks[0]) && isCupLegal(formId, cup, forms, evolvedTargets))
    .sort((a, b) => a[1][0] - b[1][0])
    .slice(0, META_SIZE)
    .map(([formId, ranks], index) => ({
      formId, name: forms[formId].name, types: typesOf(forms[formId]),
      legalRank: index + 1, openRank: ranks[0],
      role: rows.get(formId)?.primaryRole ?? null,
      record: legalRecord(rows.get(formId), cup, forms, evolvedTargets),
    }));
}

// Owned candidates: logged instances that can still fit under the cap (CP
// already over it can't come back down), plus starred-only forms whose IVs
// aren't known. Ordered by open Great League rank.
function ownedCandidates(cup, { forms, pvpDeepRanks, roster }) {
  const evolvedTargets = evolvedTargetSet(forms);
  const byForm = new Map();
  for (const instance of roster?.instances ?? []) {
    const formId = instance.formId;
    if (!isCupLegal(formId, cup, forms, evolvedTargets)) continue;
    if (Number.isFinite(instance.cp) && instance.cp > cup.cpCap) continue;
    // Spread ranks exist only for the 1500/2500 caps rankIvSpread knows.
    const league = CP_CAP_LEAGUE[cup.cpCap];
    const spreadRank = instance.ivs && league ? rankIvSpread(forms[formId], instance.ivs, league)?.rank ?? null : null;
    const existing = byForm.get(formId);
    if (!existing || (spreadRank && (!existing.spreadRank || spreadRank < existing.spreadRank))) {
      byForm.set(formId, { formId, name: forms[formId].name, ivs: instance.ivs ?? null, cp: instance.cp ?? null, spreadRank });
    }
  }
  for (const formId of roster?.ownedFormIds ?? []) {
    if (byForm.has(formId) || !isCupLegal(formId, cup, forms, evolvedTargets)) continue;
    byForm.set(formId, { formId, name: forms[formId].name, ivs: null, cp: null, spreadRank: null });
  }
  return [...byForm.values()]
    .map((entry) => ({ ...entry, openRank: pvpDeepRanks?.ranks?.[entry.formId]?.[0] ?? null, types: typesOf(forms[entry.formId]) }))
    .sort((a, b) => (a.openRank ?? 9999) - (b.openRank ?? 9999));
}

function sharedWeaknesses(members, threatTypes) {
  return threatTypes.filter((type) => members.filter((m) => effectivenessOf(type, m.types) >= 1.6).length >= 2);
}

// Best trio from the owned pool: lowest summed open rank, penalized for every
// threat type two members are both weak to. Brute force — 12 choose 3 is 220.
// H1 (2026-10-05): matchups from PvPoke's own 1v1 simulator, already in the
// Great League rows — keyMatchups (opponents this species beats, rating >
// 500) and keyCounters (opponents that beat it). A 1v1 at 1500 CP plays out
// the same in any 1500 cup, so these score a team against the cup meta far
// better than type weaknesses alone. Sparse (top 5 each way per species), so
// they adjust the rank-and-weakness score rather than replace it.
const SIM_THREAT_COST = 25;
const SIM_COVER_BONUS = 15;

function simWins(pvp) {
  const wins = new Map();
  const add = (winner, loser) => {
    if (!wins.has(winner)) wins.set(winner, new Set());
    wins.get(winner).add(loser);
  };
  for (const row of pvp?.great ?? []) {
    for (const m of row.keyMatchups ?? []) if (m.rating > 500) add(row.formId, m.opponentFormId);
    for (const c of row.keyCounters ?? []) if (c.rating < 500) add(c.opponentFormId, row.formId);
  }
  return wins;
}

function simCoverage(members, meta, wins) {
  const beats = (a, b) => Boolean(wins.get(a)?.has(b));
  const covered = [];
  const unanswered = [];
  for (const threat of meta) {
    const answered = members.some((m) => beats(m.formId, threat.formId));
    if (answered) covered.push(threat.name);
    else if (members.some((m) => beats(threat.formId, m.formId))) unanswered.push(threat.name);
  }
  return { covered, unanswered };
}

export function bestCupTeam(cup, ctx) {
  if (cup.rule === "unevolved") return null;
  const meta = cupMeta(cup, ctx);
  const threatTypes = [...new Set(meta.flatMap((m) => m.types))];
  const pool = ownedCandidates(cup, ctx).filter((c) => c.openRank).slice(0, CANDIDATE_POOL);
  if (pool.length < 3) return { members: pool, sharedWeaknesses: [], threatTypes, short: true };
  const wins = simWins(ctx.pvp);
  let best = null;
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      for (let k = j + 1; k < pool.length; k += 1) {
        const members = [pool[i], pool[j], pool[k]];
        const shared = sharedWeaknesses(members, threatTypes);
        const sim = simCoverage(members, meta, wins);
        const score = members.reduce((sum, m) => sum + m.openRank, 0) + shared.length * SHARED_WEAKNESS_COST
          + sim.unanswered.length * SIM_THREAT_COST - sim.covered.length * SIM_COVER_BONUS;
        if (!best || score < best.score) best = { members, sharedWeaknesses: shared, sim, score };
      }
    }
  }
  // A single member's x2.56 to a type the cup is built on (Cramorant vs
  // Electric in Color Cup) isn't a shared hole, so the score doesn't punish
  // it — but it's the first thing an opponent exploits, so say it out loud.
  const coreTypes = cup.allowedTypes?.length ? cup.allowedTypes : threatTypes;
  const doubleWeaknesses = best.members.flatMap((m) => coreTypes
    .filter((type) => effectivenessOf(type, m.types) >= 2.56)
    .map((type) => ({ name: m.name, type })));
  return { ...best, threatTypes, doubleWeaknesses, short: false };
}

export function ownedCupPool(cup, ctx) {
  return ownedCandidates(cup, ctx);
}

// A pvp.great row's own build as a simulatePvp side, or null if the row
// doesn't carry a full build (ivs/level/fastMove/chargedMoves). Prefers
// PvPoke's own defaultIvs over this repo's rankOne (an independent
// exhaustive max-stat-product search) — PvPoke's published keyMatchups/
// keyCounters rating is computed at ITS default, not at rankOne, and the two
// can disagree on which spread wins a stat-product tie (see pvp-sim.js's
// MEASURED_AGREEMENT_PCT header). rankOne is still the fallback for a league
// defaultIvs doesn't cover (Master has no CP cap, so no matching PvPoke
// default) or a row missing the field.
//
// preferLeads: use the row's leads-scenario moveset (row.leadsMoves — see
// pvp.py's _leads_moveset) instead of its overall-scenario fastMove/
// chargedMoves, when present. simulateVsMeta's opponents are always a 1-1
// fight — the exact scenario PvPoke's leads moveset was optimized for —
// so building them at that moveset (rather than the overall one, which
// diverges on ~1 in 25 rows) matches what the opponent would actually run.
export function sideFromPublishedBuild(row, form, { preferLeads = false } = {}) {
  const build = row?.defaultIvs?.ivs && row?.defaultIvs?.level ? row.defaultIvs : row?.rankOne;
  const moveset = preferLeads && row?.leadsMoves?.fastMove && row?.leadsMoves?.chargedMoves?.length
    ? row.leadsMoves
    : row;
  if (!build?.ivs || !build?.level || !moveset?.fastMove || !moveset?.chargedMoves?.length) return null;
  const { attack, defense, stamina } = build.ivs;
  return { form, ivs: { atk: attack, def: defense, sta: stamina }, level: build.level, fastMove: moveset.fastMove, chargedMoves: moveset.chargedMoves };
}

// An instance is only usable if EVERY move it carries resolves in the
// move catalog — a retired/renamed move id on just one of its 1-2 charged
// moves would otherwise either crash the sim or silently fight with a
// move missing, so instead the whole instance is rejected and
// sideForMember falls back to the published rank-1 build.
function instanceMovesKnown(instance, moveCatalog) {
  return Boolean(moveCatalog?.[instance.fastMove])
    && (instance.chargedMoves ?? []).every((id) => Boolean(moveCatalog?.[id]));
}

// H2: a team member's build for simulation — the player's own logged
// instance (fastMove/chargedMoves/ivs, level solved from its cp) when one
// with a full, catalog-resolvable moveset is on the roster, else the
// species' published build (see sideFromPublishedBuild), read from the
// `league` list that actually matches this cup's CP cap. assumedPublished
// tells the view to label the fallback.
function sideForMember(member, ctx, league) {
  const form = ctx.forms?.[member.formId];
  const instance = (ctx.roster?.instances ?? []).find(
    (i) => i.formId === member.formId && i.fastMove && (i.chargedMoves ?? []).length && i.ivs && Number.isFinite(i.cp)
      && instanceMovesKnown(i, ctx.moveCatalog),
  );
  if (form && instance) {
    const level = solveLevel(form, instance.ivs, instance.cp);
    if (level !== null) {
      return { side: { form, ivs: instance.ivs, level, fastMove: instance.fastMove, chargedMoves: instance.chargedMoves }, assumedPublished: false };
    }
  }
  const row = (ctx.pvp?.[league] ?? []).find((r) => r.formId === member.formId);
  const side = form ? sideFromPublishedBuild(row, form) : null;
  return { side, assumedPublished: true };
}

// Simulates each of a cup team's 3 members against the cup meta's top 8
// (1-1 shields, each side at the build sideForMember resolves). Opponents
// always use their own published build (sideFromPublishedBuild), preferring
// each opponent's leads-scenario moveset when published (this IS a 1-1
// fight, the scenario that moveset was optimized for) — a meta entry
// without a usable build is dropped rather than guessed at. Cheap (<= 3 x 8
// = 24 simulatePvp calls); meant for the "vs meta" disclosure in the cup
// view, not scoring. Each matchup is simulated independently (try/catch per
// member/opponent pair): one bad matchup is dropped from that member's
// results, it never blanks the whole member or the whole section.
//
// Gated on CP_CAP_LEAGUE: a cup at any cap other than 1500/2500 (today,
// that's only the Little Cup's 500 — already routed to its own view, never
// reaching here) has no matching pvp.<league> list, so this returns null —
// no silently-wrong Great League builds standing in for a different cap.
export function simulateVsMeta(team, meta, ctx, cup) {
  const league = CP_CAP_LEAGUE[cup?.cpCap];
  if (!league) return null;
  const opponents = meta.slice(0, 8)
    .map((m) => {
      const row = (ctx.pvp?.[league] ?? []).find((r) => r.formId === m.formId);
      const side = sideFromPublishedBuild(row, ctx.forms?.[m.formId], { preferLeads: true });
      return side ? { name: m.name, side } : null;
    })
    .filter(Boolean);
  if (!opponents.length) return null;
  return team.members.map((member) => {
    const { side, assumedPublished } = sideForMember(member, ctx, league);
    if (!side) return { formId: member.formId, name: member.name, noData: true, results: [] };
    const results = [];
    for (const opponent of opponents) {
      try {
        const sim = simulatePvp(side, opponent.side, { shields: [1, 1], moveCatalog: ctx.moveCatalog ?? {} });
        results.push({ name: opponent.name, result: sim.winner === "a" ? "W" : sim.winner === "b" ? "L" : "T" });
      } catch {
        // Skip just this one matchup rather than this member or the section.
      }
    }
    return { formId: member.formId, name: member.name, assumedPublished, results };
  });
}
