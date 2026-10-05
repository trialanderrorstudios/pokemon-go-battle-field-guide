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
import { buildSearchQuery } from "./game-search.js";

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
    judged: results.filter((r) => r.verdict).length,
    counts,
    disagreements,
    purifyChunks: purify.chunks.map((chunk) => `${chunk}&shadow`),
    purifyExcluded: purify.excludedCount,
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
