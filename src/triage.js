// Pure roster triage. This module only joins verdicts from the existing PvP,
// raid, coach, cost, level, and Shadow-advisor engines with frozen release
// membership data. Rendering and persistence belong to their existing layers.
import {
  PVP_GOOD_QUALITY_THRESHOLD,
  detailedEligibility,
  qualityHint,
} from "./pvp-team.js";
import { levelCapNote, powerUpCost, xlPowerUpCost } from "./raid-target.js";
import { powerUpNext } from "./coach.js";
import { instanceLevel } from "./instances.js";
import { raidSlots, shadowAdvisorVerdict } from "./views/raids.js";


export const TRIAGE_BUCKETS = Object.freeze(["KEEP", "INVEST", "PVP", "CANDY", "UNRATED"]);
const PVP_LEAGUES = Object.freeze(["great", "ultra"]);
const SENTIMENTAL_TAGS = new Set(["costume", "event", "party-hat"]);
const SENTIMENTAL_FORM_MARKER = /(?:^|[-_])(?:costume|event|party[-_]?hat)(?=$|[-_])/i;

const DEFAULT_ENGINES = Object.freeze({
  pvpEligibility: detailedEligibility,
  pvpQuality: qualityHint,
  raidSlots,
  shadowAdvisor: shadowAdvisorVerdict,
  coachPowerUps: powerUpNext,
  instanceLevel,
  powerUpCost,
  xlPowerUpCost,
  levelCapNote,
});


function formsOf(data) {
  return data?.forms ?? data?.core?.forms ?? {};
}


function ownedEntries(roster) {
  const instances = Array.isArray(roster?.instances) ? roster.instances : [];
  const detailedForms = new Set(instances.map((entry) => entry.formId));
  const publicIds = new Set(instances.map((entry) => entry.id));
  let nextInternalKey = 0;
  const entries = instances.map((entry) => ({
    internalKey: nextInternalKey++,
    id: entry.id,
    formId: entry.formId,
    instance: entry,
    assumedStats: false,
    assumption: null,
  }));
  for (const formId of new Set(roster?.ownedFormIds ?? [])) {
    if (detailedForms.has(formId)) continue;
    const baseId = `star:${formId}`;
    let id = baseId;
    let suffix = 2;
    while (publicIds.has(id)) id = `${baseId}:${suffix++}`;
    publicIds.add(id);
    entries.push({
      internalKey: nextInternalKey++,
      id,
      formId,
      instance: null,
      assumedStats: true,
      assumption: "assumed-stats",
    });
  }
  return entries;
}


function pvpRows(data) {
  const result = new Map();
  for (const league of PVP_LEAGUES) {
    for (const row of data?.pvp?.[league] ?? []) {
      result.set(`${league}:${row.formId}`, row);
    }
  }
  return result;
}


function displayedRaidRelevance(data, slotsForType) {
  const bestByForm = new Map();
  for (const lane of ["regular", "shadow"]) {
    const rows = data?.raids?.[lane] ?? [];
    const attackingTypes = new Set(rows.map((row) => row?.attackingType).filter(Boolean));
    for (const attackingType of attackingTypes) {
      for (const row of slotsForType(rows, attackingType)) {
        if (!row?.formId || row.status !== "ranked") continue;
        const candidate = { ...row, lane };
        const current = bestByForm.get(row.formId);
        if (!current || Number(candidate.rank) < Number(current.rank)) {
          bestByForm.set(row.formId, candidate);
        }
      }
    }
  }
  return bestByForm;
}


function sentimental(form) {
  const tags = (form?.tags ?? []).map((tag) => String(tag).toLowerCase());
  return tags.some((tag) => SENTIMENTAL_TAGS.has(tag))
    || [form?.form_id, form?.form].filter(Boolean).some((value) => SENTIMENTAL_FORM_MARKER.test(value));
}


