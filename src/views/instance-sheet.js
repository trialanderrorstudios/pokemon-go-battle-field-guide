import { escapeHtml, shinyLuckyBadges } from "./home.js";
import { displayMoveName } from "./move-sheet.js";
import { evolutionForecast, instanceLevel, legalMoves, solveLevel, STAR_TIER_RANGES, candidateIvsForTier } from "../instances.js";
import { instanceCardData } from "../share-card.js";
import { RANK_LEAGUES, instanceLeagueRank, rankSummaryText } from "../pvp-team.js";
import { luckyTradeAdvice } from "../lucky-advisor.js";


function leagueName(league) {
  return `${league[0].toUpperCase()}${league.slice(1)} League`;
}


// One rank line per league this detailed instance is eligible for — never
// for star-only instances, and honest about a league it doesn't qualify for
// instead of hiding the league entirely. Composes instanceLeagueRank(), the
// same exhaustive-4096-IV-space search the PvP My Team and Swap views use.
function instanceRankLines(form, instance, pvp) {
  return RANK_LEAGUES.map((league) => {
    const row = pvp?.[league]?.find((entry) => entry.formId === form.form_id) ?? null;
    const rank = instanceLeagueRank(form, instance, league, row);
    if (!rank) return "";
    const summary = rank.eligible
      ? `${rankSummaryText(rank)}${rank.delta ? ` · ${rank.delta.percent}% of rank-1's stat product` : ""}`
      : rank.reason;
    return `<p class="instance-rank-line">${escapeHtml(leagueName(league))}: ${escapeHtml(summary)}</p>`;
  }).join("");
}


// Plain-language "Evolves to" line from evolutionForecast()'s branch tree:
// linear stages join with "→" (Machoke (~1280 CP, 25 Candy) → Machamp
// (~1900 CP, 100 Candy)); a fork (Eevee-class, or any family that branches
// mid-chain) lists every branch at that point separated by "/" instead of
// silently picking one. Returns "" when the form doesn't evolve (or this
// release has no sourced chain data for it) — the caller omits the line.
function evolutionForecastLine(branches) {
  if (!branches.length) return "";
  return branches
    .map((branch) => {
      const rest = evolutionForecastLine(branch.next);
      return `${escapeHtml(branch.name)} (~${escapeHtml(branch.predictedCp)} CP, ${escapeHtml(branch.candyCost)} Candy)${rest ? ` → ${rest}` : ""}`;
    })
    .join(" / ");
}


function ivInput(label, key, value) {
  return `<label class="instance-iv-input">${escapeHtml(label)}
    <input type="number" inputmode="numeric" min="0" max="15" step="1" data-instance-iv="${key}" value="${escapeHtml(value ?? "")}">
  </label>`;
}


// Bar-tap widget: 16 pips per stat (exact IV 0-15), with a wider gap after
// pip 7, 12, and 14 marking the same 0-7/8-12/13-14/15 band boundaries the
// team leader's own stat bar uses (cross-checked: Pokémon GO Hub / igitems /
// dragonflycave appraisal guides all give these ranges) — visual fidelity to
// the in-game bar, not a restriction on which exact value you can tap.
function ivBarPip(statKey, value, selectedValue) {
  const bandEnd = value === 7 || value === 12 || value === 14;
  return `<button type="button" class="instance-iv-pip${value === selectedValue ? " is-selected" : ""}${bandEnd ? " instance-iv-pip-band-end" : ""}" aria-pressed="${value === selectedValue}" data-instance-iv-bar-stat="${statKey}" data-instance-iv-bar-value="${value}">${value}</button>`;
}


function ivBar(label, key, value) {
  const pips = [];
  for (let pip = 0; pip <= 15; pip += 1) pips.push(ivBarPip(key, pip, value));
  return `<div class="instance-iv-bar-group">
    <p class="instance-iv-bar-label">${escapeHtml(label)}</p>
    <div class="instance-iv-bar" role="group" aria-label="${escapeHtml(label)} IV">${pips.join("")}</div>
  </div>`;
}


function candidateChip(ivs) {
  return `<button type="button" class="instance-iv-pip" data-instance-candidate-ivs="${ivs.atk},${ivs.def},${ivs.sta}">${ivs.atk}/${ivs.def}/${ivs.sta}</button>`;
}


