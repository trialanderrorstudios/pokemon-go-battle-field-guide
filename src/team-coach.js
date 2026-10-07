// Team Coach (operator ask, 2026-10-06): three honesty checks a real
// coaching session surfaced that the app didn't do yet — (1) "is my
// non-ranked moveset okay?", (2) "why did my Pokemon barely dent that
// type?", (3) "who do I switch into what?". Pure data layer, no new math:
// reuses type-chart.js's own effectiveness table, cup-team.js's
// published-build helper, and pvp-sim.js's simulator. web/src/views/pvp.js
// renders this.
import { ATTACK_TYPES, effectivenessOf } from "./type-chart.js";
import { weaknessesOf } from "./effectiveness.js";
import { sideFromPublishedBuild } from "./cup-team.js";
import { simulatePvp } from "./pvp-sim.js";
import { solveLevel } from "./instances.js";

// Pokémon GO has no true immunities — a "double-resisted" matchup (Normal
// into Ghost, Ground into Flying, etc.) still deals 0.390625x, the same
// multiplier as any other double resist on the chart (type-chart.js's own
// DOUBLE_RESISTED table; app.js's boss-card badges already label this exact
// number "0.39x"). Every string this module's callers render says "0.39x" /
// "barely dents", never "can't hit" or "immune" — see views/pvp.js.
const DOUBLE_RESIST_MULTIPLIER = 0.390625;
const EPSILON = 1e-9;
// Same top-N convention as cup-team.js's simulateVsMeta (meta.slice(0, 8)).
const META_SIZE = 8;

function typesOf(form) {
  return [form?.primary_type, form?.secondary_type].filter(Boolean);
}

// A member's actual moves as {id, type, power, kind}, or null if any move
// is missing or doesn't resolve in the catalog — callers fall back to the
// league-ranked moveset themselves rather than this function guessing.
export function memberMoves(fastMove, chargedMoves, moveCatalog) {
  if (!fastMove || !chargedMoves?.length) return null;
  const entries = [
    { id: fastMove, kind: "fast" },
    ...chargedMoves.map((id) => ({ id, kind: "charged" })),
  ].map((entry) => ({ ...entry, type: moveCatalog?.[entry.id]?.type, power: moveCatalog?.[entry.id]?.power }));
  return entries.every((entry) => entry.type) ? entries : null;
}

// Which of these moves are double-resisted (0.39x) by defenderTypes, and
// which still hit normally. Null when nothing is double-resisted. Checked
// against whatever defenderTypes is given — callers that pass a single
// representative type (the 18-type sweep below) are approximating a real
// opponent by one of its types only; a genuine dual-type defender can stack
// two separate 0.625x resists into the same 0.39x even when neither type
// appears in type-chart.js's own DOUBLE_RESISTED table (e.g. Grass into a
// Fire/Flying defender) — this function itself handles that fine (it reads
// whatever types it's given), but the 18-type sweep below does not scan
// those combinations.
export function offenseGapVsTypes(moves, defenderTypes) {
  if (!moves?.length) return null;
  const landing = moves.filter((move) => effectivenessOf(move.type, defenderTypes) > DOUBLE_RESIST_MULTIPLIER + EPSILON);
  const blocked = moves.filter((move) => !landing.includes(move));
  return blocked.length ? { blocked, landing } : null;
}

// Every one of the 18 single types these moves are double-resisted (0.39x)
// by at least partly — reused both as the per-member "0.39x" warning and
// (filtered further) as the switch guide's "avoid switching into" lines.
// Single-type sweep only (see offenseGapVsTypes's doc comment above): a real
// two-type opponent can double-resist via a combination this doesn't check.
export function offenseBlindSpots(moves) {
  return ATTACK_TYPES
    .map((type) => ({ type, gap: offenseGapVsTypes(moves, [type]) }))
    .filter((row) => row.gap)
    .map(({ type, gap }) => ({ type, ...gap }));
}

// --- Switch guide (lead/safe-switch/closer trio) -------------------------