function bestOwnedBySpecies(entries) {
  const best = new Map();
  for (const entry of entries) {
    if (!Number.isInteger(entry.form?.dex)) continue;
    const current = best.get(entry.form.dex);
    if (!current) {
      best.set(entry.form.dex, entry);
      continue;
    }
    const cpDifference = Number(entry.instance?.cp ?? -1) - Number(current.instance?.cp ?? -1);
    const qualityDifference = Number(entry.statQuality ?? -1) - Number(current.statQuality ?? -1);
    if (cpDifference > 0 || (cpDifference === 0 && qualityDifference > 0)) best.set(entry.form.dex, entry);
  }
  return best;
}


function pvpSignal(entry, rows, engines) {
  if (!entry.instance) return { signal: null, statQuality: null, byLeague: {} };
  let signal = null;
  let statQuality = null;
  const byLeague = {};
  for (const league of PVP_LEAGUES) {
    const rankedRow = rows.get(`${league}:${entry.formId}`);
    if (!rankedRow) continue;
    const quality = engines.pvpQuality(entry.form, entry.instance, rankedRow);
    const eligibility = engines.pvpEligibility(entry.instance, league);
    byLeague[league] = { rankedRow, eligibility, quality };
    if (Number.isFinite(quality?.ratio) && (statQuality === null || quality.ratio > statQuality)) {
      statQuality = quality.ratio;
    }
    if (!eligibility?.eligible || !Number.isFinite(quality?.ratio)
      || quality.ratio < PVP_GOOD_QUALITY_THRESHOLD) continue;
    if (!signal || quality.ratio > signal.quality.ratio) {
      signal = { league, rankedRow, eligibility, quality };
    }
  }
  return { signal, statQuality, byLeague };
}


function pvpBecause(signal) {
  const league = signal.league === "great" ? "Great League" : "Ultra League";
  const quality = signal.quality.tier === "excellent" ? "excellent" : "good";
  return `${league} ready — this copy has ${quality} staying power for that league.`;
}


function keepSignal(entry, context) {
  const { raidByForm, relevantSpecies, bestBySpecies, data, engines } = context;
  const raid = raidByForm.get(entry.formId) ?? null;
  if (entry.form?.shadow) {
    const advice = engines.shadowAdvisor(raid?.investmentTier, entry.formId, data?.pvp ?? {});
    if (advice?.verdict === "Keep Shadow") {
      return { kind: "shadow", because: "The Shadow advisor says to keep this Shadow Pokémon." };
    }
  }
  if (raid) {
    return {
      kind: "raid",
      because: `Top ${raid.attackingType} raid attacker at #${raid.rank} in the displayed guide.`,
    };
  }
  if (relevantSpecies.has(entry.form?.dex)
    && bestBySpecies.get(entry.form.dex)?.internalKey === entry.internalKey) {
    return {
      kind: "best-species",
      because: `Your best ${entry.form.name ?? "copy"} — keep one from this useful species.`,
    };
  }
  return null;
}


function powerUpFor(entry, engines, trainerLevel) {
  if (!entry.instance) {
    return {
      status: "unrated",
      reason: "Add this copy's CP and appraisal stats to see an exact power-up cost.",
    };
  }
  const fromLevel = engines.instanceLevel(entry.form, entry.instance);
  if (!Number.isFinite(fromLevel)) {
    return {
      status: "unrated",
      reason: "This copy's saved CP and appraisal stats do not resolve to a known level.",
    };
  }
  const regularFromLevel = Math.min(fromLevel, 40);
  const xlFromLevel = Math.max(fromLevel, 40);
  const toLevel = Math.max(fromLevel, 50);
  const regular = engines.powerUpCost(regularFromLevel, 40);
  const xl = engines.xlPowerUpCost(xlFromLevel, toLevel, entry.form.shadow === true);
  // Reachable-cap gate: toLevel is always the Level 50 endgame ceiling
  // (Math.max above), regardless of trainer level, so this plan can
  // recommend a target the player can't actually reach yet. Keep the row
  // (never hide/rewrite the numbers) and attach a plain "needs trainer level
  // N" note instead — requiresXl covers both the level+10 cap and the
  // Level-31 XL-spend unlock in one check, since this plan always crosses
  // Level 40 into XL territory.
  const capNote = engines.levelCapNote(toLevel, trainerLevel, { requiresXl: true });
  return {
    fromLevel,
    toLevel,
    assumption: false,
    regular: { fromLevel: regularFromLevel, toLevel: 40, ...regular },
    xl: { fromLevel: xlFromLevel, toLevel, ...xl },
    candy: regular.candy,
    xlCandy: xl.candy,
    stardust: regular.stardust + xl.stardust,
    capNote,
  };
}


