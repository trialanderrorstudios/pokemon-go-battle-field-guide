// Per-league "My Team" builder: ranks the user's owned roster for a league,
// proposes a Lead / Safe Switch / Closer trio, and surfaces honest
// eligibility, quality, coverage, and move-delta notes. Pure data layer —
// web/src/views/pvp.js renders it.
import { calculateCp, cpMultiplier, solveLevel } from "./instances.js";
import { coverageNote, weaknessesOf } from "./effectiveness.js";
import { ATTACK_TYPES } from "./raid-target.js";

export const LEAGUE_CP_CAP = Object.freeze({ great: 1500, ultra: 2500, master: null });
export const MY_TEAM_SLOTS = Object.freeze(["Lead", "Safe Switch", "Closer"]);
export const PVP_GOOD_QUALITY_THRESHOLD = 0.95;

// Headroom on the star-only "probably eligible" heuristic: a species whose
// max-normal-level CP sits a little over the cap is still routinely built
// underleveled for that league, so it's not worth a hard "no".
const STAR_ELIGIBILITY_HEADROOM = 1.15;


export function statProduct(form, ivs, level) {
  const cpm = cpMultiplier(level);
  const attack = (form.base_attack + ivs.atk) * cpm;
  const defense = (form.base_defense + ivs.def) * cpm;
  const stamina = Math.floor((form.base_stamina + ivs.sta) * cpm);
  return attack * defense * stamina;
}


// Shared "how close is this stat product to rank-1's" bucketing, used by both
// qualityHint (actual-build quality) and instanceLeagueRank's rank-1-vs-yours
// delta (full-IV-space standing) — one tier scale, never two.
function ratioTier(ratio) {
  let tier = "weak";
  if (ratio >= 0.99) tier = "excellent";
  else if (ratio >= PVP_GOOD_QUALITY_THRESHOLD) tier = "good";
  else if (ratio >= 0.90) tier = "usable";
  return { ratio, percent: Math.round(ratio * 1000) / 10, tier };
}


export function qualityHint(form, instance, row) {
  if (!row?.rankOne?.statProduct) return null;
  const level = solveLevel(form, instance.ivs, instance.cp);
  if (level === null) return null;
  return ratioTier(statProduct(form, instance.ivs, level) / row.rankOne.statProduct);
}


// --- Full-IV-space rank (Poke Genie's signature feature): where does THIS
// exact owned IV spread stand among all 4096 possible spreads for a league,
// not just against the single published rank-1 build? ---

export const TOTAL_IV_SPREADS = 4096;

// Mirrors src/pogo_encyclopedia/iv.py's find_rank_one_iv max_level choice per
// league: capped leagues allow a temporary Best Buddy level 51 build, Master
// (no CP cap, so no benefit from a cap-driven underlevel) stays at the normal
// power-up ceiling of 50.
const RANK_MAX_LEVEL = Object.freeze({ great: 51, ultra: 51, master: 50 });

// Best (highest) level under a league's CP cap for one FIXED IV spread — the
// per-spread half of find_rank_one_iv's search (iv.py), ported to JS so it
// can run against a specific owned instance's IVs instead of only at data-
// build time. CP is monotonic non-decreasing in level for fixed IVs (see
// instances.js solveLevel), so the first level that exceeds the cap means
// every higher level does too — safe to stop there.
function bestLevelUnderCap(form, ivs, cap, maxLevel) {
  if (cap === null) return maxLevel;
  let best = null;
  for (let doubled = 2; doubled <= maxLevel * 2; doubled += 1) {
    const level = doubled / 2;
    if (calculateCp(form, ivs, level) > cap) break;
    best = level;
  }
  return best;
}

// Percentile framing for a rank out of a total pool: rank 1 (the best) reads
// as the 100th percentile, the worst rank as the 0th.
function percentileFromRank(rank, total) {
  return Math.round(((total - rank) / (total - 1)) * 100);
}

