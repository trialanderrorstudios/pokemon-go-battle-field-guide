// Dex entry — #dex/<formId>. The noun surface: "what does the app know about
// this Pokémon", aggregated from data every task page already has (see
// docs/dex-route-spec.md). No new math — every section is a lookup into
// gym/pvp/raidTargetTool/raids/acquisitionGuide/currentEggs, joined against
// core.forms for identity. Absence renders as a stated fact ("not ranked"),
// never a blank — see §7 of the spec.
import { escapeHtml, ownedStarButton } from "./home.js";
import { moveLink, displayMoveName } from "./move-sheet.js";
import { spriteHtml } from "../sprites.js";
import { typeChip } from "./types.js";
import { candidateIvsForTier, instanceLevel, legalMoves, solveLevel } from "../instances.js";

const LEAGUE_NAMES = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });


function typeChips(form) {
  return [form.primary_type, form.secondary_type].filter(Boolean).map(typeChip).join("");
}


function tagsLine(form) {
  const tags = (form.tags ?? []).filter((tag) => tag !== "shadoweligible");
  if (!tags.length) return "";
  return `<p class="dex-tags">${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</p>`;
}


// dex-identity-sticky: shared marker class for "sprite, №, name, types persistent
// while the entry scrolls" (spec §5 accents; overlaps docs/dex-two-panel-spec.md
// Phase-4, meant to be implemented once and shared with that surface). The
// actual position:sticky rule lives in app.css (css lane), not here.
function identitySection(form, forms) {
  return `<header class="dex-identity dex-identity-sticky">
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


// ── I2: quick-add + optimal moves ───────────────────────────────────────
// Mockup: docs/mockups/delight-2026-08-11/I2-entry-quickadd.html (final
// revision). This is a pure render extension — all state (the in-progress
// draft, editingId, remove-confirm, the one-shot save/update stamp) is owned
// by the caller (app.js) and passed in as `quickAdd`; dex.js only computes
// derived values (level, candidates, optimal pairs, moves-diff) from it, the
// same "props in, HTML out" shape the rest of this file already uses.
//
// Chunk caveat (spec §2): the offense pair comes from `raids` and the
// defense pair from `gym` — both already flow into renderDex() today (see
// raidAttackerSection/gymSection above); raids.json is loaded outside
// ROUTE_CHUNKS.dex by app.js's dex-route raids fetch (app.js, "Home's
// roster-gap teaser... need raids.json"), so no new chunk registration is
// needed here.

// Blank quick-add/edit draft. chargedMoves is a fixed 2-slot array (slot 0 =
// select 1, slot 1 = select 2/optional) so each <select> maps to a stable
// slot, matching the mockup's contract. `stamp` is transient UI-only
// ("Saved"/"Updated" one-shot text keyed to an instance id) — it must never
// be written onto a persisted instance object (that would leak into backups).
export function blankQuickAddDraft() {
  return {
    cp: "", ivs: { atk: null, def: null, sta: null }, fastMove: null, chargedMoves: [null, null],
    editingId: null, removeConfirmPending: false, stamp: null,
  };
}


function draftIvsComplete(ivs) {
  return [ivs?.atk, ivs?.def, ivs?.sta].every((value) => Number.isInteger(value) && value >= 0 && value <= 15);
}


function displayMoveList(moveIds) {
  return (moveIds ?? []).map(displayMoveName).map(escapeHtml).join(" / ");
}


// Elite-TM-honest cost phrase for one move slot (mockup's tmPhrase, I2-entry-
// quickadd.html:514-517 — "Meteor Mash is not 'a Charged TM' away, it is an
// Elite Charged TM away"). This is a cost/obtainability rule, not the CD
// scare-label exception raidMoveBadge() applies to the badge — a Community
// Day move still needs a real Elite TM to relearn once missed.
function moveCostPhrase(kind, elite, eventOnly) {
  if (eventOnly) return "not obtainable by any TM — event distribution only";
  if (elite) return `an Elite ${kind} TM`;
  return `a ${kind} TM`;
}


function bestRaidRow(form, raids) {
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])].filter((row) => row.formId === form.form_id);
  if (!rows.length) return null;
  return rows.reduce((best, row) => (row.rank < best.rank ? row : best));
}


function raidHonorableMentions(form, raids) {
  return (raids?.honorableMentions ?? []).filter((row) => row.formId === form.form_id);
}


// One line per shipped honourable-mention row (see raids.js's own
// honorableMentions() — same field, condensed here since the full Raid
// attacker section below already carries the long form). This is the
// REQUIRED Regieleki case: a type this form isn't ranked for at all on an
// obtainable moveset, but would be with a restricted move spent.
function offenseEliteLines(form, raids) {
  return raidHonorableMentions(form, raids).map((row) => {
    const move = escapeHtml(displayMoveName(row.restrictedMove));
    const cost = row.availabilityClass === "eventOnly" ? "not obtainable by any TM — event distribution only" : "needs an Elite TM";
    return `<p class="optimal-yours-line">With ${move} (${escapeHtml(row.restrictedSlot)} move, ${cost}): would rank <b>#${escapeHtml(row.rankIfUsed)}</b> as a ${escapeHtml(row.attackingType)} attacker.</p>`;
  }).join("");
}