function starTierChip(tier, selected) {
  const stars = `${"★".repeat(tier.stars)}${"☆".repeat(4 - tier.stars)}`;
  return `<button type="button" class="move-chip${selected ? " is-selected" : ""}" aria-pressed="${selected}" data-instance-star-tier="${tier.stars}">${stars}</button>`;
}


// "I only know the overall star rating" alternate path: pick a tier, and if
// a CP is already entered this narrows the 4096 possible IV combos down to
// the ones that both land in that tier's IV-sum band and actually reproduce
// the entered CP (candidateIvsForTier — composes solveLevel, never forks it).
function starTierSection(form, draft, starTier) {
  const cpNumber = Number(draft.cp);
  const validCp = Number.isInteger(cpNumber) && cpNumber > 0;
  const tierRow = STAR_TIER_RANGES.map((tier) => starTierChip(tier, starTier === tier.stars)).join("");
  const selectedRange = STAR_TIER_RANGES.find((tier) => tier.stars === starTier);
  let candidateHtml = "";
  if (selectedRange) {
    const bandNote = `IV sum ${selectedRange.min}-${selectedRange.max}`;
    if (!validCp) {
      candidateHtml = `<p class="instance-iv-hint">${bandNote}. Enter CP above to narrow this to exact combos.</p>`;
    } else {
      const candidates = candidateIvsForTier(form, cpNumber, selectedRange, { limit: 10 });
      candidateHtml = candidates.length
        ? `<p class="instance-iv-hint">${bandNote} at CP ${escapeHtml(cpNumber)} — tap a match to fill it in${candidates.length === 10 ? " (more exist; use the bars above for an exact read)" : ""}:</p>
           <div class="instance-iv-bar">${candidates.map(candidateChip).join("")}</div>`
        : `<p class="instance-iv-hint">${bandNote}, but none reach CP ${escapeHtml(cpNumber)} — double-check the CP, or try a neighboring tier.</p>`;
    }
  }
  return `<p class="instance-iv-hint">Only know the overall star rating? Tap it.</p>
    <div class="move-chip-row" role="group" aria-label="Overall appraisal star tier">${tierRow}</div>
    ${candidateHtml}`;
}


// Live CP/level cross-check against the current draft IVs (composes
// solveLevel — same math the save-time validation in instances.js uses).
function draftLevelHint(form, draft) {
  const cpNumber = Number(draft.cp);
  if (!Number.isInteger(cpNumber) || cpNumber <= 0) return "";
  const { atk, def, sta } = draft.ivs ?? {};
  if (![atk, def, sta].every((value) => Number.isInteger(value) && value >= 0 && value <= 15)) return "";
  const level = solveLevel(form, { atk, def, sta }, cpNumber);
  return level !== null
    ? `<p class="instance-iv-hint">CP ${escapeHtml(cpNumber)} at ${atk}/${def}/${sta} IVs → Level ${escapeHtml(level)}.</p>`
    : `<p class="instance-sheet-error" role="alert">No level 1-51 produces CP ${escapeHtml(cpNumber)} at ${atk}/${def}/${sta} IVs — double-check the CP or IVs.</p>`;
}


function moveChip(moveId, selected, dataAttr) {
  return `<button type="button" class="move-chip${selected ? " is-selected" : ""}" aria-pressed="${selected}" data-${dataAttr}="${escapeHtml(moveId)}">${escapeHtml(displayMoveName(moveId))}</button>`;
}


// Lightweight "I changed this one" inline row: just a CP field, no moves —
// so a moveless Poke Genie import can be corrected without also picking
// moves. Composes reviseInstanceCp()'s CPM/IV re-validation (see instances.js).
// Reads the in-progress draft's raw IV inputs (strings from <input> fields,
// "" while blank) into { atk, def, sta } | null-per-key for luckyTradeAdvice,
// which treats non-integers as "not entered yet" rather than silently
// coercing "" to 0.
function draftIvs(draft) {
  const raw = draft.ivs ?? {};
  const parsed = {};
  for (const key of ["atk", "def", "sta"]) {
    const value = raw[key];
    parsed[key] = value === "" || value === undefined || value === null ? null : Number(value);
  }
  return parsed;
}


// "Worth saving for a lucky trade?" advisory, live off the draft being edited
// — see lucky-advisor.js for the floor math and sources. caughtYear is a
// plain optional number typed in for this check only; it is never persisted
// on the saved instance (see instances.js's schema comment).
function luckyAdviceSection(draft) {
  const advice = luckyTradeAdvice({
    ivs: draftIvs(draft),
    caughtYear: draft.caughtYear ? Number(draft.caughtYear) : undefined,
    isLucky: Boolean(draft.isLucky),
  });
  if (advice.status === "invalid") return "";
  return `<div class="lucky-advisor" data-lucky-advisor-status="${advice.status}">
    <p>${escapeHtml(advice.message)}</p>
  </div>`;
}