// Heuristic, deliberately simple — label it a suggestion, not a rating:
// Safe Switch is whoever has the fewest type weaknesses (safest to bring in
// blind); Closer is whoever has the single hardest-hitting charged move
// among what's left; Lead is whoever remains. No invented numbers — both
// inputs already exist (effectiveness.js's weaknessesOf, the move catalog's
// own power field).
export function suggestedRoles(members) {
  if (members.length !== 3) return null;
  const byWeaknesses = [...members].sort((left, right) => (
    weaknessesOf(left.form).size - weaknessesOf(right.form).size
  ));
  const safeSwitch = byWeaknesses[0];
  const remaining = members.filter((member) => member !== safeSwitch);
  const maxPower = (member) => Math.max(0, ...(member.moves ?? [])
    .filter((move) => move.kind === "charged").map((move) => move.power ?? 0));
  const [closer, lead] = [...remaining].sort((left, right) => maxPower(right) - maxPower(left));
  return { Lead: lead.name, "Safe Switch": safeSwitch.name, Closer: closer.name };
}

// Switch guide, split into two independent questions per type rather than
// one conflated pick — "type" here can mean either the opponent's incoming
// attack type or the opponent's own (defending) type, and a real two-type
// opponent's other type can answer each question differently (a Fire/Flying
// attacker's Fire STAB can hit a "good vs Flying" switch-in hard even
// though it resists a Flying attack) — so this never assumes a one-type
// opponent is purely that type on both sides of the matchup:
//   - switchTo: which member RESISTS an incoming attack of this type best
//     (defense only — effectivenessOf(type, member's own types)).
//   - bestAttacker: which member's own moves hit a DEFENDER of this type
//     hardest (offense only — effectivenessOf(move's type, [this type])).
// hitsBack/backMultiplier describe the switchTo pick's own offense against
// this type, for information only — it is never used to choose switchTo.
export function switchGuideRows(members) {
  return ATTACK_TYPES.map((type) => {
    const bestOffenseOf = (member) => ((member.moves ?? []).length
      ? Math.max(...member.moves.map((move) => effectivenessOf(move.type, [type])))
      : 0);
    const [switchPick] = [...members].sort((left, right) => (
      effectivenessOf(type, typesOf(left.form)) - effectivenessOf(type, typesOf(right.form))
    ));
    const [attackPick] = [...members].sort((left, right) => bestOffenseOf(right) - bestOffenseOf(left));
    const backMultiplier = bestOffenseOf(switchPick);
    return {
      type,
      switchTo: switchPick.name,
      defense: effectivenessOf(type, typesOf(switchPick.form)),
      hitsBack: backMultiplier > DOUBLE_RESIST_MULTIPLIER + EPSILON,
      backMultiplier,
      bestAttacker: attackPick.name,
      bestAttackerMultiplier: bestOffenseOf(attackPick),
    };
  });
}

// "Avoid switching <member> into <type>" — only when EVERY one of the
// member's moves is double-resisted (0.39x) by that type, i.e. nothing in
// its kit hits normally. A move or two being double-resisted while another
// still lands normally is a partial gap, not a reason to avoid the switch
// outright — that partial case is covered by the per-member 0.39x warning
// (offenseBlindSpots itself), not repeated here.
export function avoidSwitchLines(members) {
  return members.flatMap((member) => offenseBlindSpots(member.moves ?? [])
    .filter((gap) => gap.landing.length === 0)
    .map((gap) => ({ member: member.name, type: gap.type })));
}

// --- Your-moveset check ---------------------------------------------------

function sameMoveset(fastMove, chargedMoves, row) {
  if (!row) return true; // nothing published to compare against
  if (fastMove !== row.fastMove) return false;
  const mine = [...(chargedMoves ?? [])].sort();
  const ranked = [...(row.chargedMoves ?? [])].sort();
  return mine.length === ranked.length && mine.every((id, index) => id === ranked[index]);
}

// Opponents' own builds for the sim — these legitimately use PvPoke's
// published default IVs (sideFromPublishedBuild), since the meta opponents
// aren't the build under test; only the player's own two sides being
// compared need to share IVs/level (see movesetCheck below).
function metaOpponents(league, pvp, forms, excludeFormId) {
  return (pvp?.[league] ?? [])
    .filter((row) => row.formId !== excludeFormId)
    .slice(0, META_SIZE)
    .map((row) => ({ name: row.pokemon ?? forms?.[row.formId]?.name ?? row.formId, side: sideFromPublishedBuild(row, forms?.[row.formId]) }))
    .filter((opponent) => opponent.side);
}

