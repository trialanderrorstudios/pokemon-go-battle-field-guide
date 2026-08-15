// Buddy Planner — "which owned Pokemon gains the most from Best Buddy?"
// Best Buddy is a flat +1 power-up level (buddy.js's own doc comment: "+1
// power-up level, equivalent to two power-ups"). Composes existing machinery
// only, no forked math:
//   CPM ratio        -> instances.js's cpMultiplier/instanceLevel (never a
//                        new CPM table — same ratio powerup-planner.js's
//                        damageGainPercent uses, just currentLevel -> +1).
//   raid relevance    -> raid-target.js's effectiveness()/ATTACK_TYPES to
//                        find CURRENT bosses' weakness types, then the same
//                        regular+shadow best-ranked-row scan powerup-planner
//                        and party-optimizer already use.
//   pvp relevance      -> pvp-team.js's rankIvSpread(..., { bestBuddy }),
//                        the exact level-51-vs-50 logic that already exists
//                        for Best Buddy in PvP ranking. Comparing bestBuddy
//                        true vs false tells us whether the extra level is
//                        actually reachable under a league's CP cap.
//   already-buddied    -> instance.buddyLevel === "best" (storage.js's own
//                        enum), excluded honestly rather than scored zero.
import { ATTACK_TYPES, effectiveness } from "./raid-target.js";
import { cpMultiplier, instanceLevel } from "./instances.js";
import { LEAGUE_CP_CAP, rankIvSpread } from "./pvp-team.js";

// Best Buddy's own ceiling (instances.js's MAX_LEVEL is 51 for non-mega
// builds — pvp-team.js's RANK_MAX_LEVEL for capped leagues agrees). A build
// already at 51 has no headroom left to gain from Best Buddy.
const BEST_BUDDY_MAX_LEVEL = 51;

// Only capped leagues can gain from the extra level (pvp-team.js's own
// RANK_MAX_LEVEL: Master stays at 50 either way, no CP cap to squeeze under).
const PVP_LEAGUES = Object.freeze(
  Object.keys(LEAGUE_CP_CAP).filter((league) => LEAGUE_CP_CAP[league] !== null),
);

function levelUpGainPercent(currentLevel, nextLevel) {
  const ratio = cpMultiplier(nextLevel) / cpMultiplier(currentLevel);
  return Math.round((ratio - 1) * 1000) / 10;
}

function bossWeaknessTypes(bossTypes) {
  return ATTACK_TYPES.filter((type) => effectiveness(type, bossTypes[0], bossTypes[1]) > 1);
}

// Union of every CURRENT boss's weakness types — the attacking types a
// Best-Buddy'd Pokemon would actually matter for right now (same pattern
// powerup-planner.js's relevantAttackingTypes uses for "next power-up").
function currentRelevantTypes(currentBosses, forms) {
  const types = new Set();
  for (const boss of currentBosses?.bosses ?? []) {
    const form = forms?.[boss.formId];
    const bossTypes = boss.bossTypes ?? [form?.primary_type, form?.secondary_type].filter(Boolean);
    for (const type of bossWeaknessTypes(bossTypes)) types.add(type);
  }
  return types;
}

// Best (lowest-rank) ranked raid-attacker row for this formId among the
// relevant types, regular or shadow — same scan powerup-planner's
// bestRelevantRow and party-optimizer's bestRowForBoss use.
function bestRelevantRow(formId, raidRows, relevantTypes) {
  let best = null;
  for (const lane of ["regular", "shadow"]) {
    for (const row of raidRows?.[lane] ?? []) {
      if (row.status !== "ranked" || row.formId !== formId || !relevantTypes.has(row.attackingType)) continue;
      if (!best || row.rank < best.rank) best = row;
    }
  }
  return best;
}

function raidGain(instance, level, formId, raidRows, relevantTypes) {
  if (level >= BEST_BUDDY_MAX_LEVEL) return null;
  const row = bestRelevantRow(formId, raidRows, relevantTypes);
  if (!row) return null;
  const percent = levelUpGainPercent(level, level + 1);
  return {
    type: "raid",
    percent,
    label: `~${percent}% more raid damage — Best Buddy's +1 power-up level takes it from Level ${level} to `
      + `${level + 1} (currently your #${row.rank} ranked ${row.attackingType} attacker).`,
  };
}

// Whether Best Buddy's level-51 build actually clears more of this league's
// CP cap than the level-50 ceiling does — reuses pvp-team.js's own
// bestBuddy-gated search rather than re-deriving "near the cap" from CP.
function pvpGainForLeague(form, instance, league) {
  const withBuddy = rankIvSpread(form, instance.ivs, league, { bestBuddy: true });
  const without = rankIvSpread(form, instance.ivs, league, { bestBuddy: false });
  if (!withBuddy || !without || withBuddy.level <= without.level) return null;
  const percent = Math.round((withBuddy.statProduct / without.statProduct - 1) * 1000) / 10;
  return {
    type: "pvp",
    league,
    percent,
    label: `~${percent}% higher stat product in ${league[0].toUpperCase()}${league.slice(1)} League — Best Buddy `
      + `unlocks a Level ${withBuddy.level} build under the cap instead of capping out at Level ${without.level}.`,
  };
}

function pvpGains(form, instance, pvpRows) {
  if (!instance.ivs) return [];
  const gains = [];
  for (const league of PVP_LEAGUES) {
    if (!(pvpRows?.[league] ?? []).some((row) => row.formId === instance.formId)) continue; // species has pvp rows
    const gain = pvpGainForLeague(form, instance, league);
    if (gain) gains.push(gain);
  }
  return gains;
}

export function buddyPlan({
  roster = null, forms = {}, raidRows = null, pvpRows = null, currentBosses = null,
} = {}) {
  const instances = roster?.instances ?? [];
  if (!instances.length) return { candidates: [], alreadyBest: [] };

  const relevantTypes = currentRelevantTypes(currentBosses, forms);
  const candidates = [];
  const alreadyBest = [];

  for (const instance of instances) {
    const form = forms?.[instance.formId];
    if (!form) continue;
    const name = form.name ?? instance.formId;

    if (instance.buddyLevel === "best") {
      alreadyBest.push({ instanceId: instance.id, formId: instance.formId, name });
      continue;
    }

    const level = instanceLevel(form, instance);
    if (level === null) continue; // no derivable level, nothing to honestly estimate

    const gains = [];
    const raid = raidGain(instance, level, instance.formId, raidRows, relevantTypes);
    if (raid) gains.push(raid);
    gains.push(...pvpGains(form, instance, pvpRows));
    if (!gains.length) continue;

    candidates.push({
      instanceId: instance.id,
      formId: instance.formId,
      name,
      why: gains.map((gain) => gain.label).join(" "),
      gains,
    });
  }

  candidates.sort((left, right) => {
    const scoreDiff = right.gains.reduce((sum, gain) => sum + gain.percent, 0)
      - left.gains.reduce((sum, gain) => sum + gain.percent, 0);
    return scoreDiff || left.formId.localeCompare(right.formId);
  });

  return { candidates, alreadyBest };
}
