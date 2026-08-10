// Dex entry — #dex/<formId>. The noun surface: "what does the app know about
// this Pokémon", aggregated from data every task page already has (see
// docs/dex-route-spec.md). No new math — every section is a lookup into
// gym/pvp/raidTargetTool/raids/acquisitionGuide/currentEggs, joined against
// core.forms for identity. Absence renders as a stated fact ("not ranked"),
// never a blank — see §7 of the spec.
import { escapeHtml, ownedStarButton } from "./home.js";
import { moveLink } from "./move-sheet.js";
import { spriteHtml } from "../sprites.js";
import { typeChip } from "./types.js";

const LEAGUE_NAMES = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });


function typeChips(form) {
  return [form.primary_type, form.secondary_type].filter(Boolean).map(typeChip).join("");
}


function tagsLine(form) {
  const tags = (form.tags ?? []).filter((tag) => tag !== "shadoweligible");
  if (!tags.length) return "";
  return `<p class="dex-tags">${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</p>`;
}


function identitySection(form, forms) {
  return `<header class="dex-identity">
    ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
    <div>
      <h2>${escapeHtml(form.name)}</h2>
      <p class="dex-identity-meta">#${escapeHtml(form.dex)} · ${typeChips(form)}</p>
      ${tagsLine(form)}
      ${form.released ? "" : `<p class="dex-unreleased-banner">Not yet released in Pokémon GO.</p>`}
    </div>
  </header>`;
}


function statsSection(form) {
  const bulk = Number(form.base_defense) * Number(form.base_stamina);
  return `<section class="dex-section" aria-labelledby="dex-stats-title">
    <h3 id="dex-stats-title">Base stats</h3>
    <p>Attack ${escapeHtml(form.base_attack)} · Defense ${escapeHtml(form.base_defense)} · Stamina ${escapeHtml(form.base_stamina)} · Bulk ${escapeHtml(bulk.toLocaleString())}</p>
  </section>`;
}


// Regular defenders get the full-pool defenderIndex (every scored form, rank
// order); shadow defenders only ship a top-100 (shadowDefenderRanking) this
// wave — see docs/dex-route-spec.md §3 and the data contract that shipped it.
function gymVerdict(form, gym) {
  if (form.shadow) {
    const ranking = gym.shadowDefenderRanking ?? [];
    const row = ranking.find((entry) => entry.formId === form.form_id);
    return { row, shadowCapped: true, of: ranking.length };
  }
  const indexRow = (gym.defenderIndex ?? []).find((entry) => entry.formId === form.form_id);
  if (!indexRow) return { row: null };
  const row = indexRow.tier ? (gym.defenderRanking ?? []).find((entry) => entry.formId === form.form_id) : null;
  return { row, indexRow, of: (gym.defenderIndex ?? []).length };
}


function bandPlacements(form, gym) {
  return (gym.bands ?? []).flatMap((band) => {
    const row = (band.rows ?? []).find((entry) => entry.formId === form.form_id);
    return row ? [{ band, row }] : [];
  });
}


