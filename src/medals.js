// Medals & levels (F1-F3, 2026-10-05) — the operator is level 74 with every
// type medal at platinum; levels 71-80 gate on platinum count plus four
// tasks each, and none of that fit in the app before.
//
// Sources:
// - Level XP and the 71-80 tasks: Leek Duck trainer-levels reference
//   (leekduck.com/references/trainer-levels), read 2026-10-05.
// - Platinum thresholds: community list (tagn.wordpress.com, 2026-07-27);
//   Bulbapedia/Fandom refused fetching. Each medal's target is editable
//   because the in-game medal screen is the real authority.
// Counts live on this device per profile; nothing here is fetched.

export const LEVEL_XP = Object.freeze({
  70: 85853000, 71: 93853000, 72: 102603000, 73: 112103000, 74: 122353000, 75: 133353000,
  76: 145353000, 77: 158353000, 78: 172353000, 79: 187353000, 80: 203353000,
});

export const LEVEL_TASKS = Object.freeze({
  71: ["Earn 15 platinum medals", "Power up Legendary or Mythical Pokémon 20 times", "Make 999 Nice Throws", "Catch 100 Pokémon in a single day"],
  72: ["Earn 20 platinum medals", "Follow a Route 7 days in a row", "Use 200 supereffective Charged Attacks", "Earn 1,000,000 Stardust"],
  73: ["Earn 25 platinum medals", "Purify 100 Shadow Pokémon", "Power up 3 Pokémon to their max CP", "Win 30 raids"],
  74: ["Earn 30 platinum medals", "Level up a Max Move 20 times", "Explore 200 km", "Complete 250 Field Research tasks"],
  75: ["Earn 34 platinum medals", "Hatch 75 Eggs", "Make 999 Great Throws", "Send 500 Gifts to friends"],
  76: ["Earn 38 platinum medals", "Defeat 100 Team GO Rocket Grunts", "Explore 300 km", "Catch 200 Pokémon in a single day"],
  77: ["Have 41 platinum medals", "Power up 7 Pokémon to their max CP", "Win 100 Max Battles", "Make 10 trades with Pokémon caught at least 300 km apart"],
  78: ["Have 44 platinum medals", "Earn 400 hearts with your buddy", "Explore 400 km", "Complete 500 Field Research tasks"],
  79: ["Have 47 platinum medals", "Defeat a Team GO Rocket Leader 30 times", "Hatch 100 Eggs", "Obtain 50 Lucky Pokémon in trades"],
  80: ["Earn 50 platinum medals", "Win 80 battles in the GO Battle League", "Make 999 Excellent Throws", "Win 80 raids"],
});

export const PLATINUM_FOR_LEVEL = Object.freeze({ 71: 15, 72: 20, 73: 25, 74: 30, 75: 34, 76: 38, 77: 41, 78: 44, 79: 47, 80: 50 });

