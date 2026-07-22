import { ATTACK_TYPES, effectivenessOf } from "./type-chart.js";

export { ATTACK_TYPES };


export function effectiveness(attackingType, primaryType, secondaryType = null) {
  return effectivenessOf(attackingType, [primaryType, secondaryType]);
}


// One line for a counter card: which of the boss's types this attacking
// type is super effective against, and whether stacking both types compounds
// into a double weakness (matches the 2.56x threshold used for DPS lanes
// elsewhere in this file).
export function becauseLine(attackingType, bossTypes) {
  const types = (bossTypes ?? []).filter(Boolean);
  const netEffectiveness = effectivenessOf(attackingType, types);
  // A dual-type boss can resist enough of a hit type to net out at or below
  // neutral (e.g. 1.6x weak * 0.625x resisted === 1 exactly) even though it's
  // individually weak to one of its types — "beats" would be misleading then.
  if (netEffectiveness <= 1) return "";
  const hitTypes = types.filter((type) => effectivenessOf(attackingType, [type]) > 1);
  if (!hitTypes.length) return "";
  const line = `${attackingType} beats ${hitTypes.join(" + ")}`;
  return netEffectiveness >= 2.56 ? `${line} — double weakness` : line;
}


// Beginner-mode grouping: rows are already sorted best-first within a type
// (counterLane sorts by effectiveness desc, then rank asc), so grouping by
// attackingType and slicing preserves that order — no re-sort needed.
export function groupCountersByType(rows, perType = 3) {
  const order = [];
  const byType = new Map();
  for (const row of rows ?? []) {
    if (!byType.has(row.attackingType)) {
      byType.set(row.attackingType, []);
      order.push(row.attackingType);
    }
    byType.get(row.attackingType).push(row);
  }
  return order.map((attackingType) => [attackingType, byType.get(attackingType).slice(0, perType)]);
}


function unwrap(data) {
  return {
    forms: data.forms ?? data.core?.forms ?? {},
    raids: data.raids?.regular ? data.raids : data.raids?.raids ?? {},
    tool: data.raidTargetTool?.targets
      ? data.raidTargetTool
      : data.raidTargetTool?.raidTargetTool ?? {},
    currentBosses: data.currentBosses?.bosses ?? data.currentBosses?.currentBosses?.bosses ?? [],
  };
}


// A boss is "hard" (Tier 5 / Mega difficulty) if its species is tagged
// legendary/mythical/ultrabeast, or it's a Mega, or the rotation's own tier
// label says so. Checked ahead of the rotation's literal tier string because
// ScrapedDuck labels Shadow Legendary raids (e.g. Shadow Palkia) as tier
// "Shadow" — same as trivial Shadow Mankey — even though they play like Tier 5.
const HARD_TAGS = new Set(["legendary", "mythical", "ultrabeast", "wildlegendary"]);

function bossDifficulty(formId, tierLabel, forms) {
  const tags = new Set(forms?.[formId]?.tags ?? []);
  const hard = [...tags].some((tag) => HARD_TAGS.has(tag))
    || tags.has("mega")
    || /5|mega/i.test(tierLabel ?? "");
  return hard ? "hard" : "easy";
}

function bossTierLabel(formId, currentBosses, forms) {
  const rotation = (currentBosses ?? []).find((boss) => boss.formId === formId);
  if (rotation?.tier) return rotation.tier;
  const tags = new Set(forms?.[formId]?.tags ?? []);
  if (tags.has("mega")) return "Mega";
  if ([...tags].some((tag) => HARD_TAGS.has(tag))) return "Tier 5";
  if (forms?.[formId]?.shadow) return "Shadow";
  return "Standard";
}

const TIER_GUIDANCE = {
  hard: "raids like this usually need 3+ trainers, even with strong counters",
  easy: "raids like this are usually soloable or duoable with decent counters",
};

