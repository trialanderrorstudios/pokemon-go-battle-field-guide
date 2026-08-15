// Head-to-head compare — two forms side by side. No new math: base stats are
// straight field reads, typing uses type-chart.js's own effectivenessOf (the
// canonical table — see that file's own doc comment), best raid role/PvP
// rank/gym verdict are lookups into the exact same ranked-row/gym-index
// shapes dex.js's gymSection/pvpSection/raidAttackerSection already read
// (raids.regular/shadow rows carry formId/attackingType/rank/status; pvp[league]
// rows carry formId/rank; gym carries defenderIndex/defenderRanking/
// shadowDefenderRanking), and owned status reuses instances.js's
// bestInstanceForForm/instanceLevel (the same "best owned copy" instances.js
// already defines for other views).
import { effectivenessOf } from "./type-chart.js";
import { bestInstanceForForm, instanceLevel } from "./instances.js";

const LEAGUE_NAMES = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });

function numericRow(label, valueA, valueB) {
  return {
    label,
    a: { text: String(valueA), winner: valueA > valueB },
    b: { text: String(valueB), winner: valueB > valueA },
  };
}

function statRows(formA, formB) {
  const rows = [
    numericRow("Attack", Number(formA.base_attack), Number(formB.base_attack)),
    numericRow("Defense", Number(formA.base_defense), Number(formB.base_defense)),
    numericRow("Stamina", Number(formA.base_stamina), Number(formB.base_stamina)),
  ];
  rows.push(numericRow(
    "Bulk (Def × Sta)",
    Number(formA.base_defense) * Number(formA.base_stamina),
    Number(formB.base_defense) * Number(formB.base_stamina),
  ));
  return rows;
}

// Best of a side's own types used as an attack against the other side's
// typing — the same STAB effectiveness read raid-target.js's becauseLine
// does for a boss, just between two Pokémon's typings instead of a move type
// and a boss.
function bestOffense(attackTypes, defenderTypes) {
  const values = attackTypes.filter(Boolean).map((type) => effectivenessOf(type, defenderTypes));
  return values.length ? Math.max(...values) : 1;
}

function typeRow(formA, formB) {
  const typesA = [formA.primary_type, formA.secondary_type].filter(Boolean);
  const typesB = [formB.primary_type, formB.secondary_type].filter(Boolean);
  const aInto = bestOffense(typesA, typesB);
  const bInto = bestOffense(typesB, typesA);
  return {
    label: "Typing",
    a: { text: `${typesA.join("/")} — hits ${typesB.join("/")} at ${aInto}x`, winner: aInto > bInto },
    b: { text: `${typesB.join("/")} — hits ${typesA.join("/")} at ${bInto}x`, winner: bInto > aInto },
  };
}

// Shared shape for the three ranked-lane rows below: `lookup` resolves to
// { loaded, row } — loaded=false means that whole data lane wasn't passed in
// at all (honest "not loaded" rather than a fabricated "unranked"); loaded
// with row=null means the lane IS in, this form just isn't in it ("no ranked
// appearances", the spec's own honest phrasing for that case).
function rankRow(label, resA, resB, formatRow) {
  const textFor = (res) => (!res.loaded ? "Not loaded yet." : !res.row ? "no ranked appearances" : formatRow(res.row));
  const rankA = resA.row?.rank ?? null;
  const rankB = resB.row?.rank ?? null;
  return {
    label,
    a: { text: textFor(resA), winner: rankA !== null && (rankB === null || rankA < rankB) },
    b: { text: textFor(resB), winner: rankB !== null && (rankA === null || rankB < rankA) },
  };
}

function bestRaidRow(formId, raidRows) {
  if (!raidRows) return { loaded: false };
  const rows = [...(raidRows.regular ?? []), ...(raidRows.shadow ?? [])]
    .filter((row) => row.formId === formId && row.status === "ranked");
  if (!rows.length) return { loaded: true, row: null };
  return { loaded: true, row: rows.reduce((top, row) => (row.rank < top.rank ? row : top)) };
}