// tier: how a platinum actually gets bought — cheap (hours-days), scheduled
// (event-driven weeks), passive (accrues from normal play), long (months of
// deliberate grind), never (not worth planning around).
const T = (name, counts, platinum, tier) => Object.freeze({ name, counts, platinum, tier });
export const MEDALS = Object.freeze([
  T("Cameraman", "snapshot encounters", 400, "cheap"),
  T("Idol", "best friends", 20, "cheap"),
  T("Hisui", "Hisui Pokédex", 7, "cheap"),
  T("Triathlete", "7-day streaks", 100, "cheap"),
  T("Vivillon Collector", "Vivillon patterns", 18, "long"),
  T("Unown", "Unown forms", 28, "long"),
  T("Kanto", "Kanto Pokédex", 151, "passive"),
  T("Johto", "Johto Pokédex", 100, "passive"),
  T("Hoenn", "Hoenn Pokédex", 135, "passive"),
  T("Sinnoh", "Sinnoh Pokédex", 107, "passive"),
  T("Unova", "Unova Pokédex", 156, "passive"),
  T("Kalos", "Kalos Pokédex", 72, "passive"),
  T("Alola", "Alola Pokédex", 86, "passive"),
  T("Galar", "Galar Pokédex", 89, "passive"),
  T("Paldea", "Paldea Pokédex", 103, "long"),
  T("Hero", "Rocket grunts defeated", 2000, "scheduled"),
  T("Purifier", "Shadows purified", 1000, "scheduled"),
  T("Ultra Hero", "Giovanni defeats", 50, "scheduled"),
  T("Successor", "Mega Evolutions", 1000, "scheduled"),
  T("Mega Evolution Guru", "species Mega Evolved", 46, "scheduled"),
  T("Scientist", "Pokémon evolved", 2000, "scheduled"),
  T("Breeder", "eggs hatched", 2500, "passive"),
  T("Pokémon Ranger", "Field Research tasks", 2500, "passive"),
  T("Great League Veteran", "Great League wins", 1000, "passive"),
  T("Ultra League Veteran", "Ultra League wins", 1000, "passive"),
  T("Master League Veteran", "Master League wins", 1000, "passive"),
  T("Champion", "raids won", 2000, "passive"),
  T("Battle Legend", "Legendary raids won", 2000, "passive"),
  T("Rising Star Duo", "raids won with a friend", 2000, "passive"),
  T("Raid Expert", "raids completed", 500, "passive"),
  T("Rising Star", "species defeated in raids", 150, "passive"),
  T("Gentleman", "trades", 1000, "long"),
  T("Best Buddy", "best buddies", 200, "long"),
  T("Expert Navigator", "Routes completed", 600, "long"),
  T("Life of the Party", "party challenges", 200, "long"),
  T("Picnicker", "catches from lures", 2500, "long"),
  T("Battle Girl", "gym battles won", 4000, "long"),
  T("Ace Trainer", "gym trainings", 2000, "long"),
  T("Sightseer", "unique PokéStops", 2000, "long"),
  T("Pikachu Fan", "Pikachu caught", 1000, "long"),
  T("Jumbo Pokémon Collector", "XXL caught", 500, "long"),
  T("Tiny Pokémon Collector", "XXS caught", 500, "long"),
  T("Fisher", "big Magikarp", 1000, "never"),
  T("Youngster", "tiny Rattata", 1000, "never"),
  T("Collector", "Pokémon caught", 50000, "never"),
  T("Backpacker", "PokéStops spun", 50000, "never"),
  T("Jogger", "km walked", 10000, "never"),
  T("Berry Master", "berries fed at gyms", 15000, "never"),
  T("Gym Leader", "gym defense hours", 15000, "never"),
  T("Pilot", "km between traded Pokémon", 10000000, "never"),
  T("Showcase Star", "Showcase wins", 100, "never"),
  T("Community Member", "Community check-ins", 100, "never"),
  T("Friend Finder", "referrals", 50, "never"),
]);

// The 18 type medals at 2,500 catches each, folded into one row: the operator
// has all of them, and listing 18 identical rows buried the decisions.
export const TYPE_MEDAL_COUNT = 18;
export const TYPE_MEDAL_PLATINUM = 2500;

export const TIER_ORDER = Object.freeze(["cheap", "scheduled", "passive", "long", "never"]);
export const TIER_LABEL = Object.freeze({
  cheap: "Hours to days", scheduled: "Event-driven", passive: "Accrues from normal play", long: "Months of deliberate grind", never: "Don't plan around",
});

const STORAGE_KEY = "pogo-medals";

export function loadMedalState(storage, profileId = "main") {
  try {
    const all = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? "{}");
    const mine = all?.[profileId] ?? {};
    return {
      counts: mine.counts && typeof mine.counts === "object" ? mine.counts : {},
      targets: mine.targets && typeof mine.targets === "object" ? mine.targets : {},
      typePlatinums: Number.isInteger(mine.typePlatinums) ? mine.typePlatinums : 0,
      tasks: mine.tasks && typeof mine.tasks === "object" ? mine.tasks : {},
      xp: Number.isFinite(mine.xp) ? mine.xp : null,
    };
  } catch {
    return { counts: {}, targets: {}, typePlatinums: 0, tasks: {}, xp: null };
  }
}

