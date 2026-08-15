// Deterministic raid battle simulation — closed-form cycle-average combat,
// not a tick-by-tick event loop, so results are exact and reproducible.
// Built entirely from math and data this app already has: the PvE per-hit
// damage formula (src/pogo_encyclopedia/dps.py move_damage, already ported
// client-side once as breakpoints.js's moveDamageAt — reused here rather
// than forked a third time), the CPM/stat curve (instances.js), and the type
// chart (type-chart.js). No new DPS table, CPM table, or type chart lives
// here — same discipline party-optimizer.js's header comment states.
//
// settings.moveSettings is the moveId -> {power, durationMs, energyDelta,
// type, kind} catalog assemble.py now ships in extras.json — see that
// module's _build_move_settings_catalog for what's guaranteed to resolve.
import { cpMultiplier, instanceLevel, maxHp } from "./instances.js";
import { boostedTypes } from "./raid-target.js";
import { effectivenessOf } from "./type-chart.js";

// Raid boss stats aren't in this repo's frozen Game Master data at all (no
// existing boss-stat table anywhere in this codebase). boss.stats lets a
// caller pass real numbers ({attack, defense, hp}) directly; boss.tier is a
// documented best-effort fallback for when only a tier label is known.
//
// Bulbapedia's "Raid Battle (GO)" Difficulty table (fetched 2026-08-15) gives
// each tier's CPM: Tier 1 0.5974, Tier 3 0.73, Tier 5/Mega 0.79. Those line
// up almost exactly with specific integer levels in this app's OWN CPM table
// (cpMultiplier(20)=0.5974, cpMultiplier(30)=0.7317, cpMultiplier(40)=0.7903)
// — so boss stats reuse that table via a tier->level map instead of a second
// hardcoded CPM constant. "Shadow" (Shadow Legendary raids, see
// raid-target.js's own tier-mapping comment) is assumed to match Tier 5;
// Bulbapedia says a Shadow raid matches "the corresponding standard tier"
// but not which one, so this is a labeled guess, not a sourced fact.
const RAID_TIER_LEVEL = Object.freeze({ "Tier 1": 20, "Tier 3": 30, "Tier 5": 40, Mega: 40, Shadow: 40 });
const RAID_TIER_HP = Object.freeze({ "Tier 1": 600, "Tier 3": 3600, "Tier 5": 15000, Mega: 9000, Shadow: 15000 });
// Bosses aren't leveled Pokémon with rolled IVs — Niantic doesn't publish
// boss IVs. This mirrors this app's OWN standardized-attacker convention
// (dps.py calculate_cycle_dps: `(base_attack + 15) * LEVEL_40_CPM`) rather
// than inventing a different assumption for the boss side of the same fight.
const BOSS_IV_ASSUMPTION = 15;

// ponytail: flat placeholder for the walk-to-gym/re-lobby-fill delay between
// a wipe and the next attempt. No source gives a real number (it depends on
// gym distance and how fast a lobby fills) — bump this if a better estimate
// shows up.
export const RELOBBY_MS = 90_000;

// Sane bound on relobby attempts a party can burn through before this sim
// gives up and reports "can't win" instead of looping — a party that can't
// dent this boss's HP even once in 50 tries realistically never will.
const MAX_RELOBBIES = 50;

function typesOf(form) {
  return [form?.primary_type, form?.secondary_type].filter(Boolean);
}

// The exact per-hit PvE damage formula (src/pogo_encyclopedia/dps.py
// move_damage / breakpoints.js moveDamageAt): floor(0.5 * power * attack /
// defense * stab * shadow * effectiveness * weather) + 1. Takes raw
// precomputed numbers rather than a form+ivs+level triple (unlike
// moveDamageAt) so the same function covers a raid boss's raw {attack,
// defense} too, not just a leveled roster instance's.
function rawDamage({ power, attack, defense, stab, shadow, effectiveness, weather }) {
  return Math.floor(0.5 * power * (attack / defense) * stab * shadow * effectiveness * weather) + 1;
}

