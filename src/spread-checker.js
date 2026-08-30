// Spread Checker — "0/14/15 Spheal L25, worth it?" answered in-app instead
// of in chat. Pure data layer (no rendering here — web/src/views/spreadcheck.js
// renders checkSpread()'s output); composes existing machinery only:
//   per-league IV rank  -> pvp-team.js's rankIvSpread (the same exhaustive
//                          4096-spread search instanceLeagueRank uses, just
//                          without a fixed owned CP/level — the operator is
//                          asking "what's the best build of these IVs",
//                          which is exactly rankIvSpread's own bestBuddy:true
//                          default already answers).
//   species top-150 row -> pvp[league] rows, same shape dex.js's pvpSection
//                          and compare.js's bestPvpRow already read.
//   raid role           -> raids.regular/.shadow rows, filtered to this form
//                          and its -shadow sibling exactly like
//                          event-evolve-advisor.js's raidHitsFor does.
//   gym defender rank   -> gym.defenderIndex (regular, full pool) /
//                          gym.shadowDefenderRanking (shadow, top-100 only),
//                          mirroring compare.js's own gymRankFor (private
//                          there — compare.js is out of this lane's
//                          allowlist, so the same small lookup is re-derived
//                          here rather than imported).
//   evolution walk      -> forms[].evolves_to, the same one-step edge list
//                          instances.js's evolutionForecast walks. IVs carry
//                          through evolution unchanged (Niantic support: does
//                          not change IVs) — so a pre-evolution's spread is
//                          judged by what its FINAL form(s) can do with it.
import { rankIvSpread, RANK_LEAGUES } from "./pvp-team.js";

const LEAGUE_LABEL = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });
const LEAGUE_ABBR = Object.freeze({ great: "GL", ultra: "UL", master: "ML" });

// ponytail: tiny local duplicate of pvp-team.js's own (unexported) ordinal
// helper — that file is outside this lane's edit allowlist, so a 4-line
// pure function is duplicated rather than requesting an export change there.
function ordinalSuffix(number) {
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[number % 10] ?? "th";
}

function clampIv(value) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return 0;
  return Math.min(15, Math.max(0, num));
}

// Defensive clamp: the view's <select> options are already bounded 0-15, but
// checkSpread is a pure function other callers could feed directly.
function normalizeIvs(ivs) {
  return { atk: clampIv(ivs?.atk), def: clampIv(ivs?.def), sta: clampIv(ivs?.sta) };
}

// Per-league full-IV-space rank for this exact spread — rankIvSpread's own
// bestBuddy:true default (the best achievable build of these IVs, matching
// what the operator is actually asking). eligible:false (never a fabricated
// rank) mirrors instanceLeagueRank's own honest-ineligibility message for
// the rare form that fits no level 1-51 build under a league's CP cap.
function leaguesFor(form, ivs) {
  return RANK_LEAGUES.map((league) => {
    const rank = rankIvSpread(form, ivs, league);
    if (!rank) {
      return { league, eligible: false, reason: "No level 1-51 build of these IVs fits this league's cap." };
    }
    return {
      league, eligible: true,
      rank: rank.rank, total: rank.total, percentile: rank.percentile,
      cp: rank.cp, level: rank.level, bestBuddyRequired: rank.level > 50,
    };
  });
}

// Top-150 species row per league, or null when the species has no open-league
// ranking there — the honest "no open-league row in this data" case the
// verdict below names explicitly rather than guessing at cup/collection value.
function speciesContextFor(formId, pvp) {
  const context = {};
  for (const league of RANK_LEAGUES) {
    const row = (pvp?.[league] ?? []).find((entry) => entry.formId === formId);
    context[league] = row ? { rank: row.rank, fastMove: row.fastMove, chargedMoves: [...(row.chargedMoves ?? [])] } : null;
  }
  return context;
}

// Ranked raid rows for this form AND its -shadow sibling (mirrors
// event-evolve-advisor.js's raidHitsFor) — a shadow copy of a pre-evolution
// is a real, evolvable owned Pokemon, so its raid role belongs in the same
// answer. Guards against doubling the suffix when the picked form is itself
// already a shadow variant.
function raidRolesFor(formId, raids) {
  const siblingId = formId.endsWith("-shadow") ? null : `${formId}-shadow`;
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])]
    .filter((row) => row.status === "ranked" && (row.formId === formId || row.formId === siblingId));
  return rows
    .map((row) => ({
      formId: row.formId, attackingType: row.attackingType, rank: row.rank,
      tier: row.investmentTier ?? null, shadow: row.formId === siblingId,
    }))
    .sort((left, right) => left.rank - right.rank);
}