// Exhaustively ranks one fixed IV spread against all 4096 possible spreads
// for a league: each candidate spread gets its OWN best level under the cap
// (never the given spread's level, and never a second stat-product formula —
// statProduct() above is the only one), then spreads are ordered by stat
// product to find where this one lands. Ties (a real possibility from the
// stamina floor) share a rank rather than getting an arbitrary tie-break.
export function rankIvSpread(form, ivs, league) {
  const cap = LEAGUE_CP_CAP[league];
  const maxLevel = RANK_MAX_LEVEL[league];
  const level = bestLevelUnderCap(form, ivs, cap, maxLevel);
  if (level === null) return null;
  const target = statProduct(form, ivs, level);
  let better = 0;
  for (let atk = 0; atk < 16; atk += 1) {
    for (let def = 0; def < 16; def += 1) {
      for (let sta = 0; sta < 16; sta += 1) {
        const candidateLevel = bestLevelUnderCap(form, { atk, def, sta }, cap, maxLevel);
        if (candidateLevel === null) continue;
        if (statProduct(form, { atk, def, sta }, candidateLevel) > target) better += 1;
      }
    }
  }
  const rank = better + 1;
  return {
    level, cp: calculateCp(form, ivs, level), statProduct: target,
    rank, total: TOTAL_IV_SPREADS, percentile: percentileFromRank(rank, TOTAL_IV_SPREADS),
  };
}

// Per-instance, per-league rank card: honest eligibility gate (reuses
// detailedEligibility — star-only "probably eligible" guesses never get
// ranked, only instances with known IVs), the full-IV-space rank, and a
// rank-1-vs-yours delta (same ratioTier() qualityHint uses) when the
// league's published rank-1 data is available.
export function instanceLeagueRank(form, instance, league, row) {
  if (!form || !instance?.ivs) return null;
  const eligibility = detailedEligibility(instance, league);
  if (!eligibility.eligible) return { league, eligible: false, reason: eligibility.reason };
  const rank = rankIvSpread(form, instance.ivs, league);
  if (!rank) return { league, eligible: false, reason: "No level 1-51 build of these IVs fits this league's cap." };
  const delta = row?.rankOne?.statProduct ? ratioTier(rank.statProduct / row.rankOne.statProduct) : null;
  return { league, eligible: true, ...rank, delta };
}

export const RANK_LEAGUES = Object.freeze(Object.keys(LEAGUE_CP_CAP));

function ordinalSuffix(number) {
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[number % 10] ?? "th";
}

// Plain-language "#247 of 4096 · 93rd percentile" summary for an eligible
// instanceLeagueRank() result. Callers escape and place this text themselves.
export function rankSummaryText(rank) {
  if (!rank?.eligible) return "";
  return `#${rank.rank} of ${rank.total} · ${rank.percentile}${ordinalSuffix(rank.percentile)} percentile`;
}


export function detailedEligibility(instance, league) {
  const cap = LEAGUE_CP_CAP[league];
  if (cap === null) {
    return { kind: "detailed", eligible: true, assumption: false, reason: "Master League has no CP cap." };
  }
  const eligible = instance.cp <= cap;
  return {
    kind: "detailed",
    eligible,
    assumption: false,
    reason: eligible
      ? `${instance.cp} CP is under the ${cap} cap.`
      : `${instance.cp} CP is over the ${cap} cap — this exact copy doesn't qualify.`,
  };
}


export function starEligibility(form, league) {
  const cap = LEAGUE_CP_CAP[league];
  if (cap === null) {
    return {
      kind: "star", eligible: true, assumption: true,
      reason: "Master League has no CP cap — probably usable at any level.",
    };
  }
  const maxNormalCp = calculateCp(form, { atk: 15, def: 15, sta: 15 }, 40);
  const eligible = maxNormalCp <= cap * STAR_ELIGIBILITY_HEADROOM;
  return {
    kind: "star",
    eligible,
    assumption: true,
    reason: eligible
      ? `Base stats suggest this naturally sits near or under ${cap} CP — probably eligible. Add exact CP/IVs to confirm.`
      : `Base stats suggest this typically clears ${cap} CP well before level 40 — probably needs a specific underleveled build. Add exact CP/IVs to confirm.`,
  };
}