function gymSection(form, gym) {
  if (!gym) return `<section class="dex-section" aria-labelledby="dex-gym-title"><h3 id="dex-gym-title">Gym defense</h3><p class="dex-loading">Loading…</p></section>`;
  const eligible = gym.defenderIndex || gym.shadowDefenderRanking;
  if (!eligible) {
    return `<section class="dex-section" aria-labelledby="dex-gym-title"><h3 id="dex-gym-title">Gym defense</h3><p>Ranking index not in this release.</p></section>`;
  }
  const verdict = gymVerdict(form, gym);
  if (!verdict.row && !verdict.indexRow) {
    const message = verdict.shadowCapped
      ? `Outside the shipped shadow top ${escapeHtml(verdict.of)} — no full shadow ranking ships this release.`
      : "Not ranked as a gym defender in this release.";
    return `<section class="dex-section" aria-labelledby="dex-gym-title"><h3 id="dex-gym-title">Gym defense</h3><p>${message}</p></section>`;
  }
  const { row, indexRow, of } = verdict;
  const rank = row?.rank ?? indexRow?.rank;
  const rankLine = row
    ? `Rank ${escapeHtml(rank)} of ${escapeHtml(of)} · Tier ${escapeHtml(row.tier)} · score ${escapeHtml(row.score)}`
    : `Rank ${escapeHtml(rank)} of ${escapeHtml(of)} — outside the shipped tier bands`;
  const detail = row
    ? `<p>${escapeHtml(row.whyRanked)}</p>
       <p>Best moveset: ${moveLink(row.bestFastMove)} + ${moveLink(row.bestChargedMove)}</p>`
    : "";
  const bands = bandPlacements(form, gym);
  const bandLines = bands.length
    ? `<p>${bands.map((placement) => `Placed in <a class="safe-escape" data-route="gyms" data-view="defend" href="./#gyms/defend">${escapeHtml(placement.band.title)}</a>`).join(" · ")}</p>`
    : "";
  return `<section class="dex-section" aria-labelledby="dex-gym-title">
    <h3 id="dex-gym-title">Gym defense</h3>
    <p>${rankLine}</p>
    ${detail}
    ${bandLines}
  </section>`;
}


// A ranked row's fastMove/chargedMove are the practical, obtainable pick —
// eliteFastTM/eliteChargedTM/eventOnlyFastTM/eventOnlyChargedTM say whether
// even that needs an Elite TM or isn't obtainable via any TM (noObtainableAlternative:
// no other option exists for this type). A communityDayClassic move is never
// scare-labelled — the raid meta assumes every serious player already has it.
function raidMoveBadge(moveId, { kind, elite, eventOnly, availabilityClass }) {
  if (availabilityClass === "communityDayClassic") return moveLink(moveId, { kind });
  if (elite) return moveLink(moveId, { kind, elite: true });
  if (eventOnly) return `${moveLink(moveId, { kind })} <small class="elite-tm">Event-only move</small>`;
  return moveLink(moveId, { kind });
}


function raidAttackerSection(form, raids, raidsLoaded) {
  if (!raidsLoaded) {
    return `<section class="dex-section" aria-labelledby="dex-raid-attacker-title"><h3 id="dex-raid-attacker-title">Raid attacker</h3><p class="dex-loading">Loading…</p></section>`;
  }
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])].filter((row) => row.formId === form.form_id);
  if (!rows.length) {
    return `<section class="dex-section" aria-labelledby="dex-raid-attacker-title"><h3 id="dex-raid-attacker-title">Raid attacker</h3><p>Not a ranked raid attacker in this release.</p></section>`;
  }
  const rowsHtml = rows.map((row) => {
    const cls = row.availabilityClass;
    const fast = raidMoveBadge(row.fastMove, { kind: "Fast", elite: row.eliteFastTM, eventOnly: row.eventOnlyFastTM, availabilityClass: cls });
    const charged = raidMoveBadge(row.chargedMove, { kind: "Charged", elite: row.eliteChargedTM, eventOnly: row.eventOnlyChargedTM, availabilityClass: cls });
    const noAlt = row.noObtainableAlternative
      ? ` <span class="acq-flag">no obtainable alternative</span>` : "";
    return `<li>${escapeHtml(row.attackingType)}: rank ${escapeHtml(row.rank)}, ${escapeHtml(row.investmentTier)} tier — ${fast} + ${charged}${noAlt}</li>`;
  }).join("");
  return `<section class="dex-section" aria-labelledby="dex-raid-attacker-title">
    <h3 id="dex-raid-attacker-title">Raid attacker</h3>
    <ul class="dex-list">${rowsHtml}</ul>
  </section>`;
}


function bossSection(form, raidTargetTool) {
  const target = (raidTargetTool?.targets ?? []).find((entry) => entry.bossFormId === form.form_id);
  if (!target) return "";
  return `<section class="dex-section" aria-labelledby="dex-boss-title">
    <h3 id="dex-boss-title">As a raid boss</h3>
    <p>Hundo CP ${escapeHtml(target.normal?.hundoCP)}${target.weatherBoosted?.hundoCP ? ` (${escapeHtml(target.weatherBoosted.hundoCP)} weather-boosted)` : ""}</p>
    <p><a class="safe-escape" data-route="raids" data-view="target" href="./?boss=${encodeURIComponent(form.form_id)}#raids">See counters →</a></p>
  </section>`;
}