function dominates(candidate, entry) {
  if (!candidate.instance || !entry.instance) return false;
  const cpAtLeastAsGood = candidate.instance.cp >= entry.instance.cp;
  if (!cpAtLeastAsGood) return false;

  let comparedLeague = false;
  let leagueQualityIsBetter = false;
  for (const [league, current] of Object.entries(entry.pvpByLeague ?? {})) {
    if (!current.eligibility?.eligible) continue;
    comparedLeague = true;
    const stronger = candidate.pvpByLeague?.[league];
    if (!stronger?.eligibility?.eligible
      || !Number.isFinite(current.quality?.ratio)
      || !Number.isFinite(stronger.quality?.ratio)
      || stronger.quality.ratio < current.quality.ratio) return false;
    if (stronger.quality.ratio > current.quality.ratio) leagueQualityIsBetter = true;
  }
  return comparedLeague && (candidate.instance.cp > entry.instance.cp || leagueQualityIsBetter);
}


function leagueQuality(entry, league) {
  const profile = entry.pvpByLeague?.[league];
  return profile?.eligibility?.eligible && Number.isFinite(profile.quality?.ratio)
    ? profile.quality.ratio
    : null;
}


function dominanceMask(entry) {
  let mask = 0;
  for (let index = 0; index < PVP_LEAGUES.length; index += 1) {
    const profile = entry.pvpByLeague?.[PVP_LEAGUES[index]];
    if (!profile?.eligibility?.eligible) continue;
    if (!Number.isFinite(profile.quality?.ratio)) return 0;
    mask |= 1 << index;
  }
  return mask;
}


function supportsMask(entry, mask) {
  return (!(mask & 1) || leagueQuality(entry, "great") !== null)
    && (!(mask & 2) || leagueQuality(entry, "ultra") !== null);
}


function betterCandidate(left, right, mask) {
  if (!left) return right;
  if (!right) return left;
  const leagues = mask === 1 ? ["great"] : mask === 2 ? ["ultra"] : ["ultra", "great"];
  for (const league of leagues) {
    const difference = leagueQuality(left, league) - leagueQuality(right, league);
    if (difference !== 0) return difference > 0 ? left : right;
  }
  const cpDifference = left.instance.cp - right.instance.cp;
  if (cpDifference !== 0) return cpDifference > 0 ? left : right;
  return left.internalKey < right.internalKey ? left : right;
}


function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + ((high - low) >> 1);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}


function precomputeMaskDominators(targets, candidates, mask, output) {
  const usableCandidates = candidates
    .filter((entry) => supportsMask(entry, mask))
    .sort((left, right) => right.instance.cp - left.instance.cp);
  if (!usableCandidates.length || !targets.length) return;
  const orderedTargets = [...targets].sort((left, right) => right.instance.cp - left.instance.cp);
  let candidateIndex = 0;

  if (mask !== 3) {
    let best = null;
    const league = mask === 1 ? "great" : "ultra";
    for (const target of orderedTargets) {
      while (candidateIndex < usableCandidates.length
        && usableCandidates[candidateIndex].instance.cp >= target.instance.cp) {
        best = betterCandidate(best, usableCandidates[candidateIndex++], mask);
      }
      if (best && leagueQuality(best, league) >= leagueQuality(target, league)
        && dominates(best, target)) output.set(target.internalKey, best);
    }
    return;
  }

  const greatQualities = [...new Set(usableCandidates.map((entry) => leagueQuality(entry, "great")))]
    .sort((left, right) => left - right);
  const tree = Array(greatQualities.length + 1).fill(null);
  const update = (entry) => {
    const position = lowerBound(greatQualities, leagueQuality(entry, "great"));
    for (let index = greatQualities.length - position; index < tree.length; index += index & -index) {
      tree[index] = betterCandidate(tree[index], entry, mask);
    }
  };
  const query = (minimumGreatQuality) => {
    let best = null;
    const position = lowerBound(greatQualities, minimumGreatQuality);
    for (let index = greatQualities.length - position; index > 0; index -= index & -index) {
      best = betterCandidate(best, tree[index], mask);
    }
    return best;
  };
  for (const target of orderedTargets) {
    while (candidateIndex < usableCandidates.length
      && usableCandidates[candidateIndex].instance.cp >= target.instance.cp) {
      update(usableCandidates[candidateIndex++]);
    }
    const best = query(leagueQuality(target, "great"));
    if (best && leagueQuality(best, "ultra") >= leagueQuality(target, "ultra")
      && dominates(best, target)) output.set(target.internalKey, best);
  }
}


