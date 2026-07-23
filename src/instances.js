// Manual roster "detailed instance" math: solving level from CP + IVs via the
// standard Pokemon GO CP-multiplier curve, and constraining fast/charged move
// choices to what a form can actually learn (release data only, never free text).

// Frozen CP multiplier table (integer levels). Mirrors this repo's own
// server-side calculator (src/pogo_encyclopedia/iv.py INTEGER_CPM), itself
// sourced from the frozen Game Master (pokeminers-game-master) plus the
// official Level 41-51 XL Candy / Best Buddy leveling values. Half-levels are
// the square-root interpolation the game's own CP formula uses between them.
const INTEGER_CPM = {
  1: 0.094, 2: 0.16639787, 3: 0.21573247, 4: 0.25572005, 5: 0.29024988,
  6: 0.3210876, 7: 0.34921268, 8: 0.3752356, 9: 0.39956728, 10: 0.4225,
  11: 0.44310755, 12: 0.4627984, 13: 0.48168495, 14: 0.49985844, 15: 0.51739395,
  16: 0.5343543, 17: 0.5507927, 18: 0.5667545, 19: 0.5822789, 20: 0.5974,
  21: 0.6121573, 22: 0.6265671, 23: 0.64065295, 24: 0.65443563, 25: 0.667934,
  26: 0.6811649, 27: 0.69414365, 28: 0.7068842, 29: 0.7193991, 30: 0.7317,
  31: 0.7377695, 32: 0.74378943, 33: 0.74976104, 34: 0.7556855, 35: 0.76156384,
  36: 0.76739717, 37: 0.7731865, 38: 0.77893275, 39: 0.784637, 40: 0.7903,
  41: 0.7953, 42: 0.8003, 43: 0.8053, 44: 0.8103, 45: 0.8153, 46: 0.8203,
  47: 0.8253, 48: 0.8303, 49: 0.8353, 50: 0.8403, 51: 0.8453,
};
const MIN_LEVEL = 1;
const MAX_LEVEL = 51;

export function cpMultiplier(level) {
  const doubled = Math.round(level * 2);
  if (Math.abs(level * 2 - doubled) > 1e-9 || level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new RangeError(`Unsupported Pokémon level: ${level}`);
  }
  if (doubled % 2 === 0) return INTEGER_CPM[doubled / 2];
  const lower = (doubled - 1) / 2;
  return Math.sqrt((INTEGER_CPM[lower] ** 2 + INTEGER_CPM[lower + 1] ** 2) / 2);
}

export function calculateCp(form, ivs, level) {
  const cpm = cpMultiplier(level);
  const raw = (form.base_attack + ivs.atk)
    * Math.sqrt(form.base_defense + ivs.def)
    * Math.sqrt(form.base_stamina + ivs.sta)
    * cpm * cpm / 10;
  return Math.max(10, Math.floor(raw));
}

const ALL_LEVELS = [];
for (let doubled = MIN_LEVEL * 2; doubled <= MAX_LEVEL * 2; doubled += 1) ALL_LEVELS.push(doubled / 2);

// CP is monotonic non-decreasing in level for fixed IVs, so the lowest level
// that reproduces the observed CP is the one the in-game appraisal/power-up
// screen would show. Returns null if no level 1-51 produces this exact CP —
// an impossible CP/IV combination.
export function solveLevel(form, ivs, cp) {
  for (const level of ALL_LEVELS) {
    if (calculateCp(form, ivs, level) === cp) return level;
  }
  return null;
}


// In-game team-leader "Overall" appraisal star tiers, as IV-sum (0-45)
// ranges. 4 stars is a distinct tier here for the perfect-roll (45) highlight
// the game shows with a pink/red glow; the in-game UI itself only ever shows
// 0-3 stars plus that color cue, so treat "4 stars" as this app's shorthand
// for "the highlighted 3-star roll", not a literal 4th star the game draws.
// Source (cross-checked, matching values): "Pokémon GO IVs and the Appraisal
// System Explained" (igitems.com) and Pokémon GO Hub's appraisal guide
// (pokemongohub.net), both giving 23-29 / 30-36 / 37-44 / 45.
export const STAR_TIER_RANGES = Object.freeze([
  Object.freeze({ stars: 0, min: 0, max: 22 }),
  Object.freeze({ stars: 1, min: 23, max: 29 }),
  Object.freeze({ stars: 2, min: 30, max: 36 }),
  Object.freeze({ stars: 3, min: 37, max: 44 }),
  Object.freeze({ stars: 4, min: 45, max: 45 }),
]);