function pvpSection(form, pvp) {
  if (!pvp) return `<section class="dex-section" aria-labelledby="dex-pvp-title"><h3 id="dex-pvp-title">PvP</h3><p class="dex-loading">Loading…</p></section>`;
  const rows = Object.entries(LEAGUE_NAMES).map(([league, label]) => {
    const row = (pvp[league] ?? []).find((entry) => entry.formId === form.form_id);
    return row
      ? `<li>${escapeHtml(label)}: rank ${escapeHtml(row.rank)}, ${escapeHtml(row.investmentTier)} tier</li>`
      : `<li>${escapeHtml(label)}: outside the shipped top-150 league rankings</li>`;
  }).join("");
  return `<section class="dex-section" aria-labelledby="dex-pvp-title">
    <h3 id="dex-pvp-title">PvP</h3>
    <ul class="dex-list">${rows}</ul>
  </section>`;
}


// event_only_moves (PvPoke's legacyMoves) are moves this form can never get
// via any TM, Elite included — a stricter claim than eliteIds, so it gets its
// own badge rather than reusing moveLink's "Elite TM" wording.
function moveList(moveIds, eliteIds, eventOnlyIds, kind) {
  return moveIds.map((moveId) => (eliteIds.has(moveId)
    ? `<li>${moveLink(moveId, { elite: true, kind })}</li>`
    : eventOnlyIds.has(moveId)
      ? `<li>${moveLink(moveId, { kind })} <small class="elite-tm">Event-only move</small></li>`
      : `<li>${moveLink(moveId, { kind })}</li>`)).join("");
}


function movesSection(form) {
  const elite = new Set(form.elite_moves ?? []);
  const eventOnly = new Set(form.event_only_moves ?? []);
  return `<section class="dex-section" aria-labelledby="dex-moves-title">
    <h3 id="dex-moves-title">Moves</h3>
    <p>Fast</p>
    <ul class="dex-list">${moveList(form.fast_moves ?? [], elite, eventOnly, "Fast")}</ul>
    <p>Charged</p>
    <ul class="dex-list">${moveList(form.charged_moves ?? [], elite, eventOnly, "Charged")}</ul>
  </section>`;
}


function evolvesFrom(form, forms) {
  return Object.values(forms).find((candidate) => (candidate.evolves_to ?? []).some((step) => step.formId === form.form_id));
}


function evolutionSection(form, forms) {
  const from = evolvesFrom(form, forms);
  const to = (form.evolves_to ?? []).map((step) => forms[step.formId]).filter(Boolean).map((target, index) => (
    `${escapeHtml(target.name)} (${escapeHtml(form.evolves_to[index].candyCost)} Candy)`
  ));
  if (!from && !to.length) return "";
  return `<section class="dex-section" aria-labelledby="dex-evolution-title">
    <h3 id="dex-evolution-title">Evolution</h3>
    ${from ? `<p>Evolves from ${escapeHtml(from.name)}</p>` : ""}
    ${to.length ? `<p>Evolves to ${to.join(" / ")}</p>` : ""}
  </section>`;
}


function acquisitionSection(form, acquisitionGuide) {
  if (!acquisitionGuide) return `<section class="dex-section" aria-labelledby="dex-acquisition-title"><h3 id="dex-acquisition-title">Acquisition</h3><p class="dex-loading">Loading…</p></section>`;
  const itemEntry = (acquisitionGuide.items?.entries ?? []).find((entry) => (entry.neededBy ?? []).some((row) => row.formId === form.form_id));
  const itemLine = itemEntry
    ? `<p>Needs ${escapeHtml(itemEntry.item)} to evolve into${itemEntry.confidence === "handResearched" ? ` <span class="acq-flag">hand-researched</span>` : ""}.</p>`
    : "";
  const buddyLine = Number.isFinite(form.buddy_distance_km) ? `<p>Buddy distance: ${escapeHtml(form.buddy_distance_km)} km</p>` : "";
  if (!itemLine && !buddyLine) return "";
  return `<section class="dex-section" aria-labelledby="dex-acquisition-title">
    <h3 id="dex-acquisition-title">Acquisition</h3>
    ${itemLine}
    ${buddyLine}
  </section>`;
}