function quickCpRow(instance, quickCp) {
  return `<div class="instance-quick-cp">
    <label class="instance-cp-input">New CP after power-up/level-up/trade
      <input type="number" inputmode="numeric" min="1" step="1" data-quick-cp-input value="${escapeHtml(quickCp.value ?? "")}">
    </label>
    ${quickCp.error ? `<p class="instance-sheet-error" role="alert">${escapeHtml(quickCp.error)}</p>` : ""}
    <div class="instance-sheet-actions">
      <button type="button" data-action="cancel-quick-cp">Cancel</button>
      <button type="button" data-action="save-quick-cp">Save CP</button>
    </div>
  </div>`;
}


// In-game rename string row: a copy-paste string for Pokémon GO's own
// per-Pokemon nickname field (see rename-string.js), not this app's own
// optional nickname above. renameValue is precomputed by the caller (it
// needs this roster's PVP ranking context, which this view doesn't have).
function renameRow(instance, renameValue, renameCopy) {
  if (!renameValue) return "";
  const active = renameCopy?.instanceId === instance.id;
  const status = active && renameCopy.status === "success"
    ? '<p class="triage-copy-status" role="status">Copied rename string to the clipboard.</p>'
    : active && renameCopy.status === "failure"
      ? `<p class="triage-copy-status" role="status">Could not copy automatically — select and copy it.</p><textarea data-triage-copy-fallback readonly rows="1">${escapeHtml(renameValue)}</textarea>`
      : "";
  return `<p class="instance-rename-string">In-game rename: <code>${escapeHtml(renameValue)}</code>
    <button type="button" data-copy-instance-rename-id="${escapeHtml(instance.id)}" data-copy-instance-rename-payload="${escapeHtml(renameValue)}">Copy</button></p>
    ${status}`;
}


function instanceRow(instance, form, quickCp, pvp, forms, renameValue, renameCopy) {
  const level = instanceLevel(form, instance);
  const quickCpActive = quickCp?.instanceId === instance.id;
  const badges = shinyLuckyBadges(instance);
  const canShare = instanceCardData(instance, form) !== null;
  const forecast = level !== null ? evolutionForecast(form, instance.ivs, level, forms) : [];
  const evolvesToLine = evolutionForecastLine(forecast);
  return `<li class="instance-row" data-instance-id="${escapeHtml(instance.id)}">
    <div>
      <h4>${escapeHtml(instance.nickname || form.name)} ${badges}</h4>
      <p>CP ${escapeHtml(instance.cp)} · ${escapeHtml(instance.ivs.atk)}/${escapeHtml(instance.ivs.def)}/${escapeHtml(instance.ivs.sta)} IV${level !== null ? ` · Level ${escapeHtml(level)}` : ""}</p>
      ${instanceRankLines(form, instance, pvp)}
      <p>${instance.fastMove
        ? `${escapeHtml(displayMoveName(instance.fastMove))} + ${(instance.chargedMoves ?? []).map(displayMoveName).join(" / ")}`
        : `<span class="instance-moves-missing">Moves not set — tap Edit to add them.</span>`}</p>
      ${evolvesToLine ? `<p class="instance-evolves-to">Evolves to <span class="instance-predicted-cp-badge">${evolvesToLine}</span></p>` : ""}
      ${renameRow(instance, renameValue, renameCopy)}
    </div>
    ${quickCpActive ? quickCpRow(instance, quickCp) : `<div class="instance-row-actions">
      <button type="button" data-edit-instance-id="${escapeHtml(instance.id)}">Edit</button>
      <button type="button" data-quick-cp-instance-id="${escapeHtml(instance.id)}">I changed this one</button>
      <button type="button" data-delete-instance-id="${escapeHtml(instance.id)}">Delete</button>
      ${canShare ? `<button type="button" data-share-instance-id="${escapeHtml(instance.id)}">Share card</button>` : ""}
    </div>`}
  </li>`;
}