// All atk/def/sta IV combinations (0-15 each) whose sum falls in a star
// tier's range AND that reproduce the given CP at some level 1-51 (via
// solveLevel, so this never forks the CP/level math). Backs the "I only know
// the star tier" appraisal-widget path: narrows 4096 possible combos down to
// the handful actually consistent with what the player already entered.
// Capped at `limit` — a low CP/tier pair can match dozens of combos, and this
// is meant to hand the user a short tap-to-fill list, not solve it for them.
export function candidateIvsForTier(form, cp, tierRange, { limit = 10 } = {}) {
  const cpNumber = Number(cp);
  if (!form?.form_id || !tierRange || !Number.isInteger(cpNumber) || cpNumber <= 0) return [];
  const candidates = [];
  for (let atk = 0; atk <= 15; atk += 1) {
    for (let def = 0; def <= 15; def += 1) {
      for (let sta = 0; sta <= 15; sta += 1) {
        const sum = atk + def + sta;
        if (sum < tierRange.min || sum > tierRange.max) continue;
        const ivs = { atk, def, sta };
        if (solveLevel(form, ivs, cpNumber) !== null) {
          candidates.push(ivs);
          if (candidates.length >= limit) return candidates;
        }
      }
    }
  }
  return candidates;
}


export function validateIvs(ivs) {
  for (const key of ["atk", "def", "sta"]) {
    const value = ivs?.[key];
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      return `${key.toUpperCase()} IV must be a whole number from 0 to 15.`;
    }
  }
  return null;
}


// Legal fast/charged moves for a form, straight from release data — the
// quick-add sheet's move pickers are chips over this list, never free text.
export function legalMoves(form) {
  return {
    fastMoves: [...(form?.fast_moves ?? [])],
    chargedMoves: [...(form?.charged_moves ?? [])],
  };
}


export function validateMoves(form, fastMove, chargedMoves) {
  const legal = legalMoves(form);
  if (!legal.fastMoves.includes(fastMove)) {
    return "Pick a fast move this Pokémon can actually learn.";
  }
  if (!Array.isArray(chargedMoves) || chargedMoves.length < 1 || chargedMoves.length > 2) {
    return "Pick 1 or 2 charged moves.";
  }
  if (new Set(chargedMoves).size !== chargedMoves.length) {
    return "Charged moves must be different from each other.";
  }
  for (const moveId of chargedMoves) {
    if (!legal.chargedMoves.includes(moveId)) {
      return "Pick charged moves this Pokémon can actually learn.";
    }
  }
  return null;
}


// Shared CP/IV validation for buildInstance and buildImportedInstance: valid
// IV spread, positive whole-number CP, and a CP that's actually reachable by
// some level 1-51 for those IVs. Throws a friendly, user-facing RangeError.
function requireValidCp(form, ivs, cp) {
  const ivError = validateIvs(ivs);
  if (ivError) throw new RangeError(ivError);
  const cpNumber = Number(cp);
  if (!Number.isInteger(cpNumber) || cpNumber <= 0) {
    throw new RangeError("Enter a positive whole-number CP.");
  }
  if (solveLevel(form, ivs, cpNumber) === null) {
    throw new RangeError("That CP doesn't match those IVs at any level — double-check the CP?");
  }
  return cpNumber;
}


// Validates raw quick-add-sheet input and returns a persistable roster
// instance (schema: id, formId, cp, ivs, fastMove, chargedMoves, nickname?,
// isShiny?, isLucky?, addedAt). Level is deliberately NOT stored — it's
// derived on demand via solveLevel() from cp+ivs+the form's base stats, so it
// can never drift from the CPM table. isShiny/isLucky are manual honesty
// flags (round 9 collection tracking) — omitted entirely when false/unset,
// same convention as nickname. Throws a friendly, user-facing RangeError on
// invalid input.
export function buildInstance(form, { cp, ivs, fastMove, chargedMoves, nickname, isShiny, isLucky } = {}) {
  if (!form?.form_id) throw new RangeError("Unknown Pokémon form.");
  const moveError = validateMoves(form, fastMove, chargedMoves);
  if (moveError) throw new RangeError(moveError);
  const cpNumber = requireValidCp(form, ivs, cp);
  const trimmedNickname = typeof nickname === "string" ? nickname.trim() : "";
  return {
    id: crypto.randomUUID(),
    formId: form.form_id,
    cp: cpNumber,
    ivs: { atk: ivs.atk, def: ivs.def, sta: ivs.sta },
    fastMove,
    chargedMoves: [...chargedMoves],
    ...(trimmedNickname ? { nickname: trimmedNickname } : {}),
    ...(isShiny ? { isShiny: true } : {}),
    ...(isLucky ? { isLucky: true } : {}),
    addedAt: new Date().toISOString(),
  };
}