function statValue(baseStat, iv, level) {
  return (baseStat + iv) * cpMultiplier(level);
}

// Resolve a boss to real {attack, defense, hp} numbers. Explicit boss.stats
// wins when given (the accurate path); boss.tier is the documented fallback.
function resolveBossStats(boss) {
  if (boss?.stats) {
    const { attack, defense, hp } = boss.stats;
    if ([attack, defense, hp].every((value) => Number.isFinite(value) && value > 0)) {
      return { attack, defense, hp, source: "explicit" };
    }
  }
  const level = RAID_TIER_LEVEL[boss?.tier];
  const hp = RAID_TIER_HP[boss?.tier];
  if (!boss?.form || !level || !hp) return null;
  return {
    attack: statValue(boss.form.base_attack, BOSS_IV_ASSUMPTION, level),
    defense: statValue(boss.form.base_defense, BOSS_IV_ASSUMPTION, level),
    hp,
    source: "tier",
  };
}

// The mean power/durationMs across every FAST move in the shipped catalog —
// a deterministic, data-derived stand-in for "a boss's fast move" when the
// real moveset isn't known. Not a real moveset: no STAB, no type
// effectiveness (both need a real move type), no charged-move bursts at all.
function averageFastMove(moveSettings) {
  const fastMoves = Object.values(moveSettings ?? {}).filter((entry) => entry.kind === "fast");
  if (!fastMoves.length) return null;
  const power = fastMoves.reduce((sum, entry) => sum + entry.power, 0) / fastMoves.length;
  const durationMs = fastMoves.reduce((sum, entry) => sum + entry.durationMs, 0) / fastMoves.length;
  return { power, durationMs };
}

// Cycle-average DPS for one side of a fight: repeated fast hits funding one
// charged hit per cycle, same technique dps.py's calculate_cycle_dps already
// uses for this app's standardized raid DPS numbers (a closed-form average,
// not a per-hit simulation — exact because the per-hit numbers never change
// mid-fight for a fixed attacker/defender/moveset pair). null when either
// move id doesn't resolve in moveSettings.
function cycleDps({
  fastMoveId, chargedMoveId, moveSettings, hitterForm, hitterAttack, defenderDefense, defenderTypes, weatherBoostedTypes,
}) {
  const fast = moveSettings[fastMoveId];
  const charged = moveSettings[chargedMoveId];
  if (!fast || !charged) return null;
  const hit = (move) => rawDamage({
    power: move.power,
    attack: hitterAttack,
    defense: defenderDefense,
    stab: typesOf(hitterForm).includes(move.type) ? 1.2 : 1.0,
    shadow: hitterForm?.shadow ? 1.2 : 1.0,
    effectiveness: effectivenessOf(move.type, defenderTypes),
    weather: weatherBoostedTypes?.includes(move.type) ? 1.2 : 1.0,
  });
  const fastDamage = hit(fast);
  const chargedDamage = hit(charged);
  const fastCount = Math.abs(charged.energyDelta) / fast.energyDelta;
  const cycleTimeS = fastCount * (fast.durationMs / 1000) + charged.durationMs / 1000;
  return (fastCount * fastDamage + chargedDamage) / cycleTimeS;
}