// Structured (not display-string) move gap so the view layer decides move
// name formatting; null when there's no ranked move data or no detailed
// instance to compare.
function moveDelta(instance, row) {
  if (!instance || !row) return null;
  return {
    fastMoveMissing: !instance.fastMove,
    fastMoveNeeded: instance.fastMove && instance.fastMove !== row.fastMove ? row.fastMove : null,
    chargedMovesMissing: !instance.chargedMoves?.length,
    chargedMovesNeeded: instance.chargedMoves?.length
      ? (row.chargedMoves ?? []).filter((moveId) => !instance.chargedMoves.includes(moveId))
      : [],
  };
}


// Best owned instance of a form *for this league*: prefers the highest-CP
// copy that's actually under the cap, so an owned legal build isn't shadowed
// by a higher-CP copy of the same species built for a different league. Only
// falls back to the overall-best copy (any CP) when none of the owned copies
// qualify, so the ineligibility message still reflects a real owned copy.
export function bestInstanceForLeague(instances, formId, cap) {
  const matches = (instances ?? []).filter((instance) => instance.formId === formId);
  if (!matches.length) return null;
  const legal = cap === null ? matches : matches.filter((instance) => instance.cp <= cap);
  const pool = legal.length ? legal : matches;
  return pool.reduce((best, candidate) => (candidate.cp > best.cp ? candidate : best));
}


function candidatesForLeague(league, pvp, roster, forms) {
  const rowByFormId = new Map((pvp?.[league] ?? []).map((row) => [row.formId, row]));
  const owned = [...new Set(roster?.ownedFormIds ?? [])];
  return owned.map((formId) => forms[formId] && { formId, form: forms[formId] }).filter(Boolean).map(({ formId, form }) => {
    const row = rowByFormId.get(formId) ?? null;
    const instance = bestInstanceForLeague(roster?.instances ?? [], formId, LEAGUE_CP_CAP[league]);
    const eligibility = instance ? detailedEligibility(instance, league) : starEligibility(form, league);
    return {
      formId,
      form,
      row,
      instance,
      eligibility,
      quality: instance ? qualityHint(form, instance, row) : null,
      moveDelta: instance ? moveDelta(instance, row) : null,
    };
  });
}


function rankCandidates(candidates) {
  return [...candidates].sort((left, right) => {
    const leftRank = left.row?.rank ?? Infinity;
    const rightRank = right.row?.rank ?? Infinity;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftQuality = left.quality?.ratio ?? 0;
    const rightQuality = right.quality?.ratio ?? 0;
    if (leftQuality !== rightQuality) return rightQuality - leftQuality;
    return left.formId.localeCompare(right.formId);
  });
}


// Nearest curated example team: the one with the most member overlap with
// what the user already owns, so an empty/thin roster still lands on a
// team that's closest to something they could actually build toward.
function nearestPrebuiltTeam(league, pvpTeams, roster) {
  const owned = new Set(roster?.ownedFormIds ?? []);
  const teams = (pvpTeams ?? []).filter((team) => team.league === league);
  if (!teams.length) return null;
  return [...teams].sort((left, right) => {
    const leftOwned = (left.members ?? []).filter((member) => owned.has(member.formId)).length;
    const rightOwned = (right.members ?? []).filter((member) => owned.has(member.formId)).length;
    return rightOwned - leftOwned;
  })[0];
}


export function myTeamOverridesFor(preferences, league) {
  const stored = preferences?.pvpTeam?.[league];
  if (!stored || typeof stored !== "object") return {};
  const result = {};
  for (const slot of MY_TEAM_SLOTS) {
    if (typeof stored[slot] === "string" && stored[slot]) result[slot] = stored[slot];
  }
  return result;
}


export function withMyTeamOverride(preferences, league, slot, formId) {
  const pvpTeam = { ...(preferences?.pvpTeam ?? {}) };
  const leagueOverrides = { ...(pvpTeam[league] ?? {}) };
  if (formId) leagueOverrides[slot] = formId;
  else delete leagueOverrides[slot];
  pvpTeam[league] = leagueOverrides;
  return { ...(preferences ?? {}), pvpTeam };
}