function precomputeDominators(entries, protectedKeys) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.instance) continue;
    if (!groups.has(entry.formId)) groups.set(entry.formId, []);
    groups.get(entry.formId).push(entry);
  }
  const output = new Map();
  for (const group of groups.values()) {
    const candidates = group.filter((entry) => protectedKeys.has(entry.internalKey));
    if (!candidates.length) continue;
    const targetsByMask = new Map([[1, []], [2, []], [3, []]]);
    for (const entry of group) {
      if (protectedKeys.has(entry.internalKey)) continue;
      const mask = dominanceMask(entry);
      if (mask) targetsByMask.get(mask).push(entry);
    }
    for (const [mask, targets] of targetsByMask) {
      precomputeMaskDominators(targets, candidates, mask, output);
    }
  }
  return output;
}


function betterInvestmentCopy(left, right) {
  if (!left) return right;
  const cpDifference = Number(right.instance?.cp ?? -1) - Number(left.instance?.cp ?? -1);
  if (cpDifference !== 0) return cpDifference > 0 ? right : left;
  const qualityDifference = Number(right.statQuality ?? -1) - Number(left.statQuality ?? -1);
  if (qualityDifference !== 0) return qualityDifference > 0 ? right : left;
  return right.internalKey < left.internalKey ? right : left;
}


function investmentSelections(entries, keepByKey, budgetPicks, coachRows) {
  const keepByForm = new Map();
  for (const entry of entries) {
    if (entry.pvp || !keepByKey.get(entry.internalKey)) continue;
    if (!keepByForm.has(entry.formId)) keepByForm.set(entry.formId, []);
    keepByForm.get(entry.formId).push(entry);
  }
  const coachByForm = new Map((coachRows ?? []).map((row) => [row.formId, row]));
  const formIds = new Set([...budgetPicks, ...coachByForm.keys()]);
  const selected = new Map();
  for (const formId of formIds) {
    const candidates = keepByForm.get(formId) ?? [];
    if (!candidates.length) continue;
    const coach = coachByForm.get(formId);
    let chosen = coach?.instanceId
      ? candidates.find((entry) => entry.instance?.id === coach.instanceId) ?? null
      : null;
    if (!chosen && (!coach?.instanceId || budgetPicks.has(formId))) {
      chosen = candidates.reduce(betterInvestmentCopy, null);
    }
    if (!chosen) continue;
    selected.set(chosen.internalKey, {
      reason: budgetPicks.has(formId)
        ? "This exact form is a budget power-up pick."
        : "Weekly Coach picked this exact copy to power up next.",
    });
  }
  return selected;
}


function result(bucket, entry, because, extra = {}) {
  const invest = Boolean(extra.invest);
  const { internalKey: _internalKey, ...publicEntry } = entry;
  return {
    ...publicEntry,
    bucket,
    buckets: invest ? [bucket, "INVEST"] : [bucket],
    because,
    invest,
    powerUp: null,
    strongerCopyId: null,
    ...extra,
  };
}