function bestPvpRow(formId, pvpRows) {
  if (!pvpRows) return { loaded: false };
  let best = null;
  for (const league of Object.keys(LEAGUE_NAMES)) {
    const row = (pvpRows[league] ?? []).find((entry) => entry.formId === formId);
    if (row && (!best || row.rank < best.rank)) best = { ...row, league };
  }
  return { loaded: true, row: best };
}

// gymRows is the same gym-tool object dex.js's gymSection reads: full-pool
// defenderIndex/defenderRanking for regular defenders, a top-100-only
// shadowDefenderRanking for shadow defenders (dex.js's own gymVerdict —
// this mirrors that split rather than inventing a second one).
function gymRankFor(form, gymRows) {
  if (!gymRows) return { loaded: false };
  if (form.shadow) {
    const ranking = gymRows.shadowDefenderRanking ?? [];
    const row = ranking.find((entry) => entry.formId === form.form_id);
    return { loaded: true, row: row ? { rank: row.rank, of: ranking.length, tier: row.tier ?? null } : null };
  }
  const indexRow = (gymRows.defenderIndex ?? []).find((entry) => entry.formId === form.form_id);
  if (!indexRow) return { loaded: true, row: null };
  const of = (gymRows.defenderIndex ?? []).length;
  const rankedRow = indexRow.tier ? (gymRows.defenderRanking ?? []).find((entry) => entry.formId === form.form_id) : null;
  return { loaded: true, row: { rank: rankedRow?.rank ?? indexRow.rank, of, tier: rankedRow?.tier ?? null } };
}

function ownedRow(formA, formB, roster) {
  const instA = bestInstanceForForm(roster?.instances, formA.form_id);
  const instB = bestInstanceForForm(roster?.instances, formB.form_id);
  const textFor = (form, instance) => {
    if (!instance) return "Not owned";
    const level = instanceLevel(form, instance);
    const ivText = `${instance.ivs.atk}/${instance.ivs.def}/${instance.ivs.sta}`;
    return `CP ${instance.cp} — ${ivText} IVs${level !== null ? ` @ L${level}` : ""}`;
  };
  // Owning isn't a competitive "win" the way a numeric stat is — no winner
  // marked on this row, just an honest status per side.
  return {
    label: "Owned",
    a: { text: textFor(formA, instA), winner: false },
    b: { text: textFor(formB, instB), winner: false },
  };
}

// compareForms(formIdA, formIdB, { forms, raidRows, pvpRows, gymRows, roster })
// -> { a: { formId, form }, b: { formId, form }, selfCompare, rows }
// rows is [] whenever either side can't be resolved to a real form, or both
// ids are the same real form (self-compare guard) — the caller (renderCompareView)
// is responsible for showing pickers/guidance in that case, not this function.
export function compareForms(formIdA, formIdB, { forms = {}, raidRows = null, pvpRows = null, gymRows = null, roster = {} } = {}) {
  const formA = forms[formIdA] ?? null;
  const formB = forms[formIdB] ?? null;
  const selfCompare = Boolean(formIdA) && formIdA === formIdB;
  const a = { formId: formIdA ?? null, form: formA };
  const b = { formId: formIdB ?? null, form: formB };
  if (!formA || !formB || selfCompare) {
    return { a, b, selfCompare, rows: [] };
  }
  const rows = [
    ...statRows(formA, formB),
    typeRow(formA, formB),
    rankRow("Best raid role", bestRaidRow(formA.form_id, raidRows), bestRaidRow(formB.form_id, raidRows),
      (row) => `${row.attackingType} rank #${row.rank}`),
    rankRow("Best PvP rank", bestPvpRow(formA.form_id, pvpRows), bestPvpRow(formB.form_id, pvpRows),
      (row) => `${LEAGUE_NAMES[row.league]} rank #${row.rank}`),
    rankRow("Gym defense", gymRankFor(formA, gymRows), gymRankFor(formB, gymRows),
      (row) => `Rank #${row.rank} of ${row.of}${row.tier ? ` (${row.tier} tier)` : ""}`),
    ownedRow(formA, formB, roster),
  ];
  return { a, b, selfCompare: false, rows };
}