// defenderIndex row {rank, of} or null — mirrors compare.js's gymRankFor
// (private there): regular defenders read the full-pool defenderIndex/
// defenderRanking, shadow defenders read the top-100-only shadowDefenderRanking.
function gymRankFor(form, gym) {
  if (!gym) return null;
  if (form.shadow) {
    const ranking = gym.shadowDefenderRanking ?? [];
    const row = ranking.find((entry) => entry.formId === form.form_id);
    return row ? { rank: row.rank, of: ranking.length, tier: row.tier ?? null } : null;
  }
  const indexRow = (gym.defenderIndex ?? []).find((entry) => entry.formId === form.form_id);
  if (!indexRow) return null;
  const of = (gym.defenderIndex ?? []).length;
  const rankedRow = indexRow.tier ? (gym.defenderRanking ?? []).find((entry) => entry.formId === form.form_id) : null;
  return { rank: rankedRow?.rank ?? indexRow.rank, of, tier: rankedRow?.tier ?? null };
}

// Every form whose evolves_to chain has no further edges, reached by walking
// downward from formId — mirrors evolutionForecast's own recursive walk
// (instances.js) but collects leaves instead of the whole tree, since the
// operator's question is about the FINAL form(s), not every intermediate
// stage. A branching family (Ralts -> Gardevoir/Gallade) returns every end;
// the walk never guesses a single "main" line. Cycle-guarded, matching
// preEvolutionsOf's own visited-set convention (event-evolve-advisor.js).
function terminalFormIds(formId, forms, visited = new Set()) {
  if (visited.has(formId)) return [];
  visited.add(formId);
  const edges = forms[formId]?.evolves_to ?? [];
  if (!edges.length) return [formId];
  return edges.flatMap((edge) => terminalFormIds(edge.formId, forms, visited));
}

function tierFor(percentile) {
  if (percentile >= 99) return "excellent";
  if (percentile >= 90) return "good";
  if (percentile >= 75) return "usable";
  return "weak";
}

function bestEligibleLeague(leagues) {
  const eligible = leagues.filter((entry) => entry.eligible);
  if (!eligible.length) return null;
  return eligible.reduce((best, entry) => (entry.rank < best.rank ? entry : best));
}

function pvpVerdictLine(bestLeague, speciesRow) {
  const percentileText = `${bestLeague.percentile}${ordinalSuffix(bestLeague.percentile)} percentile`;
  if (!speciesRow) {
    return `${percentileText} spread, but the species has no open-league row — cup/collection value only (our rankings cover open leagues only).`;
  }
  const tier = tierFor(bestLeague.percentile);
  if (tier === "excellent" || tier === "good") {
    return `Rank ${bestLeague.rank} of ${bestLeague.total} for ${LEAGUE_LABEL[bestLeague.league]} — on a species ranked ${LEAGUE_ABBR[bestLeague.league]} #${speciesRow.rank}: chase it.`;
  }
  return `${percentileText} spread for ${LEAGUE_LABEL[bestLeague.league]} — species ranks ${LEAGUE_ABBR[bestLeague.league]} #${speciesRow.rank}, but this exact spread lands mid-pack.`;
}

function raidVerdictLine(topRaid, ivs) {
  if (ivs.atk === 15) return `High-attack spread — raids are this species' job (${topRaid.attackingType} #${topRaid.rank}).`;
  return `This species' ranked job is raids (${topRaid.attackingType} #${topRaid.rank}) which wants a hundo — this low-attack spread has no home.`;
}

function gymVerdictLine(gymRank) {
  return `Gym defense is this species' role (#${gymRank.rank} of ${gymRank.of}) — bulk matters more than this spread's PvP rank.`;
}