// Boss's DPS against one specific attacker's real defense/typing. Uses the
// boss's real moveset when known; otherwise the "average fast move"
// fallback (see averageFastMove), applied at neutral (1x) effectiveness with
// no STAB, since neither a real move type nor the boss's own typing enters a
// pure damage-magnitude average.
function bossDpsAgainstAttacker({ boss, bossStats, attackerForm, attackerDefense, moveSettings, assumptions }) {
  if (boss.moveset?.fastMove && boss.moveset?.chargedMove) {
    const dps = cycleDps({
      fastMoveId: boss.moveset.fastMove,
      chargedMoveId: boss.moveset.chargedMove,
      moveSettings,
      hitterForm: boss.form,
      hitterAttack: bossStats.attack,
      defenderDefense: attackerDefense,
      defenderTypes: typesOf(attackerForm),
    });
    if (dps !== null) return dps;
  }
  assumptions.add(
    "Boss moveset unknown (or unresolvable) — its damage output is estimated from the mean "
    + "power/duration of every fast move in this release's moveSettings, at neutral (1x) "
    + "effectiveness and no STAB. A real boss's actual moveset, and any charged-move bursts, "
    + "aren't modeled by this fallback.",
  );
  const average = averageFastMove(moveSettings);
  if (!average) return 0;
  const damage = rawDamage({
    power: average.power,
    attack: bossStats.attack,
    defense: attackerDefense,
    stab: 1.0,
    shadow: boss.form?.shadow ? 1.2 : 1.0,
    effectiveness: 1.0,
    weather: 1.0,
  });
  return damage / (average.durationMs / 1000);
}

// One attacker's full combat profile against a boss: its own cycle DPS
// (using the highest-damage charged move it knows — "spend on
// highest-damage charged": among the attacker's 1-2 known charged moves,
// always saves for and fires whichever deals more damage per cast, ties
// keeping the first-listed move; not a real mixed-charged-move or
// energy-efficiency optimal strategy), its max HP, and the boss's DPS
// against it.
function computeAttackerEntry({ attacker, boss, bossStats, settings, assumptions }) {
  const form = attacker.form;
  if (!form) throw new RangeError("attacker.form is required");
  const level = instanceLevel(form, attacker);
  if (level === null) {
    throw new RangeError(`attacker CP/IV combination has no valid level for ${form.form_id}`);
  }
  const moveSettings = settings?.moveSettings ?? {};
  // Weather boosts a move by the MOVE's own type, not the attacker's typing —
  // a Water charged move gets Rainy's 1.2x on a Fighting-type attacker too.
  const weatherBoostedTypes = settings?.weather ? boostedTypes(settings.weather) : [];
  const attack = statValue(form.base_attack, attacker.ivs.atk, level);
  const defense = statValue(form.base_defense, attacker.ivs.def, level);
  const bossTypes = typesOf(boss.form);

  const damageOf = (moveId) => {
    const move = moveSettings[moveId];
    if (!move) return -Infinity;
    return rawDamage({
      power: move.power,
      attack,
      defense: bossStats.defense,
      stab: typesOf(form).includes(move.type) ? 1.2 : 1.0,
      shadow: form.shadow ? 1.2 : 1.0,
      effectiveness: effectivenessOf(move.type, bossTypes),
      weather: weatherBoostedTypes.includes(move.type) ? 1.2 : 1.0,
    });
  };
  const chargedMoveId = [...attacker.chargedMoves].sort((a, b) => damageOf(b) - damageOf(a))[0];

  const attackerDps = cycleDps({
    fastMoveId: attacker.fastMove,
    chargedMoveId,
    moveSettings,
    hitterForm: form,
    hitterAttack: attack,
    defenderDefense: bossStats.defense,
    defenderTypes: bossTypes,
    weatherBoostedTypes,
  });
  if (attackerDps === null) {
    throw new RangeError(`attacker moveset does not resolve in moveSettings for ${form.form_id}`);
  }

  const bossDps = bossDpsAgainstAttacker({
    boss, bossStats, attackerForm: form, attackerDefense: defense, moveSettings, assumptions,
  });
  return { attackerDps, attackerHp: maxHp(form, attacker.ivs.sta, level), bossDps };
}