// Calibration (2026-07-21, superseding the 2026-07-21 mean-of-averageEstimator attempt):
// averageEstimator is Pokebattler's per-attacker, per-attacking-type figure, averaged across
// whatever matchups Pokebattler happened to run that attacker against. It isn't controlled for
// sample difficulty or size, so it doesn't compare across attackers at all — a fringe, rarely-
// tested attacker can show a LOWER (more "efficient-looking") estimator than a genuinely elite
// one tested against harder matchups. Verified in release data: rank-1 Shadow Haxorus averages
// 1.09, rank-2 Mega Tyranitar 1.05 — worse than many fringe rank-8+ rows. Banding on that mean
// let a fringe roster out-rank a roster of every top counter in the game. `rank` doesn't have
// this problem: raid.py's _score_key orders attackers by real battle points first and only uses
// averageEstimator as a last tiebreak among equal points, so "how many owned counters are
// top-ranked for their type" is the honest, comparable signal.
const RANK_TIERS = { elite: 3, solid: 8 }; // position in Pokebattler's per-type top-15: 1-3 elite, 4-8 solid meta pick, 9-15 fringe
const MIN_COUNTERS_FOR_VERDICT = 3; // fewer than half a lobby of identified counters isn't a reliable read

const BEATABILITY_CAVEAT = "Estimates assume decent play; weather and friend bonuses help.";

export function beatability({ ownedCounters, formId, currentBosses, forms }) {
  const tierLabel = bossTierLabel(formId, currentBosses, forms);
  const difficulty = bossDifficulty(formId, tierLabel, forms);
  const owned = ownedCounters ?? [];
  if (owned.length < MIN_COUNTERS_FOR_VERDICT) {
    return {
      band: "not-enough-data",
      headline: "Not enough data — star more Pokémon you own",
      detail: `${tierLabel} ${TIER_GUIDANCE[difficulty]}.`,
      tierLabel,
      caveat: BEATABILITY_CAVEAT,
    };
  }
  // Easy raids (Tier 1-3) are usually soloable/duoable even with a middling roster, so they never
  // escalate past "duoable" — sharing the hard tier's 3-band ladder let an easy boss misread as
  // needing "a full lobby" once its mean crossed the same bar a hard boss uses.
  if (difficulty === "easy") {
    return {
      band: "duoable",
      headline: "Likely duo-able with your team",
      detail: `${tierLabel} raid boss.`,
      tierLabel,
      caveat: BEATABILITY_CAVEAT,
    };
  }
  const eliteShare = owned.filter((row) => row.rank <= RANK_TIERS.elite).length / owned.length;
  const solidShare = owned.filter((row) => row.rank <= RANK_TIERS.solid).length / owned.length;
  const band = eliteShare >= 0.5 ? "duoable" : solidShare >= 0.5 ? "bring-3-4" : "full-lobby";
  const headline = {
    duoable: "Likely duo-able with your team",
    "bring-3-4": "Bring 3-4 trainers",
    "full-lobby": "Bring a full lobby",
  }[band];
  return { band, headline, detail: `${tierLabel} raid boss.`, tierLabel, caveat: BEATABILITY_CAVEAT };
}


function compareCounters(left, right) {
  return (right.effectiveness - left.effectiveness)
    || (Number(left.rank) - Number(right.rank))
    || (Number(right.points ?? 0) - Number(left.points ?? 0))
    || String(left.formId).localeCompare(String(right.formId));
}


// Every qualifying counter, sorted — unbounded. counterLane() slices this to a
// display limit and dedupes by exact form, since a flat lane should only show
// a Pokemon once (under its single best attacking type). Beginner mode groups
// by type first (dedupeAcrossTypes: false) — a form can legitimately be a top-3
// counter under more than one of the boss's weakness types, and deduping
// globally before grouping was dropping it from every type but its best one.
function counterCandidates(rows, bossTypes, { owned = null, dedupeAcrossTypes = true } = {}) {
  const candidates = [];
  for (const row of rows ?? []) {
    if (row?.status !== "ranked" || !row.formId || (owned && !owned.has(row.formId))) continue;
    const multiplier = effectiveness(row.attackingType, bossTypes[0], bossTypes[1]);
    if (multiplier <= 1) continue;
    candidates.push({ ...row, typeRank: row.rank, effectiveness: Math.round(multiplier * 10000) / 10000 });
  }
  candidates.sort(compareCounters);
  if (!dedupeAcrossTypes) return candidates;
  const output = [];
  const seen = new Set();
  for (const row of candidates) {
    if (seen.has(row.formId)) continue;
    seen.add(row.formId);
    output.push(row);
  }
  return output;
}


