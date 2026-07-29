// "What should I actually do next?" — the question the app exists to answer
// and previously answered only by making you read four pages and do the
// arithmetic yourself.
//
// Coach already lists power-up candidates, but it ranks them off a static
// future-proof list: it does not know which bosses are up THIS week, and it
// does not know whether you can afford the power-up. So it recommends the
// same Pokemon whether or not it helps you today and whether or not you have
// the dust.
//
// This ranks by payoff against the CURRENT rotation, divided by what it
// costs, with anything you cannot afford pushed below anything you can. Every
// number here is already computed elsewhere; the contribution is joining them.
import { bestInstanceForForm, instanceLevel } from "./instances.js";
import { buildRaidPlan, powerUpCost } from "./raid-target.js";

const TARGET_LEVEL = 40;
// A fresh catch is level 20 in this app's model (see coach.js FRESH_CATCH_LEVEL);
// if we cannot derive a real level from the roster we say so rather than
// quietly costing the power-up from a guess.
const ASSUMED_LEVEL = 20;
// Not every boss is worth the same investment. A Tier 1 Bulbasaur and a Tier 5
// legendary both count as "a boss you can now counter", and weighting them
// equally recommends whatever happens to counter the most trash.
const TIER_WEIGHT = Object.freeze({
  "Tier 5": 4, Mega: 4, Shadow: 3, "Tier 3": 2, "Tier 1": 1,
});

// Counters come from buildRaidPlan, the same path the Raid Target page uses.
// Deriving them separately here would be a second opinion on the app's own
// question, and the two would drift.
function countersByBoss(data, ownedFormIds, weather) {
  const byCounter = new Map();
  for (const boss of data?.currentBosses?.bosses ?? []) {
    let plan;
    try {
      plan = buildRaidPlan({ targetFormId: boss.formId, ownedFormIds, weather }, data);
    } catch {
      continue; // boss not in the raid-target tool; nothing to counter it with
    }
    const bossName = plan.target?.boss ?? boss.formId;
    const weight = TIER_WEIGHT[boss.tier] ?? 1;
    for (const counter of plan.regularCounters ?? []) {
      if (!counter?.formId) continue;
      if (!byCounter.has(counter.formId)) byCounter.set(counter.formId, new Map());
      byCounter.get(counter.formId).set(bossName, { tier: boss.tier, weight });
    }
  }
  return byCounter;
}

/**
 * Rank the next power-up worth making, given what is in rotation right now
 * and what the trainer can actually pay for.
 */
export function nextActions({
  data = {},
  roster = {},
  stardust = null,
  candyInventory = {},
  weather = "None",
  limit = 3,
} = {}) {
  const forms = data?.core?.forms ?? data?.forms ?? {};
  const owned = new Set(roster?.ownedFormIds ?? []);
  const byCounter = countersByBoss(data, roster?.ownedFormIds ?? [], weather);
  if (!byCounter.size) return [];

  const rows = [];
  for (const [formId, bossMap] of byCounter) {
    const bosses = [...bossMap.keys()];
    const weight = [...bossMap.values()].reduce((sum, entry) => sum + entry.weight, 0);
    const headline = [...bossMap.entries()].sort((a, b) => b[1].weight - a[1].weight);
    if (!owned.has(formId)) continue;
    const form = forms[formId];
    if (!form) continue;
    const instance = bestInstanceForForm(roster?.instances ?? [], formId);
    const derived = instance ? instanceLevel(form, instance) : null;
    const fromLevel = derived ?? ASSUMED_LEVEL;
    if (fromLevel >= TARGET_LEVEL) continue; // already there; nothing to do
    const cost = powerUpCost(fromLevel, TARGET_LEVEL);
    if (!cost.candy && !cost.stardust) continue;

    const haveCandy = Number(candyInventory?.[formId] ?? NaN);
    const haveDust = Number(stardust ?? NaN);
    // Unknown inventory is NOT treated as "cannot afford" — a trainer who has
    // not typed their dust in should still see the recommendation, just
    // without an affordability claim attached to it.
    const dustKnown = Number.isFinite(haveDust);
    const candyKnown = Number.isFinite(haveCandy);
    const affordable = (!dustKnown || haveDust >= cost.stardust)
      && (!candyKnown || haveCandy >= cost.candy);

    rows.push({
      formId,
      name: form.name ?? formId,
      instanceId: instance?.id ?? null,
      bosses: headline.map(([name]) => name),
      topBoss: headline[0]?.[0] ?? null,
      topTier: headline[0]?.[1]?.tier ?? null,
      fromLevel,
      levelAssumed: derived === null,
      candy: cost.candy,
      stardust: cost.stardust,
      affordable,
      affordabilityKnown: dustKnown || candyKnown,
      shortStardust: dustKnown ? Math.max(0, cost.stardust - haveDust) : null,
      shortCandy: candyKnown ? Math.max(0, cost.candy - haveCandy) : null,
      // Payoff per 1,000 dust: how much of the current rotation this unlocks
      // for what it costs. Bosses covered alone would always favour the
      // expensive legendary; cost alone would always favour the cheap one.
      value: weight / Math.max(1, cost.stardust / 1000),
    });
  }

  rows.sort((left, right) => (
    Number(right.affordable) - Number(left.affordable)
    || right.value - left.value
    || left.stardust - right.stardust
    || left.name.localeCompare(right.name)
  ));
  return rows.slice(0, limit).map((row) => ({ ...row, whyRanked: explain(row) }));
}

function explain(row) {
  const rest = row.bosses.length - 1;
  // Boss names already carry their own form suffix ("Salamence (Mega)"), so
  // appending the tier blindly produced "Salamence (Mega) (Mega)".
  const tier = row.topTier && !String(row.topBoss).includes(row.topTier)
    ? ` (${row.topTier})` : "";
  const payoff = row.topBoss
    ? `Counters ${row.topBoss}${tier}${rest > 0 ? ` and ${rest} more in rotation` : ""}`
    : `Counters ${row.bosses.join(" and ")} in the current rotation`;
  const price = `${row.stardust.toLocaleString()} dust and ${row.candy} Candy from level ${row.fromLevel}`;
  const level = row.levelAssumed
    ? " (level assumed — import the roster or set its CP for a real figure)"
    : "";
  if (row.affordabilityKnown && !row.affordable) {
    const missing = [
      row.shortStardust ? `${row.shortStardust.toLocaleString()} dust` : null,
      row.shortCandy ? `${row.shortCandy} Candy` : null,
    ].filter(Boolean).join(" and ");
    return `${payoff}. Costs ${price}${level} — ${missing} short.`;
  }
  return `${payoff}. Costs ${price}${level}.`;
}
