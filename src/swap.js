// Battle swap helper: given an opponent's typing, order YOUR team by who
// has the best matchup against them. Pure data layer — web/src/views/swap.js
// renders it.
import { LEAGUE_CP_CAP, bestInstanceForLeague, buildMyTeam, myTeamOverridesFor } from "./pvp-team.js";
import { typeEffectiveness } from "./effectiveness.js";

export const SWAP_LEAGUES = Object.freeze(Object.keys(LEAGUE_CP_CAP));

// Attack types one of your Pokémon can plausibly hit with. Prefers the
// user's actual instance moves (what they really taught it) over the
// league's optimal ranked moveset, since that's the honest read of what
// you'd throw in battle; ranked moveset is the next-best guess when the
// instance has no recorded moves. Falls back to the Pokémon's own typing
// (STAB) when neither is known, or when a move id can't be resolved to a
// type — moveCatalog is raid-scoped (188 raid-optimal moves) and doesn't
// cover every PvP move (135 distinct ids, 41 missing as of 2026-07), so a
// partial resolve would silently drop real coverage rather than fall back.
function resolveMoveIds(moveIds, moveCatalog) {
  if (!moveIds?.length) return null;
  const types = moveIds.map((moveId) => moveCatalog?.[moveId]?.moveType);
  return types.every(Boolean) ? [...new Set(types)] : null;
}

// Like resolveMoveIds, but keeps whatever moves DO resolve instead of
// discarding the whole set over one unresolvable id — used for the user's
// actual instance moves, where a partial read (e.g. Earthquake known but
// Acid Spray unresolvable) is still the honest, no-credit-where-not-due
// answer. Full-set-or-nothing stays for the ranked moveset guess below.
function resolveKnownMoveTypes(moveIds, moveCatalog) {
  if (!moveIds?.length) return null;
  const types = moveIds.map((moveId) => moveCatalog?.[moveId]?.moveType).filter(Boolean);
  return types.length ? [...new Set(types)] : null;
}

function myAttackTypes(form, { pvpRow, instance, moveCatalog } = {}) {
  const instanceMoveIds = instance?.fastMove && instance?.chargedMoves?.length
    ? [instance.fastMove, ...instance.chargedMoves]
    : null;
  // Instance moves are what the user's copy actually knows — if we have
  // them, never fall through to the ranked-ideal moveset, even when a move
  // id can't be resolved. Falling back there would credit moves the user's
  // Pokémon provably doesn't have.
  if (instanceMoveIds) {
    return resolveKnownMoveTypes(instanceMoveIds, moveCatalog) ?? [form.primary_type, form.secondary_type].filter(Boolean);
  }
  const rankedMoveIds = pvpRow ? [pvpRow.fastMove, ...(pvpRow.chargedMoves ?? [])].filter(Boolean) : null;
  return resolveMoveIds(rankedMoveIds, moveCatalog)
    ?? [form.primary_type, form.secondary_type].filter(Boolean);
}

// One "because" clause for a single attacking-type vs single-defending-side
// fact. subject is who the multiplier is described as hitting/resisting.
function clause({ mine, subject, type, multiplier }) {
  if (multiplier > 1) {
    return mine
      ? { magnitude: multiplier - 1, text: `your ${type} hits ${subject} hard` }
      : { magnitude: multiplier - 1, text: `${subject} hits back hard with ${type}` };
  }
  if (multiplier < 1) {
    return mine
      ? { magnitude: 1 - multiplier, text: `${subject} resists your ${type}` }
      : { magnitude: 1 - multiplier, text: `you resist ${subject}'s ${type}` };
  }
  return null;
}

// Net favorability for one of your Pokémon against a fixed opponent: your
// best available attack-type multiplier against them, minus their best
// type multiplier against you (opponent's typing stands in for their attack
// types — this app doesn't know which moves a wild/rival trainer's mon is
// running). This is a simple net score to *order* a handful of options, not
// a full battle simulator — ties and close calls still deserve a look at
// the "because" line, not blind trust in the ranking.
export function matchupAgainst(form, opponentForm, { pvpRow, instance, moveCatalog } = {}) {
  const myTypes = myAttackTypes(form, { pvpRow, instance, moveCatalog });
  const opponentTypes = [opponentForm.primary_type, opponentForm.secondary_type].filter(Boolean);

  const offenseHits = myTypes.map((type) => ({ type, multiplier: typeEffectiveness(type, opponentForm) }));
  const defenseHits = opponentTypes.map((type) => ({ type, multiplier: typeEffectiveness(type, form) }));
  const offense = Math.max(...offenseHits.map((hit) => hit.multiplier));
  const defense = Math.max(...defenseHits.map((hit) => hit.multiplier));

  const clauses = [
    ...offenseHits.map((hit) => clause({ mine: true, subject: opponentForm.name, type: hit.type, multiplier: hit.multiplier })),
    ...defenseHits.map((hit) => clause({ mine: false, subject: opponentForm.name, type: hit.type, multiplier: hit.multiplier })),
  ].filter(Boolean).sort((left, right) => right.magnitude - left.magnitude).slice(0, 2).map((entry) => entry.text);

  const because = clauses.length
    ? `${clauses.join("; ")}.`.replace(/^./, (char) => char.toUpperCase())
    : "Even matchup on paper — no big type edge either way.";

  return { formId: form.form_id, form, offense, defense, net: offense - defense, because };
}

