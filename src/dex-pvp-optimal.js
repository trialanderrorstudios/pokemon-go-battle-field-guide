// Dex-entry PvP optimal-build helper: for a species/league pair, computes the
// rank-1 (max stat-product) IV spread live, rather than reading a served
// row.rankOne — so a dex entry that fell outside the shipped top-150 league
// rankings (row === null in views/dex.js's pvpLeagueCardHtml) can still show
// an honest optimal build instead of nothing. Reuses pvp-team.js's own CPM
// and stat-product math (statProduct, bestLevelUnderCap, RANK_MAX_LEVEL) —
// no CPM formula or pool-scan primitive is re-typed here, only the outer
// 16x16x16 argmax reduction, which pvp-team.js's rankIvSpread doesn't expose
// (it returns where a GIVEN spread ranks, never which spread won).
import { calculateCp } from "./instances.js";
import { LEAGUE_CP_CAP, RANK_MAX_LEVEL, bestLevelUnderCap, statProduct } from "./pvp-team.js";

// Timed on a real high-stat form (base 251/181/155): ~1.4ms per capped
// league scan steady-state (~3.6ms cold/unwarmed), ~2.8ms for all three
// leagues combined — well under the ~15ms/league threshold that would
// justify memoizing. No memo cache here; add one (module-level Map, key
// `${formId}|${league}`, capped ~200 entries) if a slower form or call site
// ever measures past that bar.

// Exhaustive rank-1 search for a capped league (Great/Ultra): each of the
// 4096 IV spreads gets its own best level under the cap (bestLevelUnderCap),
// then the spread with the highest stat product wins. Structurally the same
// pool scan as rankIvSpread's inner loop, just keeping the argmax instead of
// a "how many spreads beat this one" count.
function findOptimalCapped(form, league) {
  const cap = LEAGUE_CP_CAP[league];
  const maxLevel = RANK_MAX_LEVEL[league];
  let best = null;
  for (let atk = 0; atk < 16; atk += 1) {
    for (let def = 0; def < 16; def += 1) {
      for (let sta = 0; sta < 16; sta += 1) {
        const ivs = { atk, def, sta };
        const level = bestLevelUnderCap(form, ivs, cap, maxLevel);
        if (level === null) continue; // no legal power-up level under the cap for these IVs
        const product = statProduct(form, ivs, level);
        if (!best || product > best.statProduct) best = { ivs, level, statProduct: product };
      }
    }
  }
  return best;
}

// Master League has no CP cap, so there's nothing to search: the hundo at
// the league's max level (RANK_MAX_LEVEL.master, 50 — see pvp-team.js's own
// comment on why Master stays at 50, not a Best-Buddy 51) is always best.
function optimalMaster(form) {
  const level = RANK_MAX_LEVEL.master;
  const ivs = { atk: 15, def: 15, sta: 15 };
  return { ivs, level, statProduct: statProduct(form, ivs, level) };
}

// Species/league optimal IV spread + honest note. Never fabricates a build
// for a masterfile-gap stand-in (name/dex/types only, no real base stats).
export function dexPvpOptimal(form, league) {
  if (!form || form.source === "masterfile-gap"
    || !form.base_attack || !form.base_defense || !form.base_stamina) {
    return { optimal: null, note: "No battle data yet for this form." };
  }

  if (league === "master") {
    const best = optimalMaster(form);
    return {
      optimal: { ivs: best.ivs, level: best.level, cp: calculateCp(form, best.ivs, best.level), statProduct: best.statProduct },
      note: "Master League has no CP cap — hundo at level 50/51 is simply best.",
    };
  }

  const best = findOptimalCapped(form, league);
  if (!best) return { optimal: null, note: "No battle data yet for this form." };
  const bestBuddyRequired = best.level > 50;
  return {
    optimal: { ivs: best.ivs, level: best.level, cp: calculateCp(form, best.ivs, best.level), statProduct: best.statProduct },
    note: bestBuddyRequired
      ? "Best Buddy (level 51) required to reach this optimal build."
      : "Reachable at the normal level 50 power-up ceiling — no Best Buddy needed.",
  };
}

// "Yours"-style rank line for the served top-50 row. pvpLeagueCardHtml
// already renders "Rank N · tier" whenever row exists (views/dex.js), so
// this returns "" there rather than saying the same thing twice — the view
// stays the single source for that line. It only has something to say when
// row is absent, i.e. the species didn't make the shipped rankings.
export function dexPvpRankLine(form, league, row) {
  if (row) return "";
  return "Outside the current top 50";
}