const BASE_ASSUMPTIONS = Object.freeze([
  "No dodging, party power, friendship bonus, or player skill modeled — cycle-average DPS only.",
  "No energy gained from taking damage (fast-move-only energy accounting).",
  "Attacker always saves for and fires its single highest-damage charged move; mixed-charged-move "
  + "or breakpoint-tuned strategies aren't modeled.",
  `Relobby cost is a flat ${RELOBBY_MS}ms placeholder, not a measured value — real walk-to-gym/`
  + "lobby-fill time varies.",
  "Weather boost (if settings.weather is set) applies to the attacker's own moves only; boss-move "
  + "weather boost isn't modeled.",
]);

function bossStatsAssumption(bossStats) {
  return bossStats.source === "tier"
    ? "Boss stats approximated from its raid tier via published raid-mechanics constants "
      + "(Bulbapedia \"Raid Battle (GO)\" CPM/HP-by-tier table) mapped onto this app's own "
      + "CPM-by-level table, with a flat +15 IV assumption (matching this app's own "
      + "standardized-attacker convention) — not the boss's real, unpublished IVs."
    : "Boss stats from the explicit boss.stats the caller supplied.";
}

function survivalMsFor(entry) {
  return entry.bossDps > 0 ? (entry.attackerHp / entry.bossDps) * 1000 : Infinity;
}

// Runs one full party's raid attempt against a boss's HP pool: attackers
// fight in order against the SAME running boss HP total (a fainted attacker
// is replaced by the next one immediately, same as real raids where the rest
// of a brought party keeps fighting without leaving the lobby); only a FULL
// party wipe costs a relobby, which restarts the encounter at full boss HP
// (a wipe ends that raid attempt in the real game — a fresh attempt starts
// the boss over, it doesn't resume a partially-damaged one).
export function simulateParty(attackers, boss, settings = {}) {
  if (!attackers?.length) throw new RangeError("simulateParty needs at least one attacker");
  const bossStats = resolveBossStats(boss);
  if (!bossStats) throw new RangeError("boss stats could not be resolved from boss.stats or boss.tier");

  const assumptions = new Set(BASE_ASSUMPTIONS);
  assumptions.add(bossStatsAssumption(bossStats));
  const entries = attackers.map((attacker) => computeAttackerEntry({
    attacker, boss, bossStats, settings, assumptions,
  }));
  const survivalMsPerAttacker = entries.map(survivalMsFor);

  let totalMs = 0;
  let faints = 0;
  let relobbies = 0;
  for (let attempt = 0; attempt < MAX_RELOBBIES; attempt += 1) {
    let bossHpRemaining = bossStats.hp;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const survivalMs = survivalMsPerAttacker[index];
      const msToFinish = entry.attackerDps > 0 ? (bossHpRemaining / entry.attackerDps) * 1000 : Infinity;
      if (msToFinish <= survivalMs) {
        return {
          timeToWinMs: totalMs + msToFinish,
          faints,
          relobbies,
          won: true,
          dps: entries.map((item) => item.attackerDps),
          survivalMs: survivalMsPerAttacker,
          assumptions: [...assumptions],
        };
      }
      bossHpRemaining -= entry.attackerDps * (survivalMs / 1000);
      totalMs += Number.isFinite(survivalMs) ? survivalMs : 0;
      faints += 1;
    }
    relobbies += 1;
    totalMs += RELOBBY_MS;
  }
  return {
    timeToWinMs: null,
    faints,
    relobbies,
    won: false,
    dps: entries.map((item) => item.attackerDps),
    survivalMs: survivalMsPerAttacker,
    assumptions: [
      ...assumptions,
      `This party could not defeat this boss within ${MAX_RELOBBIES} simulated relobbies.`,
    ],
  };
}

// Single-attacker convenience wrapper over simulateParty([attacker], ...) —
// the same relobby/faint accounting, for one Pokémon fighting alone.
export function simulateBattle({ attacker, boss, settings = {} }) {
  const result = simulateParty([attacker], boss, settings);
  return {
    timeToWinMs: result.timeToWinMs,
    faints: result.faints,
    dps: result.dps[0],
    survivalMs: result.survivalMs[0],
    assumptions: result.assumptions,
  };
}
