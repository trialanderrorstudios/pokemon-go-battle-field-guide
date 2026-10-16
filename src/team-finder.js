// Team Finder (Wave P lane P2, 2026-10-16): "best team from my box" against
// a weighted meta. Scoring/search logic. web/src/views/team-finder.js
// renders this; it is pure data, no DOM. Heavy (simulatePvp-calling) work
// is memoized by app.js via memoizedTeamFinderResult below — a keystroke in
// a search box must re-render the view without re-running a single sim.
import { solveLevel } from "./instances.js";
import { bestLevelUnderCap, detailedEligibility, LEAGUE_CP_CAP, RANK_MAX_LEVEL, rankIvSpread } from "./pvp-team.js";
import { publishedBuild } from "./cup-team.js";
import { simulatePvp } from "./pvp-sim.js";

// Only leagues with a matching pvp.<league> list to build opponents/mirrors
// from — same gate as cup-team.js's CP_CAP_LEAGUE (Master has no CP cap, so
// no matching PvPoke default-IV build to simulate against).
export const TEAM_FINDER_LEAGUES = Object.freeze(["great", "ultra"]);

export const DEFAULT_POOL_SIZE = 16;
const TOP_META_SIZE = 50;
const LEAD_META_SIZE = 30;
export const TROUBLE_WIN_FRACTION = 2 / 3;
export const SHOWN_TRIO_COUNT = 15;
// A manual opponent add defaults to rank-5's own top-50 weight — "worth
// real attention, not a top-3 lock" — and is adjustable per add from there.
export const MANUAL_OPPONENT_DEFAULT_WEIGHT = TOP_META_SIZE - 4;

// Known engine gaps (pvpoke-engine.js's own "Known gaps" list: Cramorant's
// Gulp Missile form changes, a residual Mimikyu post-Disguise boundary) —
// a result touching either species is real, just less certain than the
// measured agreement rate implies.
const UNCERTAIN_FORM_PREFIXES = ["0778", "0845"]; // Mimikyu, Cramorant

export function hasKnownEngineGap(formId) {
  return UNCERTAIN_FORM_PREFIXES.some((prefix) => formId?.startsWith(prefix));
}

// The injectable "what build does this form use" lookup — cup-team.js's
// publishedBuild: a shipped top-50 row when one exists, else pvp.py's
// pvpBuilds table (every PvPoke-ranked form, not just the top 50 — Fable
// review finding, 2026-10-16: Greninja/Shadow Forretress had no row before
// pvpBuilds shipped, so manual adds and most of the roster outside the top
// 50 could never resolve a build). ctx needs `pvpBuilds` threaded alongside
// `pvp`/`forms` for the fallback to fire. Swap this one function for a
// richer source later without touching any scoring/search code below.
export function defaultBuildLookup(formId, league, ctx = {}, opts = {}) {
  return publishedBuild(formId, league, ctx, opts);
}

// The first move id on this instance that doesn't resolve in moveCatalog,
// or null if every move does (or there are none to check).
function unresolvedMoveId(instance, moveCatalog) {
  const ids = [instance.fastMove, ...(instance.chargedMoves ?? [])].filter(Boolean);
  return ids.find((id) => !moveCatalog?.[id]) ?? null;
}

// A roster instance's side for simulation. Fable review fix (2026-10-16):
// this used to build at the level matching the instance's CURRENT (often
// underleveled/unpowered) CP — a rank-1 IV spread sitting at a low level
// scored like a weak build. It now always builds at the BEST level this
// exact IV spread can reach under the league's cap (bestLevelUnderCap, the
// same call rankIvSpread uses), since that's the build worth evaluating:
// what this Pokémon could actually play at, not what it happens to be
// powered to today. currentLevel/powerUpsNeeded/needsXl describe the gap
// between "today" and "best", for the view's "needs N more power-ups"
// label — never used to pick the simulated level itself.
// A move id that doesn't resolve in this release's catalog (unknownMoveId)
// falls back to the published build, same as a fully-missing moveset, but
// is reported so the view can say which move, not just "assumed published".
export function memberSide(instance, league, ctx, buildLookup = defaultBuildLookup) {
  const form = ctx.forms?.[instance.formId];
  if (!form) return null;
  const hasLoggedMoveset = Boolean(instance.fastMove) && (instance.chargedMoves ?? []).length > 0 && Boolean(instance.ivs);
  if (hasLoggedMoveset) {
    const unknownMoveId = unresolvedMoveId(instance, ctx.moveCatalog);
    if (!unknownMoveId) {
      const bestLevel = bestLevelUnderCap(form, instance.ivs, LEAGUE_CP_CAP[league], RANK_MAX_LEVEL[league]);
      if (bestLevel !== null) {
        const currentLevel = Number.isFinite(instance.cp) ? solveLevel(form, instance.ivs, instance.cp) : null;
        const powerUpsNeeded = currentLevel !== null ? Math.max(0, Math.round((bestLevel - currentLevel) * 2)) : null;
        return {
          side: { form, ivs: instance.ivs, level: bestLevel, fastMove: instance.fastMove, chargedMoves: instance.chargedMoves },
          assumedPublished: false,
          bestLevel, currentLevel, powerUpsNeeded, needsXl: bestLevel > 40,
        };
      }
    }
    const side = buildLookup(instance.formId, league, ctx);
    return side ? { side, assumedPublished: true, unknownMoveId } : null;
  }
  const side = buildLookup(instance.formId, league, ctx);
  return side ? { side, assumedPublished: true } : null;
}

