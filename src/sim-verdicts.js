// Answer-engine stage 2 for the raid-target page's counter rows: turns the
// existing battle sim (battle-sim.js) into per-row honest time estimates and
// a solo/duo/group verdict for the boss. No new damage math lives here — both
// functions below just choose WHICH owned Pokémon to simulate and compare the
// sim's timeToWinMs against a raid clock; simulateBattle/simulateParty do all
// the actual combat math.
import { simulateBattle, simulateParty } from "./battle-sim.js";
import { instanceLevel } from "./instances.js";

// Niantic's raid battle timer: 3 minutes for Tier 1/3, 5 minutes for Tier 5
// and Mega raids (in-game, widely documented). Shadow raids aren't broken out
// by sub-tier anywhere in this codebase's data, so — same call battle-sim.js's
// own RAID_TIER_LEVEL/RAID_TIER_HP already make for "Shadow" — this assumes
// Shadow matches the Tier 5/Mega clock.
const RAID_CLOCK_MS = Object.freeze({
  "Tier 1": 180_000, "Tier 3": 180_000, "Tier 5": 300_000, Mega: 300_000, Shadow: 300_000,
});

const SIM_CAVEAT = "Simulated, no dodging — a real raid clock and player skill can push actual results either way.";

function formatClock(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Same check party-optimizer.js's movesetMatches uses (not exported there) —
// an instance only counts as "running the row's optimal moveset" if its fast
// move matches exactly and its known charged moves include the row's optimal
// charged move.
function movesetMatches(instance, row) {
  return instance?.fastMove === row.optimalFastMove
    && (instance?.chargedMoves ?? []).includes(row.optimalChargedMove);
}

// Per-counter-row solo sim times for the raid-target page's counter list.
// Returns an array the same length and order as `counters`: a real
// {formId, timeToWinMs, faints, label} for every row the player owns with
// the row's optimal moveset, and null for everything else (unowned, wrong
// moveset, unresolvable level, or moveSettings not loaded yet) — the page
// keeps its existing DPS-order text for null rows rather than showing a
// fabricated time.
export function counterSimTimes({
  counters, boss, roster, forms, settings,
} = {}) {
  const rows = counters ?? [];
  if (!settings?.moveSettings) return rows.map(() => null);
  const instances = roster?.instances ?? [];
  return rows.map((row) => {
    const form = forms?.[row.formId];
    if (!form) return null;
    const owned = instances.filter((instance) => instance.formId === row.formId && movesetMatches(instance, row));
    if (!owned.length) return null;
    const instance = owned.reduce((best, candidate) => (candidate.cp > best.cp ? candidate : best));
    if (instanceLevel(form, instance) === null) return null;
    let result;
    try {
      result = simulateBattle({ attacker: { ...instance, form }, boss, settings });
    } catch {
      return null;
    }
    // No-win faints are the sim's relobby-cap artifact (one per capped
    // attempt), not a meaningful count — the label omits them.
    const faintLabel = `${result.faints} faint${result.faints === 1 ? "" : "s"}`;
    return {
      formId: row.formId,
      timeToWinMs: result.timeToWinMs,
      faints: result.faints,
      label: result.timeToWinMs === null
        ? "No solo win in sim — bring backup"
        : `~${formatClock(result.timeToWinMs)} solo pace · ${faintLabel}`,
    };
  });
}

// Solo/duo/group verdict for the boss, from the SAME best-six party the page
// already built (partyResult.party, in its existing score order — see
// party-optimizer.js's buildParty) rather than recomputing who to bring.
// Tries the top 1, top 2, then the full party against the boss, and reports
// the smallest group that beats it inside its tier's raid clock.
export function soloVerdict({ boss, settings, partyResult } = {}) {
  if (!settings?.moveSettings) {
    return { verdict: "unknown", line: "Needs the moveSettings data chunk to simulate — not loaded yet." };
  }
  const party = partyResult?.party ?? [];
  if (!party.length) {
    return { verdict: "unknown", line: "No roster party built for this boss yet — can't simulate a verdict." };
  }
  const clockMs = RAID_CLOCK_MS[boss?.tier];
  if (!clockMs) {
    return { verdict: "unknown", line: `Unknown raid tier "${boss?.tier}" — no raid clock to compare against.` };
  }
  // A trial that THROWS is a sim failure, not a loss — track it so the
  // final fallthrough can say "couldn't simulate" instead of mislabeling an
  // error as an honest timed-out defeat.
  let anySimulated = false;
  const trial = (count) => {
    const attackers = party.slice(0, count).map(({ instance, form }) => ({ ...instance, form }));
    if (!attackers.length) return null;
    try {
      const result = simulateParty(attackers, boss, settings);
      anySimulated = true;
      return result.timeToWinMs !== null && result.timeToWinMs <= clockMs ? result : null;
    } catch {
      return null;
    }
  };

  const solo = trial(1);
  if (solo) {
    return {
      verdict: "solo-likely",
      line: `Your best attacker solos this in ~${formatClock(solo.timeToWinMs)}, under the ${formatClock(clockMs)} clock. ${SIM_CAVEAT}`,
    };
  }
  const duo = party.length >= 2 ? trial(2) : null;
  if (duo) {
    return {
      verdict: "duo-likely",
      line: `Your top two attackers duo this in ~${formatClock(duo.timeToWinMs)}, under the ${formatClock(clockMs)} clock. ${SIM_CAVEAT}`,
    };
  }
  const group = trial(party.length);
  if (group) {
    return {
      verdict: "group",
      line: `Your full ${party.length}-Pokémon party clears this in ~${formatClock(group.timeToWinMs)} — bring a group. ${SIM_CAVEAT}`,
    };
  }
  if (!anySimulated) {
    return { verdict: "unknown", line: "Couldn't simulate this party against the boss — sim inputs didn't resolve." };
  }
  return {
    verdict: "group",
    line: `Even your full ${party.length}-Pokémon party doesn't clear the ${formatClock(clockMs)} clock in this sim — bring extra trainers. ${SIM_CAVEAT}`,
  };
}