function availabilitySection(form, currentEggs) {
  if (!currentEggs) return "";
  const egg = (currentEggs.eggs ?? []).find((entry) => entry.formId === form.form_id);
  if (!egg) return "";
  return `<section class="dex-section" aria-labelledby="dex-availability-title">
    <h3 id="dex-availability-title">Current availability</h3>
    <p>In the current ${escapeHtml(egg.eggType)} egg pool${egg.canBeShiny ? " · shiny-eligible" : ""}.</p>
  </section>`;
}


function rosterSection(form, roster) {
  const owned = new Set(roster.ownedFormIds ?? []);
  const isOwned = owned.has(form.form_id);
  const count = roster.ownedFormCounts?.[form.form_id] ?? 0;
  return `<section class="dex-section" aria-labelledby="dex-roster-title">
    <h3 id="dex-roster-title">Your roster</h3>
    <p>${ownedStarButton({ formId: form.form_id, name: form.name, owned: isOwned, route: "dex" })}
    ${count ? ` ${escapeHtml(count)} instance${count === 1 ? "" : "s"} logged — ` : " "}
    <button type="button" class="dex-instance-link" data-open-instance-sheet-form-id="${escapeHtml(form.form_id)}">${count ? "View details" : "Add details"}</button></p>
  </section>`;
}


// Reuses the exact global-search markup home.js renders — bindSearch() binds
// to it by attribute, not id, so wiring it here (see app.js's dex renderer)
// works the same way. A shared link to a form renamed/removed in a later
// release should fail legibly, not bounce to Home.
function unknownFormShell(formId) {
  return `<div class="more-view dex-view">
    <a class="safe-escape" href="./#more/collection" data-route="more" data-view="collection">Back to Collection</a>
    <section class="more-section" aria-labelledby="dex-unknown-title">
      <p class="status-kicker">Dex entry</p>
      <h2 id="dex-unknown-title">No entry for "${escapeHtml(formId)}" in this release</h2>
      <p>It may have been renamed or removed in a later data update.</p>
    </section>
    <form class="fallback-section" role="search" data-global-search>
      <label for="global-search">Search Pokémon, move, type, or raid boss</label>
      <input id="global-search" name="q" type="search" autocomplete="off">
      <div class="search-recents" data-search-recents></div>
      <div data-search-results aria-live="polite"></div>
    </form>
  </div>`;
}


export function renderDex({
  formId,
  forms = {},
  gym = null,
  pvp = null,
  raidTargetTool = null,
  raids = null,
  raidsLoaded = false,
  acquisitionGuide = null,
  currentEggs = null,
  roster = { ownedFormIds: [], ownedFormCounts: {} },
} = {}) {
  const form = forms[formId];
  if (!form) return unknownFormShell(formId);
  return `<div class="more-view dex-view">
    <a class="safe-escape" href="./#more/collection" data-route="more" data-view="collection">Back to Collection</a>
    ${identitySection(form, forms)}
    ${statsSection(form)}
    ${gymSection(form, gym)}
    ${raidAttackerSection(form, raids, raidsLoaded)}
    ${bossSection(form, raidTargetTool)}
    ${pvpSection(form, pvp)}
    ${movesSection(form)}
    ${evolutionSection(form, forms)}
    ${acquisitionSection(form, acquisitionGuide)}
    ${availabilitySection(form, currentEggs)}
    ${rosterSection(form, roster)}
  </div>`;
}


// Exported for tests: relative-property checks only (never absolute ranks),
// per the repo rule against pinning gym/raid model output.
export { gymVerdict, bandPlacements };
