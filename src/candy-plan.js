import { bestInstanceForForm, evolutionForecast, instanceLevel } from "./instances.js";


// Evolution Candy Planner — composes roster ownership, resource-inventory
// Candy, and the existing raid/PvP/gym relevance signals into "what's worth
// evolving toward". It never touches powerUpCost/xlPowerUpCost: power-up
// Candy (leveling an existing copy) and evolution Candy (evolving a species)
// are separate game currencies spent from the same Candy pool, and this
// module only ever reasons about the latter.
//
// Data-availability gap (round 12 SPIKE, 2026-07-23): closed in round 13.
// pvpoke-pokemon.json's family.evolutions (chain topology) and pokeminers-
// game-master.json's evolutionBranch (real Candy cost) are now mapped onto
// this app's form_id scheme at build time — see evolution.py. A form with no
// evolution, or no sourced cost/target for a branch, still carries an empty
// `evolves_to`, so the "data-gap" path below stays live for whatever this
// extraction genuinely can't source; it's just no longer the only path.
//
// Round 13 also adds a predicted CP per reachable row: when the owner has a
// detailed instance (CP/IVs/level) recorded for the pre-evolution form, the
// row's `predictedCp` is that instance's IVs+level run through the target
// form's base stats (evolutionForecast — see instances.js; evolution
// preserves IVs/level, so this is the same calculateCp() everything else
// uses, not new math). Absent a detailed instance, `predictedCp` is simply
// omitted — never a guessed number.


function ownedFormIdSet(roster = {}) {
  const ids = new Set(roster.ownedFormIds ?? []);
  for (const instance of roster.instances ?? []) if (instance?.formId) ids.add(instance.formId);
  return ids;
}


function ownedSpeciesDexSet(forms, ownedIds) {
  const dex = new Set();
  for (const formId of ownedIds) {
    const value = forms[formId]?.dex;
    if (Number.isInteger(value)) dex.add(value);
  }
  return dex;
}


// Best already-displayed relevance for a form id — the same raid/PvP/gym-
// defender arrays triage.js reads, just looked up by form id instead of by
// owned instance. Not new ranking math: these rows are already ranked
// upstream (raid.js/pvp.js/gym.py); this only asks "is this exact form in
// that ranked list".
function relevanceFor(formId, { raids, pvp, gym } = {}) {
  for (const lane of ["regular", "shadow"]) {
    for (const candidate of raids?.[lane] ?? []) {
      if (candidate.formId === formId && candidate.status === "ranked") {
        return { because: `Top ${candidate.attackingType} raid attacker at #${candidate.rank} in the raid guide.` };
      }
    }
  }
  for (const league of ["great", "ultra"]) {
    if ((pvp?.[league] ?? []).some((candidate) => candidate.formId === formId)) {
      return { because: `${league === "great" ? "Great League" : "Ultra League"} ranked pick.` };
    }
  }
  if ((gym?.defenders ?? []).some((candidate) => candidate.formId === formId)) {
    return { because: "Ranked gym defender in the gyms guide." };
  }
  return null;
}


// True once any bundled form actually carries evolution-chain data. Live
// today: always false (see gap note above). Computed live, never hardcoded,
// so this flips on its own the moment a future round adds the field.
export function candyPlanDataAvailable(forms = {}) {
  return Object.values(forms).some((form) => Array.isArray(form?.evolves_to) && form.evolves_to.length > 0);
}


// One row per owned form, honest at every branch:
// - owned but no recorded Candy -> "record-candy" grace row, no guessed count.
// - owned + Candy recorded but this form has no evolution data -> "data-gap".
// - owned + Candy recorded + evolution data present -> one "reachable" row
//   per branch with derivable value (raid/PvP/gym relevance, or the target
//   species is uncaught -> dex-fill), dropping branches with no derivable
//   value at all instead of guessing one.
// Species the user does not own are never suggested — there is nothing to
// evolve if there is no base Pokémon.
export function candyPlanRows({ forms = {}, roster = {}, candyInventory = {}, raids, pvp, gym, friendGapDex } = {}) {
  const owned = ownedFormIdSet(roster);
  const ownedDex = ownedSpeciesDexSet(forms, owned);
  const rows = [];

  for (const formId of owned) {
    const form = forms[formId];
    if (!form) continue;
    // Trade seam: friendGapDex is the set of dex numbers a saved trade friend
    // lacks (trade-share.js tradeComparison youHaveTheyLack). A species a
    // friend is missing is worth keeping a spare of for trade night, whether
    // or not evolving another copy fills your own dex.
    const base = { formId, dex: form.dex, name: form.name, tradeKeep: friendGapDex?.has?.(form.dex) === true };
    const hasCandy = Object.prototype.hasOwnProperty.call(candyInventory, formId);

    if (!hasCandy) {
      rows.push({ ...base, status: "record-candy", because: "Record this species' Candy to plan its evolutions." });
      continue;
    }

    const candyOwned = candyInventory[formId];
    const branches = Array.isArray(form.evolves_to) ? form.evolves_to : null;

    // Predicted CP per branch, keyed by target formId — degrades to no
    // prediction (never a guess) when there's no detailed instance recorded
    // for this owned form to derive an IV/level from.
    const bestInstance = bestInstanceForForm(roster.instances, formId);
    const bestLevel = bestInstance ? instanceLevel(form, bestInstance) : null;
    const predictedCpByTarget = new Map();
    if (bestInstance && bestLevel !== null) {
      for (const forecastBranch of evolutionForecast(form, bestInstance.ivs, bestLevel, forms)) {
        predictedCpByTarget.set(forecastBranch.formId, forecastBranch.predictedCp);
      }
    }

    if (!branches?.length) {
      rows.push({
        ...base,
        status: "data-gap",
        candyOwned,
        because: "Evolution-chain data isn't in this release's dataset yet.",
      });
      continue;
    }

    for (const branch of branches) {
      const targetFormId = branch?.formId;
      const candyCost = Number(branch?.candyCost);
      const target = forms[targetFormId];
      if (!target || !Number.isInteger(candyCost) || candyCost <= 0) continue;

      const dexFill = !ownedDex.has(target.dex);
      const relevance = relevanceFor(targetFormId, { raids, pvp, gym });
      if (!relevance && !dexFill) continue; // no derivable value -> never suggested

      const candyNeeded = Math.max(0, candyCost - candyOwned);
      const predictedCp = predictedCpByTarget.get(targetFormId);
      rows.push({
        ...base,
        status: "reachable",
        candyOwned,
        candyCost,
        candyNeeded,
        ...(predictedCp !== undefined ? { predictedCp } : {}),
        reachable: candyNeeded === 0,
        targetFormId,
        targetName: target.name,
        dexFill,
        because: relevance?.because ?? null,
      });
    }
  }

  // Value-per-candy-remaining: rows with derivable value sort first, cheapest
  // remaining Candy first among those; grace/gap rows follow, by dex.
  return rows.sort((left, right) => {
    const leftRank = left.status === "reachable" ? 0 : 1;
    const rightRank = right.status === "reachable" ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.status === "reachable") {
      return (left.candyNeeded - right.candyNeeded) || (left.dex - right.dex);
    }
    return left.dex - right.dex;
  });
}