// Same as buildInstance, but for bulk-import sources (e.g. Poke Genie CSV)
// that carry verified CP/IVs but no move data. Omits fastMove/chargedMoves
// rather than guessing — the roster UI prompts to add them via the normal
// edit sheet. isLucky is the one Poke Genie collection flag with a real CSV
// column (see poke-genie-import.js); isShiny isn't in that export, so
// callers only pass it from other sources.
export function buildImportedInstance(form, { cp, ivs, nickname, isShiny, isLucky } = {}) {
  if (!form?.form_id) throw new RangeError("Unknown Pokémon form.");
  const cpNumber = requireValidCp(form, ivs, cp);
  const trimmedNickname = typeof nickname === "string" ? nickname.trim() : "";
  return {
    id: crypto.randomUUID(),
    formId: form.form_id,
    cp: cpNumber,
    ivs: { atk: ivs.atk, def: ivs.def, sta: ivs.sta },
    ...(trimmedNickname ? { nickname: trimmedNickname } : {}),
    ...(isShiny ? { isShiny: true } : {}),
    ...(isLucky ? { isLucky: true } : {}),
    addedAt: new Date().toISOString(),
  };
}


// Lightweight "I changed this one" touch: re-enter just the CP after a
// power-up/level-up/trade, re-validated against this instance's existing IVs
// (same requireValidCp the full add/edit sheet uses) without requiring moves
// to be set — the point is fixing a moveless Poke Genie import as easily as a
// full manual entry. Stamps updatedAt so consumers can tell this instance was
// hand-verified since the last bulk import.
export function reviseInstanceCp(form, instance, cp) {
  if (!form?.form_id) throw new RangeError("Unknown Pokémon form.");
  if (!instance) throw new RangeError("Unknown instance.");
  const cpNumber = requireValidCp(form, instance.ivs, cp);
  return { ...instance, cp: cpNumber, updatedAt: new Date().toISOString() };
}


// Best (highest-CP) detailed instance owned for a form, or null. Downstream
// honesty flag: consumers prefer this over the binary owned-star assumption
// when it exists.
export function bestInstanceForForm(instances, formId) {
  const matches = (instances ?? []).filter((instance) => instance.formId === formId);
  if (!matches.length) return null;
  return matches.reduce((best, candidate) => (candidate.cp > best.cp ? candidate : best));
}


// Derived level for a stored instance, or null if the form's base stats
// aren't available in this release (should not happen for an owned form, but
// this is called from render paths, so fail soft rather than throw).
export function instanceLevel(form, instance) {
  if (!form || !instance) return null;
  return solveLevel(form, instance.ivs, instance.cp);
}


// Evolution CP predictor (round 13). Evolution preserves the exact IVs and
// level of the pre-evolution Pokemon — only the base stats change, because
// evolving doesn't reroll IVs or reset the CP-multiplier level the way
// hatching or catching a new Pokemon would (Niantic support: "Evolving a
// Pokemon does not change its IVs" / Silph Road IV literature; this is also
// why Poke Genie and every other IV tool treats evolution as IV-preserving).
// So the predicted evolved CP is exactly calculateCp() — the same function
// this file already uses for every other CP figure — run against the target
// form's base stats with those same IVs and level. No new math.
//
// form.evolves_to is a one-step edge list (see evolution.py): each entry is
// {formId, candyCost} for one immediate next stage. This walks it
// recursively to build the full remaining chain, so a three-stage line
// (Machop -> Machoke -> Machamp) reports every stage, not just the next one.
// A branching family (Eevee-class) has more than one edge at some step;
// every branch is returned rather than guessing which one the player wants,
// and the walk does not continue past a branch — the player picks one to
// continue evolving, so choosing a single "main" line for them would be a
// guess dressed up as data. Returns [] when the form doesn't evolve (or this
// release has no sourced evolution-chain data for it) — never a guessed CP.
export function evolutionForecast(form, ivs, level, forms = {}) {
  const edges = form?.evolves_to ?? [];
  const branches = [];
  for (const edge of edges) {
    const targetForm = forms[edge?.formId];
    if (!targetForm || !Number.isInteger(edge.candyCost)) continue;
    branches.push({
      formId: edge.formId,
      name: targetForm.name,
      candyCost: edge.candyCost,
      predictedCp: calculateCp(targetForm, ivs, level),
      next: evolutionForecast(targetForm, ivs, level, forms),
    });
  }
  return branches;
}