function counterLane(rows, bossTypes, { limit, owned = null }) {
  return counterCandidates(rows, bossTypes, { owned }).slice(0, limit);
}


function encounterBand(target, encounterLevel) {
  if (["weatherBoosted", "boosted", 25, "25", 25.0].includes(encounterLevel)) {
    return ["weatherBoosted", target.weatherBoosted];
  }
  if (["normal", "unboosted", 20, "20", 20.0, undefined, null].includes(encounterLevel)) {
    return ["normal", target.normal];
  }
  throw new RangeError(`Unknown raid encounter level: ${encounterLevel}`);
}


const HUNDO_TIP = "Higher CP after a raid = better stats. Boosted catches are stronger AND cost less to power up.";

// Bands are the observed CP's position between the encounter's 10/10/10 floor and 15/15/15 ceiling.
// ponytail: linear position in the CP range, not a simulated IV-combo distribution — "honest" means
// derived from the documented min/hundo CPs, not a claim of exact percentile statistics.
function hundoVerdict(observedCp, band, boostedBand) {
  // boostedBand is only passed when the selected encounter is the normal (Level 20) band, so its
  // presence tells us the un-boosted default level; otherwise we're already in the Level 25 band.
  const baseLevel = boostedBand ? 20 : 25;
  if (observedCp === undefined || observedCp === null || observedCp === "") {
    return { status: "not-entered", label: "", message: "Enter the catch-screen CP to compare.", inferredLevel: baseLevel };
  }
  const cp = Number(observedCp);
  if (!Number.isInteger(cp) || cp <= 0) {
    return { status: "invalid", label: "", message: "Enter a positive whole-number CP from the catch screen.", inferredLevel: baseLevel };
  }

  // A raid catch can only exceed the normal-encounter hundo CP if it was weather-boosted (Level 25 stats).
  const boosted = Boolean(boostedBand) && cp > band.hundoCP;
  const activeBand = boosted ? boostedBand : band;
  const boostNote = boosted ? " Weather-boosted catch detected from the CP." : "";
  const inferredLevel = boosted ? 25 : baseLevel;

  // cp > band.hundoCP but < boostedBand.minimumRaidIVCP is the gap between the two encounter
  // levels — no real raid catch lands there, so it's out of range even though it looked "boosted".
  if (cp > activeBand.hundoCP || cp < activeBand.minimumRaidIVCP) {
    return {
      status: "outside-range",
      label: "",
      message: "That CP doesn't fit a possible catch at this encounter level — double-check the number or the encounter level.",
      inferredLevel,
    };
  }
  if (cp === activeBand.hundoCP) {
    return {
      status: "hundo",
      label: "Perfect (hundo!)",
      message: `15/15/15 — the maximum possible stats at this encounter level.${boostNote} ${HUNDO_TIP}`,
      inferredLevel,
    };
  }

  const range = activeBand.hundoCP - activeBand.minimumRaidIVCP;
  const fraction = range > 0 ? (cp - activeBand.minimumRaidIVCP) / range : 0;
  if (fraction >= 0.75) {
    return {
      status: "great",
      label: "Great — close to hundo",
      message: `Close to hundo stats.${boostNote} ${HUNDO_TIP}`,
      inferredLevel,
    };
  }
  if (fraction >= 0.4) {
    return {
      status: "fine",
      label: "Fine",
      message: `Usable stats, but not standout.${boostNote} ${HUNDO_TIP}`,
      inferredLevel,
    };
  }
  return {
    status: "low",
    label: "Low",
    message: `Near the bottom of the stat range for this encounter level.${boostNote} ${HUNDO_TIP}`,
    inferredLevel,
  };
}


