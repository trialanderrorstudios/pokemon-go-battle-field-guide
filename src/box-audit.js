// Box audit (B, 2026-10-05) — the catch verdict run across every logged mon,
// layered on Triage rather than replacing it. Triage stays the conservative
// transfer gate (it protects costumes, your highest-CP mon, and any shadow
// without a proven better copy); this adds what Triage can't say:
//   - a per-mon verdict (build / raid / gym / purify / transfer)
//   - a "purify for the medal" list Triage has no bucket for
//   - every mon Triage would send to CANDY that the verdict says to keep —
//     shown as a warning, because that is the expensive kind of mistake.
// Only logged instances with all three IVs are judged; star-only entries have
// nothing to rank.
import { catchVerdict } from "./catch-verdict.js";
import { buildSearchQuery, toSearchName } from "./game-search.js";
import { buildCost } from "./raid-target.js";

const KEEPER_CALLS = new Set(["build", "raid", "gym"]);
const BATCH_SIZE = 40;

function judgeable(entry) {
  const ivs = entry?.instance?.ivs;
  return Boolean(ivs) && [ivs.atk, ivs.def, ivs.sta].every((v) => Number.isInteger(v) && v >= 0 && v <= 15);
}

export function verdictForEntry(entry, ctx) {
  if (!judgeable(entry)) return null;
  const moves = Array.isArray(entry.instance.chargedMoves) ? entry.instance.chargedMoves.filter(Boolean) : [];
  return catchVerdict({
    ...ctx,
    formId: entry.formId,
    ivs: entry.instance.ivs,
    cp: Number.isFinite(entry.instance.cp) ? entry.instance.cp : null,
    chargedMoves: moves.length ? moves : null,
    // Max Battle fit (2026-10-06): canDynamax/canGigantamax are logged
    // instance flags (round 15/17) — real signal here, unlike a fresh scan.
    canDynamax: Boolean(entry.instance.canDynamax),
    canGigantamax: Boolean(entry.instance.canGigantamax),
  });
}

// Summary from per-entry verdicts. Purify names keep the in-game search exact:
// toSearchName strips "(Shadow)", so each chunk is ANDed with `shadow` — GO's
// OR binds tighter than AND, so "zubat,vibrava&shadow" means
// (zubat OR vibrava) AND shadow.
export function summarizeAudit(results) {
  const counts = { build: 0, situational: 0, raid: 0, gym: 0, purify: 0, transfer: 0 };
  const purifyNames = [];
  const disagreements = [];
  for (const { entry, verdict } of results) {
    if (!verdict) continue;
    counts[verdict.call] = (counts[verdict.call] ?? 0) + 1;
    if (verdict.call === "purify") purifyNames.push(verdict.name);
    if (entry.bucket === "CANDY" && KEEPER_CALLS.has(verdict.call)) {
      disagreements.push({ id: entry.id, name: verdict.name, cp: entry.instance?.cp ?? null, call: verdict.call, headline: verdict.headline });
    }
  }
  const purify = buildSearchQuery(purifyNames);
  return {
    ...bucketSearches(results),
    resourcePlan: resourcePlan(results),
    judged: results.filter((r) => r.verdict).length,
    counts,
    disagreements,
    purifyChunks: purify.chunks.map((chunk) => `${chunk}&shadow`),
    purifyExcluded: purify.excludedCount,
  };
}

// Per-verdict in-game search strings (B2). A name search selects EVERY copy
// of a species, so the keeper lists (build/raid/gym) over-select harmlessly —
// they're for favouriting or tagging — but a transfer list must never catch a
// keeper: only species+shadow groups where every judged copy came back
// "transfer" are listed, and favourites, shinies, luckies and 4-stars are
// excluded in the string itself.
const KEEP_BUCKETS = ["build", "raid", "gym"];
export const TRANSFER_GUARD = "&!favorite&!shiny&!lucky&!4*";