// Default candidate pool: owned instances eligible for the league (current
// CP under the cap — a copy already over it can't come back down), deduped
// to the best IV-ranked spread per species. rankIvSpread already ranks at
// each spread's OWN best level under the cap, so an unpowered rank-1 copy
// (low current CP, great IVs) ranks correctly here — Fable review fix,
// 2026-10-16: a since-removed "near the cap" filter used to exclude exactly
// that copy by its current (unpowered) CP, even though its rank was already
// computed honestly.
export function defaultPool(league, ctx, size = DEFAULT_POOL_SIZE) {
  const byFormId = new Map();
  for (const instance of ctx.roster?.instances ?? []) {
    if (!ctx.forms?.[instance.formId] || !instance.ivs || !Number.isFinite(instance.cp)) continue;
    if (!detailedEligibility(instance, league).eligible) continue;
    const rank = rankIvSpread(ctx.forms[instance.formId], instance.ivs, league)?.rank ?? null;
    if (rank === null) continue;
    const existing = byFormId.get(instance.formId);
    if (!existing || rank < existing.rank) byFormId.set(instance.formId, { instance, rank });
  }
  return [...byFormId.values()].sort((a, b) => a.rank - b.rank).slice(0, size).map((entry) => entry.instance);
}

// Every roster instance with a known form, for the "add any instance to
// your pool" picker — deliberately NOT filtered by eligibility/rank the way
// defaultPool is: the operator may want to test a star-only copy, or one
// currently over the cap, on purpose.
export function poolInstanceOptions(ctx) {
  return (ctx.roster?.instances ?? [])
    .filter((instance) => ctx.forms?.[instance.formId])
    .map((instance) => ({ instance, name: ctx.forms[instance.formId].name }));
}

// The default pool, with the operator's own add/remove overrides applied —
// removal wins over the default list; an added instance that isn't already
// in the (post-removal) list is appended.
export function poolWithOverrides(league, ctx, { extraInstanceIds = [], excludedInstanceIds = [], size = DEFAULT_POOL_SIZE } = {}) {
  const base = defaultPool(league, ctx, size).filter((instance) => !excludedInstanceIds.includes(instance.id));
  const extras = (ctx.roster?.instances ?? [])
    .filter((instance) => extraInstanceIds.includes(instance.id) && ctx.forms?.[instance.formId] && !base.some((member) => member.id === instance.id));
  return [...base, ...extras];
}

// Weighted opponent list for the league: PvPoke's own open top 50 (weight
// 50 down to 1, by rank), the operator's logged battle-log frequency
// (weight = match count), and manual adds (their own adjustable weight,
// added on top of whatever a mon already has — Fable review fix,
// 2026-10-16: a manual add used to be skipped entirely whenever the mon was
// already in the top 50, which is every mon worth adding by hand; now it
// always bumps the weight, exactly like a battle-log sighting does).
export function opponentWeights(league, ctx, { battleLogFreq = [], manualOpponents = [] } = {}) {
  const weights = new Map();
  const add = (formId, weight) => weights.set(formId, (weights.get(formId) ?? 0) + weight);
  const top = [...(ctx.pvp?.[league] ?? [])].sort((a, b) => a.rank - b.rank).slice(0, TOP_META_SIZE);
  top.forEach((row, index) => add(row.formId, TOP_META_SIZE - index));
  for (const { formId, count } of battleLogFreq) add(formId, count);
  for (const { formId, weight } of manualOpponents) add(formId, weight);
  return [...weights.entries()]
    .filter(([formId]) => ctx.forms?.[formId])
    .map(([formId, weight]) => ({ formId, name: ctx.forms[formId].name, weight }))
    .sort((a, b) => b.weight - a.weight);
}