// Condensed one-line form of gyms.js's own eliteUpgradeLine() (same shipped
// row.eliteCharged field — see gyms.js for the full with/without table this
// mirrors). Not imported directly: gyms.js belongs to another lane, and the
// Optimal block wants a terser one-liner here regardless (spec §2 "one-line
// whys").
function defenseEliteLine(row) {
  const elite = row?.eliteCharged;
  if (!elite?.move) return "";
  const communityDay = elite.availabilityClass === "communityDayClassic";
  const label = communityDay ? "Community Day move" : "Elite TM option";
  const gain = Number(elite.gainPct);
  const gainText = Number.isFinite(gain) ? `, +${escapeHtml(gain)}% score` : "";
  const rankText = elite.tier === row.tier
    ? `stays ${escapeHtml(row.tier)} tier (rank ${escapeHtml(row.rank)} → ${escapeHtml(elite.rank)})`
    : `moves to ${escapeHtml(elite.tier)} tier (rank ${escapeHtml(row.rank)} → ${escapeHtml(elite.rank)})`;
  return `<p class="optimal-yours-line">${escapeHtml(label)}: ${moveLink(elite.move, { kind: "Charged", elite: !communityDay })} — ${rankText}${gainText}.</p>`;
}


// Diffs one saved instance's moves against this form's shipped offense data.
// Checks the honourable-mention (Elite) pairs FIRST: an instance that already
// carries a restricted move is diffed on its real, already-spent capability
// (rankIfUsed as that attacking type), never told to go "back" to the merely
// obtainable headline pair — spec's REQUIRED Regieleki rule. The "needs X"
// branch below never silently proposes dropping an elite move the instance
// already carries; it names that trade explicitly.
function instanceOffenseDiff(form, instance, headlineRow, mentionRows) {
  const name = escapeHtml(instance.nickname || form.name);
  if (!instance.fastMove || !instance.chargedMoves?.length) {
    return { html: `${name}: moves not set — use the form below to add them.`, optimal: false };
  }
  for (const row of mentionRows) {
    const pairFast = row.restrictedFastMove;
    const pairCharged = row.restrictedChargedMove;
    if (instance.fastMove === pairFast && instance.chargedMoves.includes(pairCharged)) {
      return {
        html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)} — <b>ranks #${escapeHtml(row.rankIfUsed)} as a ${escapeHtml(row.attackingType)} attacker</b> (the restricted move is already spent).`,
        optimal: true,
      };
    }
  }
  if (!headlineRow) return { html: `${name}: not a ranked raid attacker to compare against.`, optimal: false };
  const fastOk = instance.fastMove === headlineRow.fastMove;
  const chargedOk = instance.chargedMoves.includes(headlineRow.chargedMove);
  if (fastOk && chargedOk) {
    return {
      html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${escapeHtml(displayMoveName(headlineRow.chargedMove))} — <b>already optimal for ${escapeHtml(headlineRow.attackingType.toLowerCase())} offense</b>.`,
      optimal: true,
    };
  }
  const hasEliteCharged = instance.chargedMoves.some((moveId) => (form.elite_moves ?? []).includes(moveId));
  const trade = hasEliteCharged
    ? ` — this trades away an Elite-TM move you already have, which can't be re-earned without spending another one`
    : "";
  if (fastOk || chargedOk) {
    const missingKind = fastOk ? "Charged" : "Fast";
    const missingMove = fastOk ? headlineRow.chargedMove : headlineRow.fastMove;
    const cost = moveCostPhrase(missingKind, fastOk ? headlineRow.eliteChargedTM : headlineRow.eliteFastTM, fastOk ? headlineRow.eventOnlyChargedTM : headlineRow.eventOnlyFastTM);
    return {
      html: `${name} has the right ${fastOk ? "fast" : "charged"} move — <span class="needs">${cost} away</span> from ${escapeHtml(displayMoveName(missingMove))}${missingKind === "Charged" ? trade : ""}.`,
      optimal: false,
    };
  }
  const fastCost = moveCostPhrase("Fast", headlineRow.eliteFastTM, headlineRow.eventOnlyFastTM);
  const chargedCost = moveCostPhrase("Charged", headlineRow.eliteChargedTM, headlineRow.eventOnlyChargedTM);
  return {
    html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)} — <span class="needs">needs ${escapeHtml(displayMoveName(headlineRow.fastMove))} + ${escapeHtml(displayMoveName(headlineRow.chargedMove))}</span> (${fastCost} and ${chargedCost})${trade}.`,
    optimal: false,
  };
}


// Same shape as instanceOffenseDiff, for the single (untyped) gym-defense
// pair. Gym rows don't carry a per-bestMove eliteXTM flag the way raid rows
// do, so the cost phrase falls back to the form-level elite_moves/
// event_only_moves sets — the same source movesSection() above already uses.
function instanceDefenseDiff(form, instance, defenseRow) {
  const name = escapeHtml(instance.nickname || form.name);
  if (!instance.fastMove || !instance.chargedMoves?.length) {
    return { html: `${name}: moves not set — use the form below to add them.`, optimal: false };
  }
  if (!defenseRow) return { html: `${name}: not a ranked gym defender to compare against.`, optimal: false };
  const fastOk = instance.fastMove === defenseRow.bestFastMove;
  const chargedOk = instance.chargedMoves.includes(defenseRow.bestChargedMove);
  if (fastOk && chargedOk) {
    return {
      html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${escapeHtml(displayMoveName(defenseRow.bestChargedMove))} — <b>already optimal for gym defense</b>.`,
      optimal: true,
    };
  }
  const eliteMoves = form.elite_moves ?? [];
  const eventOnlyMoves = form.event_only_moves ?? [];
  const costFor = (moveId, kind) => (eventOnlyMoves.includes(moveId)
    ? "not obtainable by any TM — event distribution only"
    : eliteMoves.includes(moveId) ? `an Elite ${kind} TM` : `a ${kind} TM`);
  const hasEliteCharged = instance.chargedMoves.some((moveId) => eliteMoves.includes(moveId));
  const trade = hasEliteCharged
    ? ` — this trades away an Elite-TM move you already have, which can't be re-earned without spending another one`
    : "";
  if (fastOk || chargedOk) {
    const missingKind = fastOk ? "Charged" : "Fast";
    const missingMove = fastOk ? defenseRow.bestChargedMove : defenseRow.bestFastMove;
    return {
      html: `${name} has the right ${fastOk ? "fast" : "charged"} move — <span class="needs">${costFor(missingMove, missingKind)} away</span> from ${escapeHtml(displayMoveName(missingMove))}${missingKind === "Charged" ? trade : ""}.`,
      optimal: false,
    };
  }
  return {
    html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)} — <span class="needs">needs ${escapeHtml(displayMoveName(defenseRow.bestFastMove))} + ${escapeHtml(displayMoveName(defenseRow.bestChargedMove))}</span> (${costFor(defenseRow.bestFastMove, "Fast")} and ${costFor(defenseRow.bestChargedMove, "Charged")})${trade}.`,
    optimal: false,
  };
}


function optimalYoursHtml(formInstances, diffFn) {
  if (!formInstances.length) return `<p class="optimal-yours-line hint">No saved instance yet — add one below to see how it compares.</p>`;
  return formInstances.map((instance) => {
    const diff = diffFn(instance);
    return `<p class="optimal-yours-line${diff.optimal ? " is-optimal" : ""}">${diff.html}</p>`;
  }).join("");
}


// Optimal block: offense pair (raids) + defense pair (gyms) with one-line
// whys and availability badges, above the flat Raid attacker/Gym defense
// lists further down the page (spec §2 item 3).
function optimalBlockHtml(form, gym, raids, raidsLoaded, formInstances) {
  const headlineRow = raidsLoaded ? bestRaidRow(form, raids) : null;
  const mentionRows = raidsLoaded ? raidHonorableMentions(form, raids) : [];
  const offenseBody = !raidsLoaded
    ? `<div class="optimal-head"><span class="optimal-kind">Offense</span></div><p class="dex-loading">Loading…</p>`
    : headlineRow
      ? (() => {
          const cls = headlineRow.availabilityClass;
          const fast = raidMoveBadge(headlineRow.fastMove, { kind: "Fast", elite: headlineRow.eliteFastTM, eventOnly: headlineRow.eventOnlyFastTM, availabilityClass: cls });
          const charged = raidMoveBadge(headlineRow.chargedMove, { kind: "Charged", elite: headlineRow.eliteChargedTM, eventOnly: headlineRow.eventOnlyChargedTM, availabilityClass: cls });
          return `<div class="optimal-head"><span class="optimal-kind">Offense · ${escapeHtml(headlineRow.attackingType)}</span><span class="optimal-rank">Rank ${escapeHtml(headlineRow.rank)} · ${escapeHtml(headlineRow.investmentTier)} tier</span></div>
            <p class="optimal-moves">${fast} + ${charged}</p>
            <p class="optimal-why">${escapeHtml(headlineRow.whyRanked)}</p>`;
        })()
      : `<div class="optimal-head"><span class="optimal-kind">Offense</span></div><p class="optimal-why">Not a ranked raid attacker in this release.</p>`;
  const offenseYours = `${raidsLoaded ? offenseEliteLines(form, raids) : ""}${optimalYoursHtml(formInstances, (instance) => instanceOffenseDiff(form, instance, headlineRow, mentionRows))}`;

  let defenseRow = null;
  let defenseOf = null;
  if (gym) {
    const verdict = gymVerdict(form, gym);
    defenseRow = verdict.row ?? null;
    defenseOf = verdict.of;
  }
  const defenseBody = !gym
    ? `<div class="optimal-head"><span class="optimal-kind">Defense · Gym</span></div><p class="dex-loading">Loading…</p>`
    : defenseRow
      ? `<div class="optimal-head"><span class="optimal-kind">Defense · Gym</span><span class="optimal-rank">Rank ${escapeHtml(defenseRow.rank)} of ${escapeHtml(defenseOf)} · ${escapeHtml(defenseRow.tier)} tier</span></div>
        <p class="optimal-moves">${moveLink(defenseRow.bestFastMove)} + ${moveLink(defenseRow.bestChargedMove)}</p>
        <p class="optimal-why">${escapeHtml(defenseRow.whyRanked)}</p>`
      : `<div class="optimal-head"><span class="optimal-kind">Defense · Gym</span></div><p class="optimal-why">Not ranked as a gym defender in this release.</p>`;
  const defenseYours = `${defenseEliteLine(defenseRow)}${optimalYoursHtml(formInstances, (instance) => instanceDefenseDiff(form, instance, defenseRow))}`;

  return `<h3 class="section-title">Optimal</h3>
    <div class="optimal-block">
      <div class="optimal-row" data-kind="offense">${offenseBody}<div class="optimal-yours">${offenseYours}</div></div>
      <div class="optimal-row" data-kind="defense">${defenseBody}<div class="optimal-yours">${defenseYours}</div></div>
    </div>`;
}


// Decorative appraisal-style readout next to each IV select — filled ticks up
// to the chosen value. Not interactive; the <select> is the real input.
function ivPipDisplay(value) {
  const ticks = [];
  for (let value_ = 0; value_ <= 15; value_ += 1) {
    const filled = value !== null && value_ <= value;
    const current = value_ === value;
    ticks.push(`<span class="iv-pip-tick${filled ? " is-filled" : ""}${current ? " is-current" : ""}"></span>`);
  }
  return `<div class="iv-pip-display" aria-hidden="true">${ticks.join("")}</div>`;
}


// Native <select> per stat — opens the platform picker wheel on iOS (spec §1
// "bounded choices are native <select>").
function ivFieldHtml(label, key, value) {
  const id = `iv-select-${key}`;
  const options = [`<option value=""${value === null ? " selected" : ""}>—</option>`];
  for (let v = 0; v <= 15; v += 1) options.push(`<option value="${v}"${v === value ? " selected" : ""}>${v}</option>`);
  return `<div class="iv-field">
    <label class="iv-field-label" for="${id}">${escapeHtml(label)}</label>
    <div class="iv-field-row">
      <select id="${id}" class="iv-select" data-iv-select data-stat="${key}">${options.join("")}</select>
      ${ivPipDisplay(value)}
    </div></div>`;
}


// Option text for a native <select> — plain text, so tags compress into a
// short suffix (kept under ~34 chars). Availability (Elite TM / event-only)
// always keeps its words; when a move is ALSO the shipped-optimal pick for
// this form it compresses to a glyph so both facts fit on one line (spec §2
// item 3 / §5). elite_moves/event_only_moves are the same form-level fields
// movesSection() above already reads.
function moveOptionLabel(moveId, kind, form, offensePair, defensePair) {
  const name = displayMoveName(moveId);
  const elite = (form.elite_moves ?? []).includes(moveId);
  const eventOnly = (form.event_only_moves ?? []).includes(moveId);
  const offenseMatch = kind === "fast" ? moveId === offensePair?.fastMove : moveId === offensePair?.chargedMove;
  const defenseMatch = kind === "fast" ? moveId === defensePair?.fastMove : moveId === defensePair?.chargedMove;
  let suffix = "";
  if (eventOnly) suffix = " — Event-only";
  else if (elite && (offenseMatch || defenseMatch)) suffix = ` — ${offenseMatch ? "⚔" : "🛡"} · Elite TM`;
  else if (elite) suffix = " — Elite TM";
  else if (offenseMatch) suffix = " — ⚔ optimal offense";
  else if (defenseMatch) suffix = " — 🛡 optimal defense";
  return name + suffix;
}


// Native <option> is text-only, so the selected move is echoed beside the
// control as a real styled chip (full visual treatment options can't carry).
function moveEchoChip(moveId, form) {
  if (!moveId) return "";
  const elite = (form.elite_moves ?? []).includes(moveId) ? ` <span class="elite-note">Elite TM</span>` : "";
  return `<span class="move-chip is-selected move-chip-echo">${escapeHtml(displayMoveName(moveId))}</span>${elite}`;
}


function moveFieldHtml({ id, label, dataSlot, kind, moveIds, selectedValue, noneLabel, form, offensePair, defensePair }) {
  const optionsHtml = [`<option value=""${!selectedValue ? " selected" : ""}>${escapeHtml(noneLabel)}</option>`]
    .concat(moveIds.map((moveId) => `<option value="${moveId}"${moveId === selectedValue ? " selected" : ""}>${escapeHtml(moveOptionLabel(moveId, kind, form, offensePair, defensePair))}</option>`))
    .join("");
  return `<div class="move-field">
    <label class="move-field-label" for="${id}">${escapeHtml(label)}</label>
    <div class="move-field-row">
      <select id="${id}" class="move-select" data-move-select="${dataSlot}">${optionsHtml}</select>
      <span class="move-echo">${moveEchoChip(selectedValue, form)}</span>
    </div></div>`;
}


function quickAddTitleHtml(form, formInstances, editingId) {
  const target = editingId === null ? null : formInstances.find((instance) => instance.id === editingId);
  if (!target) return `<p class="quickadd-title">Add an instance — quick</p>`;
  const label = target.nickname ? escapeHtml(target.nickname) : `CP ${escapeHtml(target.cp)} — ${target.ivs.atk}/${target.ivs.def}/${target.ivs.sta}`;
  return `<p class="quickadd-title is-editing-title">Editing ${label}</p>`;
}


// Remove only exists once you're inside the edit context (never on the row
// itself), and its own confirm is inline — no browser confirm() dialog
// (spec §2 item 5).
function quickAddActionsHtml(editingId, removeConfirmPending, canSave) {
  if (editingId !== null && removeConfirmPending) {
    return `<div class="quickadd-confirm-remove">
      <p class="verdict-bad" role="alert">Remove this instance from your roster? This can't be undone.</p>
      <div class="quickadd-actions">
        <button type="button" data-action="confirm-remove">Remove instance</button>
        <button type="button" data-action="cancel-remove">Keep it</button>
      </div></div>`;
  }
  if (editingId !== null) {
    return `<div class="quickadd-actions">
        <button type="button" data-action="save-instance"${canSave ? "" : " disabled"}>Update</button>
        <button type="button" data-action="cancel-edit">Cancel</button>
      </div>
      <div class="quickadd-actions quickadd-actions-remove">
        <button type="button" data-action="remove-instance">Remove</button>
      </div>`;
  }
  return `<div class="quickadd-actions"><button type="button" data-action="save-instance"${canSave ? "" : " disabled"}>Save to roster</button></div>`;
}


function quickAddBodyHtml(form, draft, offensePair, defensePair) {
  const cp = draft.cp ?? "";
  const cpNumber = Number(cp);
  const validCp = Number.isInteger(cpNumber) && cpNumber > 0;
  const ivs = draft.ivs ?? { atk: null, def: null, sta: null };
  const ivsComplete = draftIvsComplete(ivs);

  let levelHint = "";
  let canSave = false;
  if (validCp && ivsComplete) {
    const level = solveLevel(form, ivs, cpNumber);
    if (level !== null) {
      levelHint = `<p class="verdict-good"><span class="number-roll">Level ${escapeHtml(level)}</span> at CP ${escapeHtml(cpNumber)}.</p>`;
      canSave = true;
    } else {
      levelHint = `<p class="verdict-bad" role="alert">No level produces CP ${escapeHtml(cpNumber)} with ${ivs.atk}/${ivs.def}/${ivs.sta} IVs — check the CP or the bars.</p>`;
    }
  } else if (validCp && !ivsComplete) {
    // CP-only path: candidateIvsForTier already enumerates every atk/def/sta
    // combo (0-15 each) whose sum falls in a range and reproduces the given
    // CP (see instances.js) — {min:0,max:45} covers the whole IV-sum space,
    // so this is the "CP alone, no tier known" case with no new solver code.
    const candidates = candidateIvsForTier(form, cpNumber, { min: 0, max: 45 }, { limit: 10 });
    levelHint = candidates.length
      ? `<p class="hint">CP ${escapeHtml(cpNumber)} alone narrows to at least ${candidates.length}${candidates.length === 10 ? "+" : ""} possible IV combo${candidates.length === 1 ? "" : "s"} — narrow it with the bars above, or tap a match:</p>
        <div class="candidate-row">${candidates.map((c) => `<button type="button" class="candidate-chip" data-candidate-fill="${c.atk},${c.def},${c.sta}">${c.atk}/${c.def}/${c.sta}</button>`).join("")}</div>`
      : `<p class="hint">No IV combination (0-15 each) reaches CP ${escapeHtml(cpNumber)} at any level for ${escapeHtml(form.name)} — double-check the CP.</p>`;
  }

  // type="text" + inputmode="numeric" + pattern="[0-9]*" opens the numeric
  // keypad on iOS/Android without type="number"'s spinner/scroll-to-increment
  // behavior (spec §1 CP field rule).
  const cpFieldHtml = `<label class="cp-input">CP<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-cp-input value="${escapeHtml(cp)}"></label>
    <p class="cp-caption-chip">Opens numeric keypad on device</p>`;

  const useOptimalHtml = `<div class="explore-row use-optimal-row">
    ${offensePair ? `<button type="button" class="explore-chip" data-use-optimal="offense" data-use-optimal-fast="${escapeHtml(offensePair.fastMove)}" data-use-optimal-charged="${escapeHtml(offensePair.chargedMove)}">Use optimal (offense)</button>` : ""}
    ${defensePair ? `<button type="button" class="explore-chip" data-use-optimal="defense" data-use-optimal-fast="${escapeHtml(defensePair.fastMove)}" data-use-optimal-charged="${escapeHtml(defensePair.chargedMove)}">Use optimal (defense)</button>` : ""}
    </div>`;

  const legal = legalMoves(form);
  const fastFieldHtml = moveFieldHtml({
    id: "fast-move-select", label: "Fast move", dataSlot: "fast", kind: "fast",
    moveIds: legal.fastMoves, selectedValue: draft.fastMove, noneLabel: "— choose —", form, offensePair, defensePair,
  });
  const charged1FieldHtml = moveFieldHtml({
    id: "charged-move-select-1", label: "Charged move 1", dataSlot: "charged1", kind: "charged",
    moveIds: legal.chargedMoves, selectedValue: draft.chargedMoves?.[0] ?? null, noneLabel: "— choose —", form, offensePair, defensePair,
  });
  // Slot 2 excludes whatever slot 1 already holds (the game won't let a
  // Pokémon carry the same charged move twice) and defaults to "— none —"
  // since a second charged move is optional in-game.
  const charged2Options = legal.chargedMoves.filter((moveId) => moveId !== draft.chargedMoves?.[0]);
  const charged2FieldHtml = moveFieldHtml({
    id: "charged-move-select-2", label: "Charged move 2 (optional — not required in-game)", dataSlot: "charged2", kind: "charged",
    moveIds: charged2Options, selectedValue: draft.chargedMoves?.[1] ?? null, noneLabel: "— none —", form, offensePair, defensePair,
  });

  return cpFieldHtml
    + ivFieldHtml("Attack", "atk", ivs.atk)
    + ivFieldHtml("Defense", "def", ivs.def)
    + ivFieldHtml("HP", "sta", ivs.sta)
    + levelHint
    + `<p class="quickadd-moves-title">Moves</p>`
    + useOptimalHtml
    + fastFieldHtml + charged1FieldHtml + charged2FieldHtml
    + quickAddActionsHtml(draft.editingId, Boolean(draft.removeConfirmPending), canSave);
}


// Row + Edit button share one edit trigger, but only when NOT already the
// instance being edited — re-tapping the held row mid-edit would silently
// discard in-progress form changes back to the saved values (mockup fix,
// ported). Keyed by instance.id, never by stats — the REQUIRED twins case:
// two identical-stat instances get two independent rows/ids here.
function quickAddInstanceRowHtml(form, instance, editingId, stamp) {
  const level = instanceLevel(form, instance);
  const movesLine = instance.fastMove
    ? `${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)}`
    : `<span class="instance-moves-missing">Moves not set</span>`;
  const isEditing = instance.id === editingId;
  const showStamp = stamp && stamp.instanceId === instance.id;
  const editAttr = isEditing ? "" : ` data-edit-instance="${escapeHtml(instance.id)}"`;
  return `<li class="instance-row${isEditing ? " is-editing" : ""}"${editAttr}>
    ${showStamp ? `<span class="saved-stamp">${escapeHtml(stamp.text)}</span>` : ""}
    <h4>${escapeHtml(instance.nickname || form.name)}</h4>
    <p>CP ${escapeHtml(instance.cp)} · ${escapeHtml(instance.ivs.atk)}/${escapeHtml(instance.ivs.def)}/${escapeHtml(instance.ivs.sta)} IV${level !== null ? ` · Level ${escapeHtml(level)}` : ""}</p>
    <p>${movesLine}</p>
    <button type="button" class="instance-edit-btn"${editAttr}${isEditing ? " disabled" : ""}>${isEditing ? "Editing…" : "Edit"}</button>
  </li>`;
}


function rosterSection(form, roster, quickAdd, raids, raidsLoaded, gym) {
  const owned = new Set(roster.ownedFormIds ?? []);
  const isOwned = owned.has(form.form_id);
  const formInstances = (roster.instances ?? []).filter((instance) => instance.formId === form.form_id);
  const draft = quickAdd ?? blankQuickAddDraft();
  const headlineRow = raidsLoaded ? bestRaidRow(form, raids) : null;
  const defenseRow = gym ? (gymVerdict(form, gym).row ?? null) : null;
  const offensePair = headlineRow ? { fastMove: headlineRow.fastMove, chargedMove: headlineRow.chargedMove } : null;
  const defensePair = defenseRow ? { fastMove: defenseRow.bestFastMove, chargedMove: defenseRow.bestChargedMove } : null;

  return `<section class="dex-section" aria-labelledby="dex-roster-title">
    ${optimalBlockHtml(form, gym, raids, raidsLoaded, formInstances)}
    <h3 id="dex-roster-title" class="section-title">Your roster</h3>
    <p>${ownedStarButton({ formId: form.form_id, name: form.name, owned: isOwned, route: "dex" })}</p>
    <p class="roster-summary"><span class="roster-star">★</span> ${escapeHtml(formInstances.length)} instance${formInstances.length === 1 ? "" : "s"} logged</p>
    <ul class="instance-list">${formInstances.map((instance) => quickAddInstanceRowHtml(form, instance, draft.editingId, draft.stamp)).join("")}</ul>
    <div class="quickadd-card${draft.editingId !== null ? " is-editing-card" : ""}">
      ${quickAddTitleHtml(form, formInstances, draft.editingId)}
      ${quickAddBodyHtml(form, draft, offensePair, defensePair)}
    </div>
    <p><button type="button" class="dex-instance-link" data-open-instance-sheet-form-id="${escapeHtml(form.form_id)}">Shiny, lucky, nickname &amp; more →</button></p>
    <p class="dex-backup-pointer"><a class="safe-escape" data-route="more" data-view="about" href="./#more/about">Back up your roster (full-device backup) →</a></p>
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
      <div data-search-results></div>
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
  roster = { ownedFormIds: [], ownedFormCounts: {}, instances: [] },
  // In-progress quick-add/edit draft (see blankQuickAddDraft()) — owned and
  // mutated by the caller (app.js), null/omitted renders a blank "add" form.
  quickAdd = null,
} = {}) {
  const form = forms[formId];
  if (!form) return unknownFormShell(formId);
  return `<div class="more-view dex-view">
    <a class="safe-escape" href="./#more/collection" data-route="more" data-view="collection">Back to Collection</a>
    ${identitySection(form, forms)}
    ${statsSection(form)}
    ${rosterSection(form, roster, quickAdd, raids, raidsLoaded, gym)}
    ${gymSection(form, gym)}
    ${raidAttackerSection(form, raids, raidsLoaded)}
    ${bossSection(form, raidTargetTool)}
    ${pvpSection(form, pvp)}
    ${movesSection(form)}
    ${evolutionSection(form, forms)}
    ${acquisitionSection(form, acquisitionGuide)}
    ${availabilitySection(form, currentEggs)}
  </div>`;
}


// Exported for tests: relative-property checks only (never absolute ranks),
// per the repo rule against pinning gym/raid model output.
export { gymVerdict, bandPlacements };
