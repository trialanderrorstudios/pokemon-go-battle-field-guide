// Community-derived "Showcase score" estimate (PokeStop Showcases feature).
// Niantic has never published this formula — it's reverse-engineered by
// bmenrigh/sellyme/minibenoit/LemmoritoSensei (Pokemon GO Hub writeup, cross-
// checked independently against real showcased Pokemon on the GO Hub forum's
// "55. Showcase Scores" thread). See the showcase-formula-research lane's
// findings for full sourcing. Every result this module returns is labelled
// as an estimate — never presented as an exact/official number.
//
// score = ScaledHeight*800 + ScaledWeight*150 + ScaledIV*50, plus a flat
// +178 bonus when the entrant is XXL-sized.
//   ScaledHeight = (observedHeightM / form.base_height_m) / XXL_HEIGHT_CLASS
//   ScaledWeight = (observedWeightKg / form.base_weight_kg) / XXL_WEIGHT_CLASS_MAX
//   ScaledIV     = (atk+def+sta IV sum, 0-45) / 45
// form.base_height_m/base_weight_kg are the frozen Game Master's own
// pokedexHeightM/pokedexWeightKg per form (assemble.attach_size_baselines) —
// the "species mean" the community formula divides by. 0 means this
// release's frozen source has no dex entry for the form at all.
//
// ponytail: XXL_HEIGHT_CLASS/XXL_WEIGHT_CLASS_MAX are ONE of three real
// per-species buckets (1.55/2.05, 1.75/2.25, 2.00/2.50) Niantic's client
// infers per-species from each species' own observed max-XXL size. That
// bucket assignment is not a Game Master field and is not derivable from
// one (showcase-formula-research: "needs a hand-curated per-species lookup
// table"). No such table exists in this codebase, so every species uses the
// one bucket with a confirmed real test vector (Squirtle, GO Hub research
// article) rather than guessing a per-species value. This is a second,
// real source of error on top of the formula's own documented display-
// rounding uncertainty — a species whose true bucket differs from 1.75/2.25
// will be off by more than the label alone implies. Upgrade path: a hand-
// curated dex-number -> bucket table, sourced the same way and keyed the
// same way attach_size_baselines() keys forms (data-lane scope, not this
// UI lane's).
const XXL_HEIGHT_CLASS = 1.75;
const XXL_WEIGHT_CLASS_MAX = 2.25;
const XXL_BONUS = 178;
const MAX_SCORE = 1000; // "a Thousando" — max non-XXL score per the research.
const MAX_XXL_SCORE = MAX_SCORE + XXL_BONUS;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ivSum(ivs) {
  const complete = [ivs?.atk, ivs?.def, ivs?.sta].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 15,
  );
  return complete ? ivs.atk + ivs.def + ivs.sta : null;
}

const BAND_THRESHOLDS = Object.freeze([
  { min: 900, band: "elite" },
  { min: 700, band: "strong" },
  { min: 400, band: "average" },
]);

function bandFor(score) {
  return BAND_THRESHOLDS.find((tier) => score >= tier.min)?.band ?? "low";
}

// Pure. Returns null (never a fabricated 0) when the inputs needed to
// compute anything are missing: no observed height/weight on the instance,
// or no baseline for this form in the current release's frozen source
// (base_height_m/base_weight_kg default to 0 — see models.py's own comment
// on that sentinel).
export function showcaseEstimate(form, instance) {
  const baseHeight = form?.base_height_m;
  const baseWeight = form?.base_weight_kg;
  const heightM = instance?.heightM;
  const weightKg = instance?.weightKg;
  if (!(baseHeight > 0) || !(baseWeight > 0)) return null;
  if (!Number.isFinite(heightM) || heightM <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  const ivTotal = ivSum(instance?.ivs);
  if (ivTotal === null) return null;

  const isXxl = instance?.sizeClass === "xxl";
  const heightScore = ((heightM / baseHeight) / XXL_HEIGHT_CLASS) * 800;
  const weightScore = ((weightKg / baseWeight) / XXL_WEIGHT_CLASS_MAX) * 150;
  const ivScore = (ivTotal / 45) * 50;
  const bonus = isXxl ? XXL_BONUS : 0;
  const raw = heightScore + weightScore + ivScore + bonus;
  const score = Math.round(clamp(raw, 0, isXxl ? MAX_XXL_SCORE : MAX_SCORE));

  return {
    score,
    band: bandFor(score),
    label: `~${String(score)  /* locale-proof: max 1178, toLocaleString would render "1.178" under some node locales */} — estimated (community-derived)`,
  };
}