// Standard Pokemon GO power-up cost table (Candy + Stardust per half-level step), levels 1-40.
// Fixed by Niantic and unchanged since the Level 40 cap. `upto` is the level a tier's cost
// applies through (inclusive); each tier covers every 0.5-level step from the previous tier's
// `upto`. Verified against known totals: 1->40 is 306 candy/270,000 dust; 20->40 is
// 250 candy/225,000 dust; 25->40 is 222 candy/194,000 dust.
// Does not cover Level 41+ (Best Buddy / Candy XL tiers) — out of scope, capped at 40 below.
export const POWERUP_TIERS = Object.freeze([
  { upto: 3, candy: 1, stardust: 200 },
  { upto: 5, candy: 1, stardust: 400 },
  { upto: 7, candy: 1, stardust: 600 },
  { upto: 9, candy: 1, stardust: 800 },
  { upto: 11, candy: 1, stardust: 1000 },
  { upto: 13, candy: 2, stardust: 1300 },
  { upto: 15, candy: 2, stardust: 1600 },
  { upto: 17, candy: 2, stardust: 1900 },
  { upto: 19, candy: 2, stardust: 2200 },
  { upto: 21, candy: 2, stardust: 2500 },
  { upto: 23, candy: 3, stardust: 3000 },
  { upto: 25, candy: 3, stardust: 3500 },
  { upto: 27, candy: 4, stardust: 4000 },
  { upto: 29, candy: 4, stardust: 4500 },
  { upto: 31, candy: 4, stardust: 5000 },
  { upto: 33, candy: 6, stardust: 6000 },
  { upto: 35, candy: 8, stardust: 7000 },
  { upto: 37, candy: 10, stardust: 8000 },
  { upto: 39, candy: 12, stardust: 9000 },
  { upto: 40, candy: 15, stardust: 10000 },
]);

// Total Candy + Stardust to power up from fromLevel to toLevel (default: Level 40, the practical cap).
export function powerUpCost(fromLevel, toLevel = 40) {
  const from = Math.max(1, Math.min(40, Number(fromLevel) || 1));
  const to = Math.max(1, Math.min(40, Number(toLevel) || 40));
  let candy = 0;
  let stardust = 0;
  for (let halfLevel = Math.round(from * 2) + 1; halfLevel <= Math.round(to * 2); halfLevel++) {
    const level = halfLevel / 2;
    const tier = POWERUP_TIERS.find((row) => level <= row.upto);
    if (!tier) continue;
    candy += tier.candy;
    stardust += tier.stardust;
  }
  return { candy, stardust };
}

// Endgame (Level 41-50) XL Candy + Stardust power-up cost, per half-level step.
// XL Candy is a separate, far rarer currency than the regular Candy POWERUP_TIERS
// spends below Level 40. Values cross-checked against two independent public
// summaries (Pokemon GO Hub's "Candy and Stardust requirement chart" and
// Gamepur's "Level 41-50 XL Candy" guide): both agree the base cost from
// Level 40 to 50 totals 296 XL Candy + 250,000 Stardust, which this table
// reproduces exactly (each half-step below costs the same as its partner
// half-step within the same whole level).
export const XL_POWERUP_TIERS = Object.freeze([
  { upto: 40.5, candy: 10, stardust: 10000 },
  { upto: 41, candy: 10, stardust: 10000 },
  { upto: 41.5, candy: 10, stardust: 11000 },
  { upto: 42, candy: 10, stardust: 11000 },
  { upto: 42.5, candy: 12, stardust: 11000 },
  { upto: 43, candy: 12, stardust: 11000 },
  { upto: 43.5, candy: 12, stardust: 12000 },
  { upto: 44, candy: 12, stardust: 12000 },
  { upto: 44.5, candy: 15, stardust: 12000 },
  { upto: 45, candy: 15, stardust: 12000 },
  { upto: 45.5, candy: 15, stardust: 13000 },
  { upto: 46, candy: 15, stardust: 13000 },
  { upto: 46.5, candy: 17, stardust: 13000 },
  { upto: 47, candy: 17, stardust: 13000 },
  { upto: 47.5, candy: 17, stardust: 14000 },
  { upto: 48, candy: 17, stardust: 14000 },
  { upto: 48.5, candy: 20, stardust: 14000 },
  { upto: 49, candy: 20, stardust: 14000 },
  { upto: 49.5, candy: 20, stardust: 15000 },
  { upto: 50, candy: 20, stardust: 15000 },
]);

// Shadow Pokemon cost 20% more Candy and Stardust per power-up (frozen Game
// Master: shadowCandyMultiplier / shadowStardustMultiplier = 1.2), applied and
// rounded per half-level step to match in-game display.
const SHADOW_POWERUP_MULTIPLIER = 1.2;