function winsAgainst(side, opponents, moveCatalog) {
  let wins = 0;
  let total = 0;
  for (const opponent of opponents) {
    try {
      const result = simulatePvp(side, opponent.side, { shields: [1, 1], moveCatalog });
      total += 1;
      if (result.winner === "a") wins += 1;
    } catch {
      // One opponent's move doesn't resolve in this release's catalog —
      // skip just that matchup, same discipline as cup-team.js's simulateVsMeta.
    }
  }
  return { wins, total };
}

// A type the added move hits that both of the member's OTHER moves are
// resisted by — the coverage reason an off-meta swap actually works, e.g.
// "Flamethrower hits Steel, which resists both your other moves." Returns
// null (not fabricated) when no such type exists for this swap.
function coverageTradeNote(fastMove, chargedMoves, row, moveCatalog) {
  const yourIds = [fastMove, ...chargedMoves];
  const rankedIds = [row.fastMove, ...row.chargedMoves];
  const added = yourIds.filter((id) => !rankedIds.includes(id));
  const typeOf = (id) => moveCatalog?.[id]?.type;
  for (const addedId of added) {
    const addedType = typeOf(addedId);
    if (!addedType) continue;
    const others = yourIds.filter((id) => id !== addedId);
    const otherTypes = others.map(typeOf);
    if (!otherTypes.every(Boolean)) continue;
    const blockingType = ATTACK_TYPES.find((type) => (
      effectivenessOf(addedType, [type]) >= 1
      && otherTypes.every((otherType) => effectivenessOf(otherType, [type]) < 1)
    ));
    if (blockingType) {
      return { addedMoveId: addedId, blockingType, otherMoveCount: others.length };
    }
  }
  return null;
}

// Simulates the player's actual logged moveset against the league's
// published (ranked) moveset for the SAME build — same form, IVs, and
// level, only the moves differ — against the league's top-N meta (same
// sideFromPublishedBuild + simulatePvp as cup-team.js's simulateVsMeta), so
// a non-ranked build can be judged on results instead of guesswork. Null
// when there's nothing to compare: moves aren't fully logged, the ranked
// row has no published moveset, they already match, or there's no meta to
// test against. Approximate — see pvp-sim.js's MEASURED_AGREEMENT_PCT —
// and a close result (within a win or two of META_SIZE opponents) is not a
// verdict; callers should say so rather than imply one moveset "won".
export function movesetCheck({ instance, form, row, league, pvp, forms, moveCatalog }) {
  if (!instance?.fastMove || !instance?.chargedMoves?.length || !form || !row) return null;
  if (!row.fastMove || !row.chargedMoves?.length) return null;
  if (sameMoveset(instance.fastMove, instance.chargedMoves, row)) return null;
  const level = solveLevel(form, instance.ivs, instance.cp);
  if (level === null) return null;
  const opponents = metaOpponents(league, pvp, forms, instance.formId);
  if (!opponents.length) return null;
  const yourSide = {
    form, ivs: instance.ivs, level, fastMove: instance.fastMove, chargedMoves: instance.chargedMoves,
  };
  // Only the moves differ from yourSide — same form/IVs/level — so a win-
  // count gap is attributable to the moveset, not to comparing two
  // different builds (yours vs PvPoke's own default IVs for this species).
  const rankedSide = { ...yourSide, fastMove: row.fastMove, chargedMoves: row.chargedMoves };
  const yours = winsAgainst(yourSide, opponents, moveCatalog);
  const ranked = winsAgainst(rankedSide, opponents, moveCatalog);
  return {
    yourWins: yours.wins,
    yourTotal: yours.total,
    rankedWins: ranked.wins,
    rankedTotal: ranked.total,
    tradeNote: coverageTradeNote(instance.fastMove, instance.chargedMoves, row, moveCatalog),
  };
}
