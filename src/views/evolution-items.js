// Which evolutions cost more than Candy, and how to get the thing they cost.
//
// The ranked cards say "needs Sinnoh Stone" and "only at a Magnetic Lure Module"
// and then leave the reader to find out elsewhere what either means. This is the
// elsewhere.
//
// Two halves with very different provenance, and the page says which is which:
// the list of Pokemon that need an item is derived from the same evolution
// branches the origin lines use, so it cannot drift from the cards; the "how you
// get one" prose is hand-researched, because item acquisition is not in the
// frozen Game Master and no official page enumerates it.
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";

function itemCard(entry, forms) {
  const needed = entry.neededBy ?? [];
  const chips = needed.map((row) => `<span class="acq-needer">
    ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
    <span>${escapeHtml(row.pokemon)}</span></span>`).join("");
  const level = Number.isFinite(entry.unlocksAtLevel)
    ? `<p class="acq-level">Starts dropping at Trainer Level ${entry.unlocksAtLevel}.</p>`
    : "";
  const flag = entry.confidence === "sourced"
    ? ""
    : `<span class="acq-flag">${entry.confidence === "unknown" ? "not identified" : "hand-researched"}</span>`;
  return `<li class="acq-item"><article>
    <h3>${escapeHtml(entry.item)} ${flag}</h3>
    <p>${escapeHtml(entry.detail)}</p>
    ${level}
    ${needed.length
      ? `<p class="acq-needed-label">Needed by ${needed.length === 1 ? "one evolution" : `${needed.length} evolutions`}:</p>
         <div class="acq-needers">${chips}</div>`
      : `<p class="acq-needed-label">Nothing in this dex currently needs it.</p>`}
  </article></li>`;
}

export function renderEvolutionItems({ acquisitionGuide, forms } = {}) {
  const items = acquisitionGuide?.items;
  const body = items?.entries?.length
    // Most-used first: a reader planning a week cares about the Sinnoh Stone
    // gating eighteen evolutions before the Apple gating one.
    ? [...items.entries]
        .sort((left, right) => (right.neededBy?.length ?? 0) - (left.neededBy?.length ?? 0)
          || left.item.localeCompare(right.item))
        .map((entry) => itemCard(entry, forms)).join("")
    : "";
  return `<div class="more-view">
    <a class="safe-escape" href="./#basics" data-route="basics" data-view="">Back to Battle Basics</a>
    <section class="more-section" aria-labelledby="evo-items-title">
      <p class="status-kicker">Reference</p>
      <h2 id="evo-items-title">Evolution items</h2>
      <p>${escapeHtml(items?.intro ?? "")}</p>
      <p class="acq-provenance">Which Pokémon need an item is read from the game data. How you get the item is not in that data, so those lines are marked <span class="acq-flag">hand-researched</span> — treat them as a strong steer, not a citation.</p>
    </section>
    ${body ? `<ul class="acq-list">${body}</ul>` : `<p class="fallback-section">Evolution item data isn't bundled in this release.</p>`}
  </div>`;
}
