// Type-matchup flashcard drill. Question generation reuses the existing
// attack-type effectiveness table in raid-target.js (already shared by
// app.js/home.js/raids.js) — no second type chart is authored here.
import { ATTACK_TYPES, effectiveness } from "./raid-target.js";
import { moveCountsFor } from "./pvp-moves.js";
import { displayMoveName } from "./views/move-sheet.js";

// Flavor verb for the "why" line (e.g. "Water douses Fire"). Presentation
// copy only, not a second effectiveness table — the actual matchup data
// still comes from raid-target.js's effectiveness().
const TYPE_VERBS = Object.freeze({
  Bug: "swarms", Dark: "unnerves", Dragon: "overwhelms", Electric: "shocks",
  Fairy: "enchants", Fighting: "pummels", Fire: "scorches", Flying: "batters",
  Ghost: "haunts", Grass: "overgrows", Ground: "buries", Ice: "freezes",
  Normal: "tackles", Poison: "poisons", Psychic: "confounds", Rock: "crushes",
  Steel: "shreds", Water: "douses",
});


export function weaknessesOf(defendingType) {
  return ATTACK_TYPES.filter((attackingType) => effectiveness(attackingType, defendingType) > 1);
}


function shuffled(list, rng) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}


export function generateQuestion(promptType, { mode = "forward", rng = Math.random } = {}) {
  const weak = weaknessesOf(promptType);
  const correctType = weak[Math.floor(rng() * weak.length)];
  const distractorPool = ATTACK_TYPES.filter((type) => type !== promptType && !weak.includes(type));
  const choices = shuffled([correctType, ...shuffled(distractorPool, rng).slice(0, 3)], rng);
  const prompt = mode === "reverse"
    ? `What is ${promptType} weak to?`
    : `What's super effective against ${promptType}?`;
  return {
    promptType,
    mode,
    prompt,
    choices,
    correctType,
    why: `${correctType} ${TYPE_VERBS[correctType] ?? "beats"} ${promptType}`,
  };
}


// ponytail: 18 attack types > 10-question rounds, so a plain shuffle-and-slice
// gives distinct prompt types every round with no repeat-avoidance bookkeeping.
export function buildRound({ mode = "forward", count = 10, rng = Math.random, movePool = [] } = {}) {
  if (mode === "moves") {
    return shuffled(movePool, rng)
      .slice(0, Math.min(count, movePool.length))
      .map((entry) => generateMoveCountQuestion(entry, { rng }));
  }
  return shuffled(ATTACK_TYPES, rng)
    .slice(0, Math.min(count, ATTACK_TYPES.length))
    .map((promptType) => generateQuestion(promptType, { mode, rng }));
}