// Manual quick-add sheet for per-copy detail (CP, IVs, moves) on top of the
// binary owned-star roster. Move pickers are chips over the form's own
// release-data fast/charged move lists — never free text.
export function renderInstanceSheet({
  form, forms = {}, instances = [], draft = null, error = "", focusInstanceId = null, quickCp = null, shareMessage = "", pvp = {},
  renameByInstanceId = null, renameCopy = null, starTier = null,
} = {}) {
  if (!form || !draft) return "";
  const legal = legalMoves(form);
  const existing = instances.filter((instance) => (
    instance.formId === form.form_id && (!focusInstanceId || instance.id === focusInstanceId)
  ));
  const chargedSelected = new Set(draft.chargedMoves ?? []);
  return `<div class="move-sheet-backdrop" data-instance-sheet-backdrop>
    <div class="move-sheet instance-sheet" role="dialog" aria-modal="true" aria-labelledby="instance-sheet-title">
      <button type="button" class="move-sheet-close" data-action="close-instance-sheet" aria-label="Close">✕</button>
      <h2 id="instance-sheet-title">${escapeHtml(form.name)} details</h2>
      <p>Everything below stays on this device. Exact CP/IVs/moves make raid and power-up guidance precise for this specific Pokémon instead of a general assumption.</p>
      ${shareMessage ? `<p class="triage-copy-status" role="status">${escapeHtml(shareMessage)}</p>` : ""}
      ${existing.length ? `<h3>Your ${escapeHtml(form.name)}s</h3><ul class="instance-list">${existing.map((instance) => instanceRow(instance, form, quickCp, pvp, forms, renameByInstanceId?.get(instance.id), renameCopy)).join("")}</ul>` : ""}
      <h3>${draft.editingId ? "Edit" : "Add"} an instance</h3>
      ${error ? `<p class="instance-sheet-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <label class="instance-cp-input">CP
        <input type="number" inputmode="numeric" min="1" step="1" data-instance-cp value="${escapeHtml(draft.cp ?? "")}">
      </label>
      ${draftLevelHint(form, draft)}
      <p class="instance-iv-hint">IVs (0-15 each) — tap Appraise in-game to see these.</p>
      ${ivBar("Attack", "atk", draft.ivs?.atk)}
      ${ivBar("Defense", "def", draft.ivs?.def)}
      ${ivBar("Stamina", "sta", draft.ivs?.sta)}
      ${starTierSection(form, draft, starTier)}
      <p class="instance-iv-hint">Or type exact IVs:</p>
      <div class="instance-iv-row">
        ${ivInput("Attack", "atk", draft.ivs?.atk)}
        ${ivInput("Defense", "def", draft.ivs?.def)}
        ${ivInput("Stamina", "sta", draft.ivs?.sta)}
      </div>
      <p>Fast move</p>
      <div class="move-chip-row" role="group" aria-label="Fast move">${legal.fastMoves.map((moveId) => moveChip(moveId, draft.fastMove === moveId, "instance-fast-move")).join("")}</div>
      <p>Charged moves (pick 1-2)</p>
      <div class="move-chip-row" role="group" aria-label="Charged moves">${legal.chargedMoves.map((moveId) => moveChip(moveId, chargedSelected.has(moveId), "instance-charged-move")).join("")}</div>
      <label class="instance-nickname-input">Nickname (optional)
        <input type="text" maxlength="60" data-instance-nickname value="${escapeHtml(draft.nickname ?? "")}">
      </label>
      <div class="app-actions" role="group" aria-label="Shiny and lucky">
        <button type="button" class="collection-flag-toggle" data-instance-shiny-toggle aria-pressed="${Boolean(draft.isShiny)}">${draft.isShiny ? "★ Shiny" : "☆ Shiny"}</button>
        <button type="button" class="collection-flag-toggle" data-instance-lucky-toggle aria-pressed="${Boolean(draft.isLucky)}">${draft.isLucky ? "🍀 Lucky" : "Lucky"}</button>
      </div>
      <label class="instance-nickname-input">Caught year (optional) — for lucky-trade advice, not saved
        <input type="number" inputmode="numeric" min="2016" step="1" data-instance-caught-year value="${escapeHtml(draft.caughtYear ?? "")}">
      </label>
      ${luckyAdviceSection(draft)}
      <div class="instance-sheet-actions">
        ${draft.editingId ? `<button type="button" data-action="cancel-edit-instance">Cancel edit</button>` : ""}
        <button type="button" data-action="save-instance">${draft.editingId ? "Save changes" : "Add instance"}</button>
      </div>
    </div>
  </div>`;
}
