// XL Advisor — "is pushing this instance past level 40 worth the XL candy?"
// Composes existing machinery only, no forked math:
//   level             -> instances.js's instanceLevel/cpMultiplier (same CPM
//                         table every other planner uses, never re-typed).
//   raid relevance    -> mirrors buddy-planner.js's currentRelevantTypes /
//                         bestRelevantRow helpers (not exported there, so
//                         duplicated here in miniature rather than imported —
//                         same ATTACK_TYPES/effectiveness() raid-target.js
//                         source both scans).
//   pvp relevance     -> pvp-team.js's own pvpRows[league][].rankOne.level
//                         when a row carries it (real rank-1 IV/level data);
//                         otherwise this honestly adds no pvp gain rather
//                         than guessing one.
//   already-maxed     -> level >= 50 estimate, excluded honestly.
import { ATTACK_TYPES, effectiveness, xlPowerUpCost } from "./raid-target.js";
import { cpMultiplier, instanceLevel } from "./instances.js";

// Level 40 is where regular candy/dust power-ups stop and XL candy becomes
// required — this advisor's whole scope is instances already at that wall.
// Below it, powerup-planner.js already covers "what to power up next" with
// regular candy; this file doesn't re-answer that question.
const XL_BOUNDARY_LEVEL = 40;
const XL_MAX_LEVEL = 50;

function bossWeaknessTypes(bossTypes) {
  return ATTACK_TYPES.filter((type) => effectiveness(type, bossTypes[0], bossTypes[1]) > 1);
}

// Mirrors buddy-planner.js's currentRelevantTypes (not exported there).
function currentRelevantTypes(currentBosses, forms) {
  const types = new Set();
  for (const boss of currentBosses?.bosses ?? []) {
    const form = forms?.[boss.formId];
    const bossTypes = boss.bossTypes ?? [form?.primary_type, form?.secondary_type].filter(Boolean);
    for (const type of bossWeaknessTypes(bossTypes)) types.add(type);
  }
  return types;
}

// Mirrors buddy-planner.js's bestRelevantRow (not exported there).
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

function raidGain(level, formId, raidRows, relevantTypes) {
  const row = bestRelevantRow(formId, raidRows, relevantTypes);
  if (!row) return null;
  const ratio = cpMultiplier(XL_MAX_LEVEL) / cpMultiplier(level);
  const percent = Math.round((ratio - 1) * 1000) / 10;
  return {
    type: "raid",
    percent,
    label: `~${percent}% more raid damage, estimated from the CPM(50)/CPM(${level}) ratio — currently your `
      + `#${row.rank} ranked ${row.attackingType} attacker.`,
  };
}

// Great/Ultra: XL only matters when the league's OWN published rank-1 build
// needs a level over 40 (a low-Attack IV spread) — real rank-1 level data
// from pvpRows, never guessed. Master: no CP cap, so Level 50 is simply more
// stats for any species with a ranked Master build (rank-by-presence).
function pvpNote(formId, pvpRows) {
  for (const league of ["great", "ultra"]) {
    const row = (pvpRows?.[league] ?? []).find((entry) => entry.formId === formId);
    if (row?.rankOne?.level > XL_BOUNDARY_LEVEL) {
      const label = league === "great" ? "Great" : "Ultra";
      return {
        type: "pvp",
        league,
        label: `${label} League's own rank-1 build sits at Level ${row.rankOne.level} — a low-Attack IV spread `
          + `that needs XL candy to reach.`,
      };
    }
  }
  if ((pvpRows?.master ?? []).some((entry) => entry.formId === formId)) {
    return {
      type: "pvp",
      league: "master",
      label: "Master League has no CP cap, so Level 50 is simply more stats — this species has a ranked Master build.",
    };
  }
  return null;
}

// Exact remaining cost from this instance's actual level to 50, via
// raid-target.js's own half-level XL cost table — not a flat 40->50 total.
function xlCost(level, form) {
  const { candy, stardust } = xlPowerUpCost(level, XL_MAX_LEVEL, form?.shadow === true);
  return {
    xlCandy: candy,
    dust: stardust,
    label: `Remaining cost, Level ${level} to 50`,
  };
}

export function xlPlan({
  roster = null, forms = {}, raidRows = null, pvpRows = null, currentBosses = null,
} = {}) {
  const instances = roster?.instances ?? [];
  if (!instances.length) return { candidates: [], alreadyMaxed: [] };

  const relevantTypes = currentRelevantTypes(currentBosses, forms);
  const candidates = [];
  const alreadyMaxed = [];

  for (const instance of instances) {
    const form = forms?.[instance.formId];
    if (!form) continue;
    const name = form.name ?? instance.formId;

    const level = instanceLevel(form, instance);
    if (level === null) continue; // no derivable level, nothing to honestly estimate

    if (level >= XL_MAX_LEVEL) {
      alreadyMaxed.push({ instanceId: instance.id, formId: instance.formId, name, level });
      continue;
    }
    if (level < XL_BOUNDARY_LEVEL) continue; // not yet at the XL wall — out of scope for this advisor

    const gains = [];
    const raid = raidGain(level, instance.formId, raidRows, relevantTypes);
    if (raid) gains.push(raid);
    const pvp = pvpNote(instance.formId, pvpRows);
    if (pvp) gains.push(pvp);
    if (!gains.length) continue;

    candidates.push({
      instanceId: instance.id,
      formId: instance.formId,
      name,
      level,
      why: gains.map((gain) => gain.label).join(" "),
      gains,
      cost: xlCost(level, form),
    });
  }

  candidates.sort((left, right) => {
    const scoreOf = (candidate) => candidate.gains.reduce((sum, gain) => sum + (gain.percent ?? 0), 0);
    return scoreOf(right) - scoreOf(left) || left.formId.localeCompare(right.formId);
  });

  return { candidates, alreadyMaxed };
}