// --- Move-count drill: "how many fast moves to reach this charged move" ---
// (docs/move-counts-spike.md, closed by src/pogo_encyclopedia/pvp_moves.py +
// methodology.pvpMoveCatalog). Every question is a real fast/charged pair
// from this release's own PvP rankings, deduped so the same combo (shared
// by multiple ranked Pokémon, e.g. many Steel types running Metal Claw) only
// shows up once per pool.
export function buildMoveCountPool(pvp = {}, pvpMoveCatalog = {}) {
  const seen = new Set();
  const pool = [];
  for (const rows of Object.values(pvp ?? {})) {
    for (const row of rows ?? []) {
      for (const { chargedMoveId, count } of moveCountsFor(row.fastMove, row.chargedMoves, pvpMoveCatalog)) {
        const key = `${row.fastMove}|${chargedMoveId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pool.push({ fastMoveId: row.fastMove, chargedMoveId, count });
      }
    }
  }
  return pool;
}


// Wrong-answer counts near the real one, so the choices read as plausible
// guesses rather than obviously-wrong outliers.
function countDistractors(correct, rng) {
  const distractors = new Set();
  let guard = 0;
  while (distractors.size < 3 && guard < 50) {
    guard += 1;
    const offset = Math.floor(rng() * 5) + 1;
    const candidate = rng() < 0.5 ? correct - offset : correct + offset;
    if (candidate >= 1 && candidate !== correct) distractors.add(candidate);
  }
  return [...distractors];
}


export function generateMoveCountQuestion(entry, { rng = Math.random } = {}) {
  const fastName = displayMoveName(entry.fastMoveId);
  const chargedName = displayMoveName(entry.chargedMoveId);
  const correctType = String(entry.count);
  const choices = shuffled([correctType, ...countDistractors(entry.count, rng).map(String)], rng);
  return {
    promptType: `${fastName} -> ${chargedName}`,
    mode: "moves",
    prompt: `How many ${fastName} to reach ${chargedName}?`,
    choices,
    correctType,
    why: `${entry.count} ${fastName}${entry.count === 1 ? "" : "s"} reaches ${chargedName}'s energy cost`,
  };
}


const STATS_KEY = "pogo-drill-stats";

function safeNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}


export function loadDrillStats(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(STATS_KEY) ?? "null");
    const currentStreak = safeNonNegativeInt(parsed?.currentStreak);
    const bestStreak = Math.max(safeNonNegativeInt(parsed?.bestStreak), currentStreak);
    return { currentStreak, bestStreak };
  } catch {
    return { currentStreak: 0, bestStreak: 0 };
  }
}


// Direct write for restoring stats from a backup (bypasses the streak-update
// logic in recordDrillAnswer, which only ever increments/resets by one).
export function saveDrillStats(storage, stats) {
  const next = {
    currentStreak: safeNonNegativeInt(stats?.currentStreak),
    bestStreak: Math.max(safeNonNegativeInt(stats?.bestStreak), safeNonNegativeInt(stats?.currentStreak)),
  };
  try {
    storage?.setItem?.(STATS_KEY, JSON.stringify(next));
  } catch {
    // Storage can legitimately be unavailable — see recordDrillAnswer.
  }
  return next;
}


export function recordDrillAnswer(storage, stats, correct) {
  const currentStreak = correct ? stats.currentStreak + 1 : 0;
  const bestStreak = Math.max(stats.bestStreak, currentStreak);
  const next = { currentStreak, bestStreak };
  try {
    storage?.setItem?.(STATS_KEY, JSON.stringify(next));
  } catch {
    // Storage can legitimately be unavailable (private browsing, quota) —
    // the round still works, it just won't remember the streak next time.
  }
  return next;
}


export function createDrillState({ storage = null, mode = "forward", rng = Math.random, movePool = [] } = {}) {
  return {
    mode,
    questions: buildRound({ mode, rng, movePool }),
    index: 0,
    selectedType: null,
    missedTypes: [],
    stats: loadDrillStats(storage),
  };
}


export function answerDrillQuestion(drill, chosenType, storage) {
  if (drill.selectedType !== null || drill.index >= drill.questions.length) return drill;
  const question = drill.questions[drill.index];
  const correct = chosenType === question.correctType;
  return {
    ...drill,
    selectedType: chosenType,
    missedTypes: correct ? drill.missedTypes : [...drill.missedTypes, question.promptType],
    stats: recordDrillAnswer(storage, drill.stats, correct),
  };
}


export function advanceDrillQuestion(drill) {
  if (drill.selectedType === null) return drill;
  return { ...drill, index: drill.index + 1, selectedType: null };
}


export function restartDrillRound(drill, { rng = Math.random, movePool = [] } = {}) {
  return {
    ...drill, questions: buildRound({ mode: drill.mode, rng, movePool }), index: 0, selectedType: null, missedTypes: [],
  };
}


const DRILL_MODES = ["forward", "reverse", "moves"];

export function setDrillMode(drill, mode, { rng = Math.random, movePool = [] } = {}) {
  if (!DRILL_MODES.includes(mode)) return drill;
  return {
    ...drill, mode, questions: buildRound({ mode, rng, movePool }), index: 0, selectedType: null, missedTypes: [],
  };
}