function opponentSide(formId, league, ctx, buildLookup) {
  return buildLookup(formId, league, ctx, { preferLeads: true });
}

// Win fraction for one member-vs-opponent pair, averaged over the three
// shield scenarios the operator actually plays (0-0, 1-1, 2-2) — a tie
// counts as half a win. Null (never a fabricated number) when every
// scenario's moves fail to resolve against this release's move catalog.
// `simulate` is injectable (defaults to the real simulatePvp) purely for
// test determinism/speed — production callers never pass it.
function winFraction(memberSideSpec, opponentSideSpec, moveCatalog, simulate) {
  let sum = 0;
  let count = 0;
  for (const shields of [[0, 0], [1, 1], [2, 2]]) {
    try {
      const result = simulate(memberSideSpec, opponentSideSpec, { shields, moveCatalog });
      sum += result.winner === "a" ? 1 : result.winner === "b" ? 0 : 0.5;
      count += 1;
    } catch {
      // This shield scenario's moves don't resolve in this release's
      // catalog — skip just that scenario rather than the whole pair.
    }
  }
  return count ? sum / count : null;
}

// Builds every member and opponent side once, then every member x opponent
// win fraction once — the cache every trio's score reads from instead of
// re-simulating. ~0.03ms/sim (measured, see pvp-sim.js) means a 16-member
// pool against ~60 opponents is ~2,900 sims, well under 100ms synchronously.
// This function itself is NOT memoized (app.js's memoizedTeamFinderResult
// does that, keyed on league/pool/opponents) — a caller that re-invokes it
// every render defeats the point same as any memo cache.
export function buildMatchupMatrix(pool, opponents, league, ctx, { buildLookup = defaultBuildLookup, moveCatalog = ctx.moveCatalog ?? {}, simulate = simulatePvp } = {}) {
  const memberBuilds = pool.map((instance) => ({
    instance, name: ctx.forms?.[instance.formId]?.name ?? instance.formId, form: ctx.forms?.[instance.formId],
    build: memberSide(instance, league, ctx, buildLookup),
  }));
  const opponentBuilds = opponents.map((opponent) => ({ ...opponent, side: opponentSide(opponent.formId, league, ctx, buildLookup) }));
  const matrix = new Map();
  for (const member of memberBuilds) {
    const row = new Map();
    for (const opponent of opponentBuilds) {
      row.set(opponent.formId, (!member.build || !opponent.side) ? null : winFraction(member.build.side, opponent.side, moveCatalog, simulate));
    }
    matrix.set(member.instance.id, row);
  }
  return { memberBuilds, opponentBuilds, matrix };
}

// One trio's score: the weighted mean (over opponents with at least one
// member's win fraction known) of the best member's fraction against each
// opponent. An opponent neither side has a build for is "no build data" —
// excluded from the mean entirely, never counted as a loss. sureAnswers are
// opponents where 2+ members independently clear TROUBLE_WIN_FRACTION;
// troubleSpots are opponents with data where no member clears it.
export function scoreTrio(trio, opponentBuilds, matrix) {
  let weightedSum = 0;
  let weightTotal = 0;
  const sureAnswers = [];
  const troubleSpots = [];
  const noBuildData = [];
  for (const opponent of opponentBuilds) {
    const tag = { formId: opponent.formId, name: opponent.name };
    const fractions = trio
      .map((member) => matrix.get(member.instance.id)?.get(opponent.formId))
      .filter((fraction) => fraction !== null && fraction !== undefined);
    if (!fractions.length) {
      noBuildData.push(tag);
      continue;
    }
    const best = Math.max(...fractions);
    weightedSum += best * opponent.weight;
    weightTotal += opponent.weight;
    const winners = fractions.filter((fraction) => fraction >= TROUBLE_WIN_FRACTION).length;
    if (winners >= 2) sureAnswers.push(tag);
    else if (winners === 0) troubleSpots.push(tag);
  }
  return { score: weightTotal ? weightedSum / weightTotal : null, sureAnswers, troubleSpots, noBuildData };
}