// One honest line, synthesized in the register the operator's own chat
// answers used: spread quality (from `leagues`) plus species reality (from
// `speciesContext`/`raidRoles`/`gymRank`). PvP only "wins" the line when the
// spread itself is at least the good/excellent tier there; otherwise raids,
// then gym defense, then a fallback plain PvP read get a turn — a mediocre
// PvP spread on a top raid attacker should read as a raid answer, not a
// buried PvP percentile.
export function synthesizeVerdict({ leagues, speciesContext, raidRoles, gymRank, ivs }) {
  const bestLeague = bestEligibleLeague(leagues);
  const bestTier = bestLeague ? tierFor(bestLeague.percentile) : null;
  if (bestLeague && (bestTier === "excellent" || bestTier === "good")) {
    return pvpVerdictLine(bestLeague, speciesContext[bestLeague.league]);
  }
  if (raidRoles.length) return raidVerdictLine(raidRoles[0], ivs);
  if (gymRank?.tier) return gymVerdictLine(gymRank);
  if (bestLeague) return pvpVerdictLine(bestLeague, speciesContext[bestLeague.league]);
  return "No ranked role found for this species in raids, PvP, or gym defense — this spread has no home in the current rankings.";
}

function evaluateForm(formId, { forms, pvp, raids, gym, ivs }) {
  const form = forms[formId];
  if (!form) return null;
  const leagues = leaguesFor(form, ivs);
  const speciesContext = speciesContextFor(formId, pvp);
  const raidRoles = raidRolesFor(formId, raids);
  const gymRank = gymRankFor(form, gym);
  const verdict = synthesizeVerdict({ leagues, speciesContext, raidRoles, gymRank, ivs });
  return { formId, name: form.name, leagues, speciesContext, raidRoles, gymRank, verdict };
}

// A "role" is a MEANINGFUL ranked appearance, not just existing in a raw
// full-pool index: gym.defenderIndex covers every scored regular form
// (dex.js's own doc comment — ~950 forms), so almost everything has SOME
// index row; only a tiered (defenderRanking-listed) gym rank counts, exactly
// like dex.js's own gymSection treats an untiered indexRow as "outside the
// ranking" rather than a real placement.
function hasSpeciesRoles(result) {
  return Boolean(result.gymRank?.tier) || result.raidRoles.length > 0 || Object.values(result.speciesContext).some(Boolean);
}

// checkSpread({formId, ivs, forms, pvp, raids, gym}) -> null when formId
// isn't a known form, otherwise the flat contract described in this file's
// own doc comment above: leagues/speciesContext/raidRoles/gymRank/verdict
// for the primary evaluated form, plus:
//   primary  - "base" (the picked species has its own ranked role, or
//              doesn't evolve), "evolution" (the picked species has no role
//              of its own and evolves to exactly one final form — that
//              form's data is promoted to the top level), or "branches"
//              (no role of its own, but a branching family — every end's
//              result lives in `evolutions`, and the base's own honest
//              empty result stays primary since no single branch is "the"
//              answer).
//   asName   - the name of whichever form's data populated leagues/
//              speciesContext/raidRoles/gymRank/verdict (differs from
//              `name` only when primary is "evolution").
//   evolutions - every terminal evolution's own full result (formId, name,
//              leagues, speciesContext, raidRoles, gymRank, verdict), []
//              when the picked species doesn't evolve.
export function checkSpread({ formId, ivs, forms = {}, pvp = {}, raids = {}, gym = {} } = {}) {
  const pickedForm = formId ? forms[formId] : null;
  if (!pickedForm) return null;
  const normalizedIvs = normalizeIvs(ivs);
  const context = { forms, pvp, raids, gym, ivs: normalizedIvs };

  const base = evaluateForm(formId, context);
  const endIds = [...new Set(terminalFormIds(formId, forms))].filter((id) => id !== formId);
  const evolutions = endIds.map((id) => evaluateForm(id, context)).filter(Boolean);

  if (!hasSpeciesRoles(base) && evolutions.length === 1) {
    const evo = evolutions[0];
    return {
      formId, name: pickedForm.name,
      leagues: evo.leagues, speciesContext: evo.speciesContext, raidRoles: evo.raidRoles, gymRank: evo.gymRank,
      verdict: evo.verdict,
      primary: "evolution", asName: evo.name,
      evolutions,
    };
  }

  return {
    formId, name: pickedForm.name,
    leagues: base.leagues, speciesContext: base.speciesContext, raidRoles: base.raidRoles, gymRank: base.gymRank,
    verdict: base.verdict,
    primary: !hasSpeciesRoles(base) && evolutions.length > 1 ? "branches" : "base",
    asName: pickedForm.name,
    evolutions,
  };
}