function bucketSearches(results) {
  const keepNames = Object.fromEntries(KEEP_BUCKETS.map((call) => [call, []]));
  const groups = new Map();
  for (const { entry, verdict } of results) {
    if (!verdict) continue;
    if (keepNames[verdict.call]) keepNames[verdict.call].push(verdict.name);
    const shadow = String(entry.formId).endsWith("-shadow");
    const key = `${toSearchName(verdict.name) ?? verdict.name}|${shadow}`;
    if (!groups.has(key)) groups.set(key, { name: verdict.name, shadow, calls: new Set() });
    groups.get(key).calls.add(verdict.call);
  }
  const transferOnly = [...groups.values()].filter((group) => group.calls.size === 1 && group.calls.has("transfer"));
  const transferChunks = [false, true].flatMap((shadow) => buildSearchQuery(
    transferOnly.filter((group) => group.shadow === shadow).map((group) => group.name),
  ).chunks.map((chunk) => `${chunk}&${shadow ? "" : "!"}shadow${TRANSFER_GUARD}`));
  return {
    keepChunks: Object.fromEntries(KEEP_BUCKETS.map((call) => [call, buildSearchQuery(keepNames[call]).chunks])),
    transferChunks,
  };
}

// H2: what the whole build queue costs. Every "build" verdict with a known
// current level and a target level (best.fitsAt) is priced from its level to
// that target with the app's own power-up tables; XL above 40; shadows pay
// the per-step Game Master surcharge via buildCost() (shared with
// catch-verdict.js's what-if block). Evolution candy is not priced: it
// depends on the family, which the verdict doesn't carry.
export function resourcePlan(results) {
  const builds = [];
  for (const { entry, verdict } of results) {
    if (verdict?.call !== "build" || !verdict.best?.fitsAt || !Number.isFinite(verdict.level)) continue;
    const from = verdict.level;
    const to = verdict.best.fitsAt.level;
    if (!(to > from)) continue;
    const cost = buildCost(from, to, verdict.shadow);
    const owned = new Set([entry.instance?.fastMove, ...(entry.instance?.chargedMoves ?? [])].filter(Boolean));
    builds.push({
      id: entry.id, name: verdict.name, league: verdict.best.league, from, to,
      stardust: cost.stardust + cost.xlStardust,
      candy: cost.candy,
      xlCandy: cost.xlCandy,
      eliteTms: (verdict.best.eliteMoves ?? []).filter((move) => !owned.has(move)).length,
      evolves: verdict.best.name !== verdict.name,
      shadow: verdict.shadow,
    });
  }
  const sum = (key) => builds.reduce((total, build) => total + build[key], 0);
  return {
    count: builds.length,
    stardust: sum("stardust"), candy: sum("candy"), xlCandy: sum("xlCandy"), eliteTms: sum("eliteTms"),
    evolveCount: builds.filter((build) => build.evolves).length,
    anyShadow: builds.some((build) => build.shadow),
    priciest: [...builds].sort((a, b) => b.stardust - a.stardust).slice(0, 8),
  };
}

// Whole-box run in batches so a 2,700-mon roster never freezes the page.
// `yieldFn` hands control back between batches (setTimeout in the app, a
// no-op in tests); onProgress gets {done, total} after each batch.
export async function auditBox(entries, ctx, { onProgress = () => {}, yieldFn = () => Promise.resolve() } = {}) {
  // Grouped by species so each species' rank tables are built once and reused
  // by every copy before the bounded table cache evicts them.
  const pool = (entries ?? []).filter(judgeable).sort((a, b) => a.formId.localeCompare(b.formId));
  const results = [];
  for (let i = 0; i < pool.length; i += BATCH_SIZE) {
    for (const entry of pool.slice(i, i + BATCH_SIZE)) results.push({ entry, verdict: verdictForEntry(entry, ctx) });
    onProgress({ done: Math.min(i + BATCH_SIZE, pool.length), total: pool.length });
    await yieldFn();
  }
  return summarizeAudit(results);
}