export function triageRoster({
  data = {}, roster = {}, engines: injectedEngines = {}, trainerLevel = null,
} = {}) {
  const engines = { ...DEFAULT_ENGINES, ...injectedEngines };
  const forms = formsOf(data);
  const rows = pvpRows(data);
  const raidByForm = displayedRaidRelevance(data, engines.raidSlots);
  const entries = ownedEntries(roster).map((entry) => {
    const form = forms[entry.formId] ?? null;
    const evaluated = {
      ...entry,
      form,
      name: form?.name ?? entry.formId,
      pvp: null,
      pvpByLeague: {},
      statQuality: null,
    };
    if (!form) return evaluated;
    const pvp = pvpSignal(evaluated, rows, engines);
    return {
      ...evaluated,
      pvp: pvp.signal,
      pvpByLeague: pvp.byLeague,
      statQuality: pvp.statQuality,
    };
  });

  const relevantFormIds = new Set([
    ...raidByForm.keys(),
    ...PVP_LEAGUES.flatMap((league) => (data?.pvp?.[league] ?? []).map((row) => row.formId)),
  ]);
  const relevantSpecies = new Set([...relevantFormIds]
    .map((formId) => forms[formId]?.dex)
    .filter(Number.isInteger));
  const bestBySpecies = bestOwnedBySpecies(entries);
  const keepContext = { raidByForm, relevantSpecies, bestBySpecies, data, engines };
  const keepByKey = new Map(entries.map((entry) => [
    entry.internalKey,
    entry.form ? keepSignal(entry, keepContext) : null,
  ]));
  const protectedKeys = new Set(entries
    .filter((entry) => entry.pvp || keepByKey.get(entry.internalKey))
    .map((entry) => entry.internalKey));
  const dominators = precomputeDominators(entries, protectedKeys);

  const detailed = entries.filter((entry) => Number.isFinite(entry.instance?.cp));
  const highestCp = detailed.length ? Math.max(...detailed.map((entry) => entry.instance.cp)) : null;
  const highestEntries = detailed.filter((entry) => entry.instance.cp === highestCp);
  const highestCpKey = highestEntries.length === 1 ? highestEntries[0].internalKey : null;
  const budgetPicks = new Set((data?.budgets?.raid ?? []).map((row) => row.formId));
  const investments = investmentSelections(
    entries,
    keepByKey,
    budgetPicks,
    engines.coachPowerUps(data, roster),
  );

  const verdicts = entries.map((entry) => {
    if (!entry.form) {
      return result("UNRATED", entry, "This exact form is not in the current release data, so the guide cannot judge it.");
    }
    if (entry.pvp) return result("PVP", entry, pvpBecause(entry.pvp));

    const keep = keepByKey.get(entry.internalKey);
    if (keep) {
      const investment = investments.get(entry.internalKey);
      return result("KEEP", entry, keep.because, investment ? {
        invest: true,
        investReason: investment.reason,
        powerUp: powerUpFor(entry, engines, trainerLevel),
      } : {});
    }

    if (sentimental(entry.form)) {
      return result("UNRATED", entry, "Costume or event Pokémon can be sentimental — keeping it is your call.");
    }
    if (entry.internalKey === highestCpKey) {
      return result("UNRATED", entry, "This is your single highest-CP Pokémon, so it is not marked for transfer.");
    }

    const speciesRelevant = relevantSpecies.has(entry.form.dex);
    if (!speciesRelevant) {
      return result(
        "CANDY",
        entry,
        "This form is not in the raid or Great/Ultra League guides, so it is transfer candy if you do not want it for collecting.",
      );
    }

    const stronger = dominators.get(entry.internalKey);
    if (stronger) {
      return result(
        "CANDY",
        entry,
        `You keep the CP ${stronger.instance.cp} stronger copy — this weaker copy is transfer candy.`,
        { strongerCopyId: stronger.id },
      );
    }

    return result(
      "UNRATED",
      entry,
      entry.form.shadow
        ? "No stronger copy of this exact Shadow form is safely proven, so it is not marked for transfer."
        : "No stronger same-form copy safely beats both its CP and league quality, so it is not marked for transfer.",
    );
  });

  const counts = Object.fromEntries(TRIAGE_BUCKETS.map((bucket) => [bucket, 0]));
  for (const verdict of verdicts) {
    counts[verdict.bucket] += 1;
    if (verdict.invest) counts.INVEST += 1;
  }
  return { entries: verdicts, counts };
}