export function saveMedalState(storage, profileId, state) {
  try {
    const all = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? "{}") ?? {};
    all[profileId] = state;
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// One applied edit from the page: a medal count, a target override, the type
// medal tally, a task checkbox or total XP. Bad numbers are ignored, not saved.
export function applyMedalEdit(state, { kind, key, value }) {
  const n = Number(value);
  if (kind === "count" && Number.isFinite(n) && n >= 0) return { ...state, counts: { ...state.counts, [key]: Math.floor(n) } };
  if (kind === "target" && Number.isFinite(n) && n > 0) return { ...state, targets: { ...state.targets, [key]: Math.floor(n) } };
  if (kind === "types" && Number.isInteger(n) && n >= 0 && n <= TYPE_MEDAL_COUNT) return { ...state, typePlatinums: n };
  if (kind === "task") return { ...state, tasks: { ...state.tasks, [key]: Boolean(value) } };
  if (kind === "xp" && Number.isFinite(n) && n >= 0) return { ...state, xp: Math.floor(n) };
  return state;
}

export function medalRows(state) {
  return MEDALS.map((medal) => {
    const target = state.targets[medal.name] ?? medal.platinum;
    const count = state.counts[medal.name];
    const known = Number.isFinite(count);
    const done = known && count >= target;
    return { ...medal, target, count: known ? count : null, done, remaining: known ? Math.max(0, target - count) : null };
  });
}

export function platinumCount(state) {
  return medalRows(state).filter((row) => row.done).length + state.typePlatinums;
}

// Cheapest first: tier, then the share of the target still missing (an
// unknown count sorts after known ones in its tier).
export function nextPlatinums(state, limit = 8) {
  const share = (row) => (row.remaining === null ? 2 : row.remaining / row.target);
  return medalRows(state)
    .filter((row) => !row.done && row.tier !== "never")
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || share(a) - share(b))
    .slice(0, limit);
}

export function levelPlan(state, trainerLevel) {
  const platinums = platinumCount(state);
  const nextLevel = Number.isInteger(trainerLevel) && trainerLevel >= 70 && trainerLevel < 80 ? trainerLevel + 1 : null;
  return Object.keys(LEVEL_TASKS).map(Number).map((level) => ({
    level,
    xp: LEVEL_XP[level],
    platinumNeeded: PLATINUM_FOR_LEVEL[level],
    platinumShort: Math.max(0, PLATINUM_FOR_LEVEL[level] - platinums),
    tasks: LEVEL_TASKS[level].map((text, index) => ({
      key: `${level}:${index}`,
      text,
      // Task 0 is always the platinum gate: computed, never ticked by hand.
      done: index === 0 ? platinums >= PLATINUM_FOR_LEVEL[level] : Boolean(state.tasks[`${level}:${index}`]),
      auto: index === 0,
    })),
    reached: Number.isInteger(trainerLevel) && level <= trainerLevel,
    next: level === nextLevel,
  }));
}

// F3: XP math. Evolution is the controllable XP lever: 1,000 base, ×2 with a
// Lucky Egg, ×2 again during a double-evolution-XP event. The base value is
// the long-standing standard; events vary, so the event multiplier is a toggle.
export const EVOLVE_XP = 1000;

export function xpPlan(totalXp, trainerLevel, { doubleEvolveEvent = false } = {}) {
  if (!Number.isFinite(totalXp)) return null;
  const nextLevel = Number.isInteger(trainerLevel) && trainerLevel < 80 ? trainerLevel + 1 : null;
  const toNext = nextLevel && LEVEL_XP[nextLevel] ? Math.max(0, LEVEL_XP[nextLevel] - totalXp) : null;
  const to80 = Math.max(0, LEVEL_XP[80] - totalXp);
  const perEvolve = EVOLVE_XP * 2 * (doubleEvolveEvent ? 2 : 1);
  return {
    nextLevel, toNext, to80, perEvolve,
    evolvesToNext: toNext === null ? null : Math.ceil(toNext / perEvolve),
    // A Lucky Egg runs 30 minutes; ~60 evolves fit in one with a prepared batch.
    eggsToNext: toNext === null ? null : Math.ceil(toNext / (perEvolve * 60)),
  };
}