// Exhaustive C(n,3) search over the pool, scored from the already-built
// matrix (no further simulation). 16 choose 3 = 560 — negligible once the
// matrix exists.
export function rankTrios(memberBuilds, opponentBuilds, matrix) {
  const results = [];
  for (let i = 0; i < memberBuilds.length; i += 1) {
    for (let j = i + 1; j < memberBuilds.length; j += 1) {
      for (let k = j + 1; k < memberBuilds.length; k += 1) {
        const trio = [memberBuilds[i], memberBuilds[j], memberBuilds[k]];
        results.push({ trio, ...scoreTrio(trio, opponentBuilds, matrix) });
      }
    }
  }
  return results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// Lead mode: the league's top-30 published leads, built at each row's
// leads-scenario moveset, weighted by rank — PLUS any lead the operator's
// own battle log has actually faced (battleLogLeadFreq, from
// battle-log.js's battleLogLeadFrequency), weighted by how often it showed
// up as a logged lead. A lead outside the top 30 that the operator keeps
// running into gets tested too, not just PvPoke's own ranking.
export function leadMeta(league, ctx, buildLookup = defaultBuildLookup, { battleLogLeadFreq = [] } = {}) {
  const weights = new Map();
  const top = [...(ctx.pvp?.[league] ?? [])].sort((a, b) => a.rank - b.rank).slice(0, LEAD_META_SIZE);
  top.forEach((row, index) => weights.set(row.formId, (weights.get(row.formId) ?? 0) + (LEAD_META_SIZE - index)));
  for (const { formId, count } of battleLogLeadFreq) weights.set(formId, (weights.get(formId) ?? 0) + count);
  return [...weights.entries()]
    .map(([formId, weight]) => {
      const side = buildLookup(formId, league, ctx, { preferLeads: true });
      return side ? { formId, name: ctx.forms?.[formId]?.name ?? formId, side, weight } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);
}

// One member's weighted 1-1 win fraction against the lead meta — weighted
// the same way scoreTrio weights opponents, so a lead the operator actually
// logs pulls more than a tail entry of the published top 30.
function leadScore(build, leads, moveCatalog, simulate) {
  if (!build) return null;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const lead of leads) {
    try {
      const result = simulate(build.side, lead.side, { shields: [1, 1], moveCatalog });
      const win = result.winner === "a" ? 1 : result.winner === "b" ? 0 : 0.5;
      weightedSum += win * lead.weight;
      weightTotal += lead.weight;
    } catch {
      // See winFraction's own catch — skip just this one lead.
    }
  }
  return weightTotal ? weightedSum / weightTotal : null;
}

// The best-scoring lead in a trio against the (weighted) lead meta, or null
// when none of the three has a usable build.
export function bestLead(trio, leads, moveCatalog, simulate = simulatePvp) {
  let best = null;
  for (const member of trio) {
    const score = leadScore(member.build, leads, moveCatalog, simulate);
    if (score !== null && (!best || score > best.score)) best = { member, score };
  }
  return best;
}

// Mirror check: does the operator's own IVs/moves LOSE a same-species 1-1
// mirror that PvPoke's own default-IV build wins? Only meaningful when the
// member actually has a logged build to compare (assumedPublished members
// are already running the standard build — nothing to flag).
export function mirrorFlag(instance, league, ctx, buildLookup = defaultBuildLookup, simulate = simulatePvp) {
  const own = memberSide(instance, league, ctx, buildLookup);
  if (!own || own.assumedPublished) return null;
  const standard = buildLookup(instance.formId, league, ctx);
  if (!standard) return null;
  try {
    const result = simulate(own.side, standard, { shields: [1, 1], moveCatalog: ctx.moveCatalog ?? {} });
    return result.winner === "b" ? { formId: instance.formId } : null;
  } catch {
    return null;
  }
}

// --- memoization (app.js owns the cache object; this just decides reuse) --

export function teamFinderCacheKey(league, mode, pool, opponents) {
  const poolKey = pool.map((instance) => instance.id).sort().join(",");
  const oppKey = opponents.map((opponent) => `${opponent.formId}:${opponent.weight}`).sort().join(",");
  return `${league}|${mode}|${poolKey}|${oppKey}`;
}

// Every sim-calling piece of the view in one place: the matchup matrix, the
// ranked trios, the lead meta + per-shown-trio best lead (lead mode only —
// no reason to run 30-opponent lead sims while in trio mode), and a mirror
// flag per pool member. Only the top SHOWN_TRIO_COUNT trios get a lead-mode
// pick computed; the rest are never shown, so scoring them would be wasted
// work.
export function computeTeamFinderResult({
  league, pool, opponents, ctx, mode, buildLookup = defaultBuildLookup, simulate = simulatePvp, battleLogLeadFreq = [],
} = {}) {
  const moveCatalog = ctx.moveCatalog ?? {};
  const { memberBuilds, opponentBuilds, matrix } = buildMatchupMatrix(pool, opponents, league, ctx, { buildLookup, moveCatalog, simulate });
  const ranked = rankTrios(memberBuilds, opponentBuilds, matrix);
  const shown = ranked.slice(0, SHOWN_TRIO_COUNT);
  const mirrorFlagsByInstanceId = new Map(
    pool.map((instance) => [instance.id, mirrorFlag(instance, league, ctx, buildLookup, simulate)]),
  );
  let leads = [];
  const bestLeadByTrioIndex = new Map();
  if (mode === "lead") {
    leads = leadMeta(league, ctx, buildLookup, { battleLogLeadFreq });
    shown.forEach((entry, index) => bestLeadByTrioIndex.set(index, bestLead(entry.trio, leads, moveCatalog, simulate)));
  }
  return { memberBuilds, opponentBuilds, matrix, ranked, leads, bestLeadByTrioIndex, mirrorFlagsByInstanceId };
}

// Memoizes computeTeamFinderResult on `cache` — a plain mutable object the
// caller owns and reuses across renders (app.js keeps one on
// ui.teamFinder._cache for the life of the session). Reusing a fresh {}
// every call defeats it, same as any memo cache: this function itself never
// decides whether to recompute, it only compares this call's key against
// the one on the cache object it was handed.
export function memoizedTeamFinderResult(cache, params) {
  const key = teamFinderCacheKey(params.league, params.mode, params.pool, params.opponents);
  if (cache && cache.key === key) return cache.result;
  const result = computeTeamFinderResult(params);
  if (cache) {
    cache.key = key;
    cache.result = result;
  }
  return result;
}

// --- ephemeral UI state (not persisted, like swap.js's createSwapState) ---

export function createTeamFinderState() {
  return {
    league: "great",
    mode: "trio",
    manualOpponents: [],
    opponentQuery: "",
    extraPoolInstanceIds: [],
    excludedPoolInstanceIds: [],
    poolQuery: "",
    // Handed to memoizedTeamFinderResult by the view on every render. Every
    // setter below spreads `...state`, which carries this SAME object
    // reference forward across an otherwise-immutable state update — that
    // reference stability is what lets the cache survive a league/mode/pool
    // change's own fresh object (the key inside it still changes, so a
    // genuinely different league/pool/opponents set still recomputes).
    _cache: {},
  };
}

export function setTeamFinderLeague(state, league) {
  return TEAM_FINDER_LEAGUES.includes(league)
    ? { ...state, league, manualOpponents: [], extraPoolInstanceIds: [], excludedPoolInstanceIds: [] }
    : state;
}

export function setTeamFinderMode(state, mode) {
  return mode === "lead" || mode === "trio" ? { ...state, mode } : state;
}

export function addManualOpponent(state, formId, weight = MANUAL_OPPONENT_DEFAULT_WEIGHT) {
  if (!formId || state.manualOpponents.some((opponent) => opponent.formId === formId)) return state;
  return { ...state, manualOpponents: [...state.manualOpponents, { formId, weight }] };
}

export function removeManualOpponent(state, formId) {
  return { ...state, manualOpponents: state.manualOpponents.filter((opponent) => opponent.formId !== formId) };
}

export function setManualOpponentWeight(state, formId, weight) {
  const n = Number(weight);
  if (!Number.isFinite(n) || n <= 0) return state;
  return { ...state, manualOpponents: state.manualOpponents.map((opponent) => (opponent.formId === formId ? { ...opponent, weight: n } : opponent)) };
}

export function setTeamFinderOpponentQuery(state, query) {
  return { ...state, opponentQuery: String(query ?? "").slice(0, 60) };
}

export function addPoolInstance(state, instanceId) {
  if (!instanceId) return state;
  return {
    ...state,
    extraPoolInstanceIds: state.extraPoolInstanceIds.includes(instanceId) ? state.extraPoolInstanceIds : [...state.extraPoolInstanceIds, instanceId],
    excludedPoolInstanceIds: state.excludedPoolInstanceIds.filter((id) => id !== instanceId),
  };
}

export function removePoolInstance(state, instanceId) {
  return {
    ...state,
    excludedPoolInstanceIds: state.excludedPoolInstanceIds.includes(instanceId) ? state.excludedPoolInstanceIds : [...state.excludedPoolInstanceIds, instanceId],
    extraPoolInstanceIds: state.extraPoolInstanceIds.filter((id) => id !== instanceId),
  };
}

export function setTeamFinderPoolQuery(state, query) {
  return { ...state, poolQuery: String(query ?? "").slice(0, 60) };
}