// Total XL Candy + Stardust to power up from fromLevel to toLevel, both clamped
// to the 40-50 endgame band. Mirrors powerUpCost()'s half-level walk, but over
// XL_POWERUP_TIERS instead — kept as a separate function rather than folding
// into powerUpCost() so the Level-40 cap there (and its "XL not covered"
// callers) stays unchanged.
export function xlPowerUpCost(fromLevel = 40, toLevel = 50, shadow = false) {
  const from = Math.max(40, Math.min(50, Number(fromLevel) || 40));
  const to = Math.max(40, Math.min(50, Number(toLevel) || 50));
  let candy = 0;
  let stardust = 0;
  for (let halfLevel = Math.round(from * 2) + 1; halfLevel <= Math.round(to * 2); halfLevel++) {
    const level = halfLevel / 2;
    const tier = XL_POWERUP_TIERS.find((row) => level <= row.upto);
    if (!tier) continue;
    candy += shadow ? Math.round(tier.candy * SHADOW_POWERUP_MULTIPLIER) : tier.candy;
    stardust += shadow ? Math.round(tier.stardust * SHADOW_POWERUP_MULTIPLIER) : tier.stardust;
  }
  return { candy, stardust };
}


export function buildRaidPlan({
  targetFormId,
  observedCp,
  encounterLevel = "normal",
  ownedFormIds = [],
} = {}, data = {}) {
  const { forms, raids, tool, currentBosses } = unwrap(data);
  const target = (tool.targets ?? []).find((row) => row.bossFormId === targetFormId);
  if (!target || !forms[targetFormId]) throw new RangeError(`Unknown raid target form: ${targetFormId}`);

  const bossTypes = target.bossTypes ?? [forms[targetFormId].primary_type, forms[targetFormId].secondary_type].filter(Boolean);
  const weaknesses = ATTACK_TYPES
    .map((attackingType) => ({
      attackingType,
      effectiveness: Math.round(effectiveness(attackingType, bossTypes[0], bossTypes[1]) * 10000) / 10000,
    }))
    .filter((row) => row.effectiveness > 1)
    .sort((left, right) => (right.effectiveness - left.effectiveness)
      || left.attackingType.localeCompare(right.attackingType));
  const limit = Number.isInteger(tool.counterLimit) && tool.counterLimit > 0 ? tool.counterLimit : 12;
  const regularRows = raids.regular ?? [];
  const shadowRows = raids.shadow ?? [];
  const owned = new Set((ownedFormIds ?? []).filter((formId) => typeof formId === "string"));
  const [bandName, band] = encounterBand(target, encounterLevel);
  const OWNED_TEAM_SIZE = 6; // a raid lobby only fits 6 Pokémon
  const ownedCounters = counterLane([...regularRows, ...shadowRows], bossTypes, { limit: OWNED_TEAM_SIZE, owned });

  return {
    target,
    encounterLevel: bandName,
    encounterBand: band,
    hundoVerdict: hundoVerdict(observedCp, band, bandName === "normal" ? target.weatherBoosted : null),
    weatherBoostConditions: [...(target.weatherBoostConditions ?? [])],
    weaknesses,
    regularCounters: counterLane(regularRows, bossTypes, { limit }),
    shadowCounters: counterLane(shadowRows, bossTypes, { limit }),
    ownedCounters,
    beatability: beatability({ ownedCounters, formId: targetFormId, currentBosses, forms }),
    // Beginner mode: top 3 per relevant attacking type, drawn from every qualifying
    // counter (not the display-limited lanes above) so every boss weakness shows up.
    // dedupeAcrossTypes: false — a form ranked in multiple attacking-type lists
    // must survive under each type's own top-3, not just its single best type.
    beginnerRegularGroups: groupCountersByType(
      counterCandidates(regularRows, bossTypes, { dedupeAcrossTypes: false }), 3,
    ),
    beginnerShadowGroups: groupCountersByType(
      counterCandidates(shadowRows, bossTypes, { dedupeAcrossTypes: false }), 3,
    ),
    beginnerOwnedGroups: groupCountersByType(
      counterCandidates([...regularRows, ...shadowRows], bossTypes, { owned, dedupeAcrossTypes: false }), 3,
    ),
    caveat: tool.caveat ?? "Counter order is a quick practical guide; live battle conditions can change results.",
  };
}

