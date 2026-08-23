// Elite TM Planner — "which of my Pokémon should spend a free Elite TM?"
// World Championships hands out a free Elite TM; this answers it from data
// this app already computes: raidRows.regular/shadow's per-attackingType
// OPTIMAL moveset (assemble.py's best_same_type_moveset — optimalFastMove/
// optimalChargedMove, not the row's raw fastMove/chargedMove, which can
// disagree with the optimal pick; see row.movesetDisagreement) plus each
// form's own move_availability map (assemble.py stamps availabilityClass —
// standard/communityDayClassic/eliteOnly/eventOnly — on every move in that
// form's elite_moves + event_only_moves). Same authority dex.js's
// eliteMoveLabel and move-sheet.js's moveLink already read.
//
// Ranking priority, highest first:
//   1. availabilityClass — eliteOnly before communityDayClassic. A CD-classic
//      move returns every December Community Day weekend (evolve during the
//      event, or an Elite TM afterward); an eliteOnly move never comes back
//      any other way. A free Elite TM is worth more spent on the move that
//      never returns.
//   2. the row's own rank (lower is better) within its attackingType.
//   3. the owned instance's IV sum, then CP (higher wins) — the copy most
//      worth investing in when several copies could take the TM.
// eventOnly moves are excluded outright: that class means "not obtainable by
// any TM, mechanically" (raid.py's classify_move_availability), so an Elite
// TM plan can never spend on one — this is the class's own definition, not a
// gap here. optimalEliteFastTM/optimalEliteChargedTM (raw form.elite_moves
// membership) never true for an eventOnly move anyway, since that comes from
// the separate event_only_moves list — so the eventOnly exclusion below is
// belt-and-suspenders for a curated override that reclassifies an
// elite_moves entry as eventOnly.
const AVAILABILITY_PRIORITY = { eliteOnly: 0, communityDayClassic: 1 };

function ivSum(ivs) {
  return (ivs?.atk ?? 0) + (ivs?.def ?? 0) + (ivs?.sta ?? 0);
}

// form.move_availability is the served, already-resolved class per elite/
// event move. moveAvailability (the raw curated data/curated/
// move-availability.json entries, formId -> moveId -> {availabilityClass})
// is only a fallback for a form record shipped without the baked map. When
// neither has an entry, default eliteOnly — same safe default raid.py's
// classify_move_availability uses for an uncurated elite_moves member.
function availabilityClassFor(form, moveId, moveAvailability) {
  const served = form?.move_availability?.[moveId];
  if (served) return served;
  const curated = moveAvailability?.[form?.form_id]?.[moveId];
  return curated?.availabilityClass ?? "eliteOnly";
}

function eliteMoveEntries(row, form, moveAvailability) {
  const entries = [];
  if (row.optimalEliteFastTM && row.optimalFastMove) {
    entries.push({ moveKind: "fast", moveId: row.optimalFastMove });
  }
  if (row.optimalEliteChargedTM && row.optimalChargedMove) {
    entries.push({ moveKind: "charged", moveId: row.optimalChargedMove });
  }
  return entries
    .map((entry) => ({ ...entry, availabilityClass: availabilityClassFor(form, entry.moveId, moveAvailability) }))
    .filter((entry) => entry.availabilityClass === "eliteOnly" || entry.availabilityClass === "communityDayClassic");
}

function alreadyHasMove(instance, moveKind, moveId) {
  if (moveKind === "fast") return instance.fastMove === moveId;
  return (instance.chargedMoves ?? []).includes(moveId);
}

function whyFor(availabilityClass, row) {
  const reason = availabilityClass === "eliteOnly"
    ? "Elite TM only — never broadly distributed again, so a free Elite TM is well spent here."
    : "Community Day classic — returns every December Community Day weekend for candy, so this ranks behind any "
      + "eliteOnly move waiting on the same TM.";
  return `${reason} #${row.rank} ranked ${row.attackingType} attacker.`;
}

// dedupe by (instanceId, move): the list is already sorted by priority, so
// keeping the first occurrence per key keeps that pair's best-ranked role.
function dedupe(list, cap) {
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const key = `${entry.instance.id}|${entry.move}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { instance, ...rest } = entry;
    out.push({ instanceId: instance.id, ...rest });
    if (cap && out.length >= cap) break;
  }
  return out;
}

export function eliteTmPlan({ roster = {}, forms = {}, raidRows = {}, moveAvailability = {} } = {}) {
  const instances = roster?.instances ?? [];
  if (!instances.length) {
    return {
      candidates: [],
      alreadySet: [],
      note: "No roster recorded yet — add Pokémon on the Dex or My Roster page first, then come back here to see "
        + "which one should get the free Elite TM.",
    };
  }

  const rankedRows = [...(raidRows?.regular ?? []), ...(raidRows?.shadow ?? [])]
    .filter((row) => row.status === "ranked");

  const rawCandidates = [];
  const rawAlreadySet = [];

  for (const instance of instances) {
    const form = forms[instance.formId];
    if (!form) continue;
    const name = form.name ?? instance.formId;
    const rows = rankedRows.filter((row) => row.formId === instance.formId);

    for (const row of rows) {
      for (const entry of eliteMoveEntries(row, form, moveAvailability)) {
        const owned = alreadyHasMove(instance, entry.moveKind, entry.moveId);
        const bucket = owned ? rawAlreadySet : rawCandidates;
        bucket.push({
          instance,
          formId: instance.formId,
          name,
          move: entry.moveId,
          moveKind: entry.moveKind,
          availabilityClass: entry.availabilityClass,
          rank: row.rank,
          attackingType: row.attackingType,
          why: owned ? "Already running the elite optimal — no TM needed." : whyFor(entry.availabilityClass, row),
        });
      }
    }
  }

  const priority = (entry) => AVAILABILITY_PRIORITY[entry.availabilityClass] ?? 2;
  const compare = (a, b) => priority(a) - priority(b)
    || a.rank - b.rank
    || ivSum(b.instance.ivs) - ivSum(a.instance.ivs)
    || (b.instance.cp ?? 0) - (a.instance.cp ?? 0);

  rawCandidates.sort(compare);
  rawAlreadySet.sort(compare);

  const candidates = dedupe(rawCandidates);
  const alreadySet = dedupe(rawAlreadySet, 10);

  const note = candidates.length
    ? ""
    : "Nothing in your roster has a ranked attacking role that needs an Elite TM move right now.";

  return { candidates, alreadySet, note };
}