// Builds the per-league trio: manual slot overrides win outright (any owned
// form, eligible or not — the UI still shows the honest eligibility note);
// open slots auto-fill from eligible candidates, preferring a candidate
// whose ranked-data roles match the slot, then falling back to rank order.
export function buildMyTeam({ league, pvp = {}, pvpTeams = [], roster = {}, forms = {}, overrides = {} } = {}) {
  const candidates = candidatesForLeague(league, pvp, roster, forms);
  const byFormId = new Map(candidates.map((candidate) => [candidate.formId, candidate]));
  const eligible = rankCandidates(candidates.filter((candidate) => candidate.eligibility.eligible));

  const usedFormIds = new Set();
  const usedDex = new Set();
  const members = MY_TEAM_SLOTS.map((slot) => {
    const overrideFormId = overrides?.[slot];
    const candidate = overrideFormId ? byFormId.get(overrideFormId) : null;
    if (!candidate || usedFormIds.has(candidate.formId)) return null;
    usedFormIds.add(candidate.formId);
    usedDex.add(candidate.form.dex);
    return { ...candidate, slot, source: "override", roleSource: "operator" };
  });

  const takeCandidate = (predicate) => eligible.find((candidate) => (
    !usedFormIds.has(candidate.formId) && !usedDex.has(candidate.form.dex) && predicate(candidate)
  ));

  for (let index = 0; index < MY_TEAM_SLOTS.length; index += 1) {
    if (members[index]) continue;
    const slot = MY_TEAM_SLOTS[index];
    const pick = takeCandidate((candidate) => candidate.row?.roles?.includes(slot))
      ?? takeCandidate(() => true);
    if (!pick) continue;
    usedFormIds.add(pick.formId);
    usedDex.add(pick.form.dex);
    members[index] = {
      ...pick,
      slot,
      source: pick.row ? "ranked" : "unranked",
      roleSource: pick.row?.roles?.includes(slot) ? "pvp-data" : "generic",
    };
  }

  const filled = members.filter(Boolean);
  const isEmpty = filled.length === 0;
  return {
    league,
    members,
    isEmpty,
    fallbackTeam: isEmpty ? nearestPrebuiltTeam(league, pvpTeams, roster) : null,
    fallbackMessage: isEmpty
      ? "No eligible Pokémon owned for this league yet — star and detail what you own to personalize this team."
      : "",
    coverageNote: filled.length >= 2 ? coverageNote(filled.map((member) => member.form)) : "",
  };
}


// PvP instance conflicts: an exact roster copy (same instance.id) built into
// My Team for two different leagues at once — a Great League build (low CP,
// often a lower-Attack IV to stay under cap) and an Ultra League build are
// different physical investments, so the same copy "optimized" for both is a
// contradiction worth flagging. Same species with a *different* instance is
// fine and never flagged — only the exact copy matters. Advisory only, never
// blocking: teamsByLeague is keyed by league, each value a buildMyTeam() result.
export function detectInstanceConflicts(teamsByLeague = {}) {
  const placementsByInstanceId = new Map();
  for (const [league, team] of Object.entries(teamsByLeague ?? {})) {
    for (const member of team?.members ?? []) {
      const instanceId = member?.instance?.id;
      if (!instanceId) continue; // star-only (no detailed instance) members can't conflict
      const placements = placementsByInstanceId.get(instanceId) ?? [];
      placements.push({ league, formId: member.formId, pokemon: member.form?.name ?? member.formId });
      placementsByInstanceId.set(instanceId, placements);
    }
  }
  const conflicts = [];
  for (const [instanceId, placements] of placementsByInstanceId) {
    if (placements.length < 2) continue;
    conflicts.push({
      instanceId,
      formId: placements[0].formId,
      pokemon: placements[0].pokemon,
      leagues: placements.map((placement) => placement.league),
    });
  }
  return conflicts.sort((left, right) => left.pokemon.localeCompare(right.pokemon)
    || left.instanceId.localeCompare(right.instanceId));
}


