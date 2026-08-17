// "Before you evolve" checklist for a pre-evolution's dex entry. Composes
// existing machinery only:
//   candy cost per step -> form.evolves_to edges already carry candyCost
//                           directly (evolution.py's one-step edge list —
//                           the same field views/dex.js's evolutionAcquisition
//                           and instances.js's evolutionForecast both read;
//                           no second candy source to fall back to, so an
//                           edge missing it honestly reports candyCost: null)
//   best owned copy       -> highest IV sum, CP tiebreak — same "best owned"
//                           shape instances.js's bestInstanceForForm picks by
//                           (CP only); this checklist cares which copy is the
//                           best EVOLVE candidate, so IV sum leads
//                           (evolution never rerolls IVs — instances.js's own
//                           evolutionForecast doc comment)
//   Community Day hold    -> evolution-holds.js's holdForFormId, called here
//                           so callers just pass the holds array through
//   ranked-appearance note -> same regular+shadow raidRows / per-league
//                           pvpRows scan shape compare.js's bestRaidRow/
//                           bestPvpRow use, with the same loaded vs
//                           no-ranked-appearances honesty split
import { escapeHtml } from "./views/home.js";
import { holdForFormId } from "./evolution-holds.js";

const LEAGUE_LABELS = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });

function ivSum(ivs) {
  return ivs.atk + ivs.def + ivs.sta;
}

// Highest IV sum wins (evolving preserves IVs/CP exactly, so IV sum is what
// actually differs after evolving); CP breaks a tie the same direction
// bestInstanceForForm already picks.
function bestOwnedCopy(owned) {
  return owned.reduce((best, candidate) => {
    const bestSum = ivSum(best.ivs);
    const candidateSum = ivSum(candidate.ivs);
    if (candidateSum > bestSum) return candidate;
    if (candidateSum === bestSum && candidate.cp > best.cp) return candidate;
    return best;
  });
}

function raidNoteFor(formId, raidRows) {
  const rows = [...(raidRows.regular ?? []), ...(raidRows.shadow ?? [])]
    .filter((row) => row.formId === formId && row.status === "ranked");
  if (!rows.length) return null;
  const best = rows.reduce((top, row) => (row.rank < top.rank ? row : top));
  return `raid rank #${best.rank} (${best.attackingType})`;
}

function pvpNoteFor(formId, pvpRows) {
  let best = null;
  for (const league of Object.keys(LEAGUE_LABELS)) {
    const row = (pvpRows[league] ?? []).find((entry) => entry.formId === formId);
    if (row && (!best || row.rank < best.rank)) best = { ...row, league };
  }
  return best ? `PvP rank #${best.rank} (${LEAGUE_LABELS[best.league]})` : null;
}

// Same loaded-vs-empty honesty split as compare.js's rankRow: neither lane
// passed in at all -> "not loaded" (not a fabricated "no appearances");
// a lane loaded with nothing found -> the honest "no ranked appearances".
function postEvolveNoteFor(formId, raidRows, pvpRows) {
  if (!raidRows && !pvpRows) return "Raid/PvP data not loaded yet.";
  const parts = [
    raidRows ? raidNoteFor(formId, raidRows) : null,
    pvpRows ? pvpNoteFor(formId, pvpRows) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "no ranked appearances";
}

// evolveChecklist({formId, forms, roster, holds, raidRows, pvpRows}) -> null
// when this form doesn't evolve, else the checklist object described in the
// module doc comment above.
export function evolveChecklist({
  formId, forms, roster, holds, raidRows, pvpRows,
} = {}) {
  const form = forms?.[formId];
  const edges = form?.evolves_to ?? [];
  if (!form || !edges.length) return null;

  const targets = edges.map((step) => ({
    formId: step.formId,
    name: forms?.[step.formId]?.name ?? step.formId,
    candyCost: Number.isInteger(step.candyCost) ? step.candyCost : null,
    postEvolveNote: postEvolveNoteFor(step.formId, raidRows, pvpRows),
  }));

  const owned = (roster?.instances ?? []).filter((instance) => instance.formId === formId);
  const bestCopy = owned.length
    ? (() => {
      const best = bestOwnedCopy(owned);
      return {
        id: best.id, ivs: best.ivs, ivSum: ivSum(best.ivs), cp: best.cp, isShiny: !!best.isShiny, isLucky: !!best.isLucky,
      };
    })()
    : null;

  // Flags name a specific owned copy's IVs regardless of whether it's the
  // bestCopy pick above — evolving preserves shiny/lucky either way, so the
  // decision of WHICH copy to evolve is left to the reader, not made here.
  const flags = [];
  const shinyOwned = owned.filter((instance) => instance.isShiny);
  const luckyOwned = owned.filter((instance) => instance.isLucky);
  if (shinyOwned.length) {
    const { atk, def, sta } = bestOwnedCopy(shinyOwned).ivs;
    flags.push(`Your shiny is ${atk}/${def}/${sta} — evolving keeps shiny.`);
  }
  if (luckyOwned.length) {
    const { atk, def, sta } = bestOwnedCopy(luckyOwned).ivs;
    flags.push(`Your lucky is ${atk}/${def}/${sta} — evolving keeps lucky.`);
  }

  return {
    formId,
    targets,
    bestCopy,
    flags,
    hold: holdForFormId(holds, formId),
    postEvolveNote: targets.length === 1
      ? targets[0].postEvolveNote
      : targets.map((target) => `${target.name}: ${target.postEvolveNote}`).join(" · "),
  };
}

function targetLine(target) {
  const candy = target.candyCost === null ? "candy cost unknown" : `${target.candyCost} Candy`;
  return `<li>→ ${escapeHtml(target.name)} (${escapeHtml(candy)}) — ${escapeHtml(target.postEvolveNote)}</li>`;
}

// Compact card for the dex evolution section, mounted alongside the existing
// evolutionSection hold banner. "" when there's nothing to check (this form
// doesn't evolve) — same silent-empty-state contract as
// evolution-holds.js's renderEvolutionHoldsCard.
export function renderEvolveChecklistCard({ checklist } = {}) {
  if (!checklist) return "";
  const targetsHtml = `<ul class="dex-evolve-targets">${checklist.targets.map(targetLine).join("")}</ul>`;
  const bestCopyHtml = checklist.bestCopy
    ? `<p class="dex-evolve-best">Best copy to evolve: ${escapeHtml(checklist.bestCopy.ivs.atk)}/${escapeHtml(checklist.bestCopy.ivs.def)}/${escapeHtml(checklist.bestCopy.ivs.sta)} (IV sum ${escapeHtml(checklist.bestCopy.ivSum)}/45), CP ${escapeHtml(checklist.bestCopy.cp)}</p>`
    : `<p class="dex-evolve-best">You don't own this Pokémon yet.</p>`;
  const flagsHtml = checklist.flags.map((flag) => `<p class="dex-evolve-flag">${escapeHtml(flag)}</p>`).join("");
  const holdHtml = checklist.hold
    ? `<p class="dex-evolution-hold" data-status="${escapeHtml(checklist.hold.status)}">${escapeHtml(checklist.hold.line)}</p>`
    : "";
  return `<div class="dex-evolve-checklist">
    <p class="status-kicker">Before you evolve</p>
    ${holdHtml}
    ${targetsHtml}
    ${bestCopyHtml}
    ${flagsHtml}
  </div>`;
}