// Ranks your team (best matchup first) against one fixed opponent.
export function rankTeamAgainstOpponent(teamForms, opponentForm, { pvpRows = [], instanceByFormId = {}, moveCatalog = {} } = {}) {
  const rowByFormId = new Map(pvpRows.map((row) => [row.formId, row]));
  return (teamForms ?? [])
    .filter(Boolean)
    .map((form) => matchupAgainst(form, opponentForm, {
      pvpRow: rowByFormId.get(form.form_id),
      instance: instanceByFormId[form.form_id],
      moveCatalog,
    }))
    .sort((left, right) => right.net - left.net || right.offense - left.offense || left.formId.localeCompare(right.formId));
}

// Picks the team to run the swap analysis on: the Builder's saved league
// team (web/src/pvp-team.js) when it has anyone in it, else degrades to
// whatever the caller passes as a manual "any 3 owned" pick — so a roster
// with nothing eligible for that league still gets to use this tool.
export function resolveSwapTeam({ league, pvp = {}, pvpTeams = [], roster = {}, forms = {}, manualFormIds = [] } = {}) {
  const overrides = myTeamOverridesFor(roster?.preferences, league);
  const built = buildMyTeam({ league, pvp, pvpTeams, roster, forms, overrides });
  const builtMembers = built.members.filter(Boolean);
  if (builtMembers.length) {
    const instanceByFormId = Object.fromEntries(
      builtMembers.filter((member) => member.instance).map((member) => [member.formId, member.instance]),
    );
    return { teamForms: builtMembers.map((member) => member.form), degraded: false, instanceByFormId };
  }
  const manualForms = [...new Set(manualFormIds)].map((formId) => forms[formId]).filter(Boolean).slice(0, 3);
  const cap = LEAGUE_CP_CAP[league];
  const instanceByFormId = Object.fromEntries(
    manualForms
      .map((form) => [form.form_id, bestInstanceForLeague(roster?.instances, form.form_id, cap)])
      .filter(([, instance]) => instance),
  );
  return { teamForms: manualForms, degraded: true, instanceByFormId };
}

// Name/dex substring search over all known forms, for the opponent picker.
export function searchOpponentForms(query, forms = {}) {
  const needle = String(query ?? "").trim().toLowerCase();
  const all = Object.values(forms);
  const matches = needle ? all.filter((form) => form.name?.toLowerCase().includes(needle)) : all;
  return matches.sort((left, right) => left.name.localeCompare(right.name));
}

// --- ui state (ephemeral — not persisted to the roster, like drill.js) ---

export function createSwapState() {
  return { step: "team", league: "great", manualFormIds: [], opponentFormId: null, opponentQuery: "" };
}

export function setSwapLeague(swap, league) {
  if (!SWAP_LEAGUES.includes(league)) return swap;
  return { ...swap, league, manualFormIds: [] };
}

export function toggleSwapManualPick(swap, formId) {
  const picked = new Set(swap.manualFormIds);
  if (picked.has(formId)) picked.delete(formId);
  else if (picked.size < 3) picked.add(formId);
  return { ...swap, manualFormIds: [...picked] };
}

export function advanceSwapToOpponent(swap) {
  return { ...swap, step: "opponent" };
}

export function backToSwapTeam(swap) {
  return { ...swap, step: "team" };
}

export function backToSwapOpponent(swap) {
  return { ...swap, step: "opponent", opponentFormId: null };
}

export function selectSwapOpponent(swap, formId) {
  return { ...swap, opponentFormId: formId, step: "result" };
}

export function setSwapOpponentQuery(swap, query) {
  return { ...swap, opponentQuery: String(query ?? "").slice(0, 60) };
}
