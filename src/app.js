import { createRouter, ROUTES } from "./router.js";
import { APP_SHELL_REVISION, ReleaseManager } from "./release-manager.js";
import { ATTACK_TYPES, becauseLine, buildRaidPlan, powerUpCost } from "./raid-target.js";
import { buildSearchIndex, search } from "./search.js";
import {
  createIndexedDbAdapter,
  importRoster,
  loadRoster,
  stableRosterJson,
} from "./storage.js";
import { scorePlacement } from "./placement.js";
import { jargonTerm } from "./glossary.js";
import { escapeHtml, ownedStarButton, renderHome } from "./views/home.js";
import { renderBasics } from "./views/basics.js";
import { renderTypes, typeChip } from "./views/types.js";
import { renderGlossary } from "./views/glossary.js";
import { handleSpriteError, spriteHtml } from "./sprites.js";
import { renderGyms } from "./views/gyms.js";
import { renderMore } from "./views/more.js";
import { buildMoveIndex } from "./moves.js";
import { moveLink, renderMoveSheet } from "./views/move-sheet.js";
import { renderInstanceSheet } from "./views/instance-sheet.js";
import { bestInstanceForForm, buildInstance, instanceLevel } from "./instances.js";
import { parsePokeGenieCsv } from "./poke-genie-import.js";
import { exportFeedback, recordFeedback } from "./feedback.js";
import { applyTextSize, loadTextSize, saveTextSize } from "./text-size.js";
import { createPvpState, renderPvp } from "./views/pvp.js";
import { withMyTeamOverride } from "./pvp-team.js";
import { renderRaids } from "./views/raids.js";
import {
  advanceDrillQuestion,
  answerDrillQuestion,
  createDrillState,
  restartDrillRound,
  setDrillMode,
} from "./drill.js";
import { renderDrill } from "./views/drill.js";
import {
  advanceSwapToOpponent,
  backToSwapOpponent,
  backToSwapTeam,
  createSwapState,
  selectSwapOpponent,
  setSwapLeague,
  setSwapOpponentQuery,
  toggleSwapManualPick,
} from "./swap.js";
import { renderSwap } from "./views/swap.js";
import { renderCoach } from "./views/coach.js";


function usableState(state) {
  return state
    && typeof state === "object"
    && state.core
    && typeof state.core === "object"
    && state.core.forms
    && typeof state.core.forms === "object";
}


function basePathFrom(location) {
  const path = location.pathname;
  return path.endsWith("/") ? path : path.slice(0, path.lastIndexOf("/") + 1);
}


function renderSearchResults(results, forms, roster) {
  if (!results.length) return "<p>No local matches.</p>";
  const owned = new Set(roster?.ownedFormIds ?? []);
  return `<ul>${results.slice(0, 10).map((result) => (
    `<li class="search-result-card${owned.has(result.formId) ? " is-owned" : ""}">${spriteHtml(result.formId, forms, result.name, forms?.[result.formId]?.primary_type)}<strong>${escapeHtml(result.name)}</strong> <span>${escapeHtml(result.resultCategory)}</span>${ownedStarButton({ formId: result.formId, name: result.name, owned: owned.has(result.formId), route: "search" })}</li>`
  )).join("")}</ul>`;
}


export function bindSearch(documentObject, index, forms, roster) {
  const form = documentObject.querySelector("[data-global-search]");
  const input = form?.querySelector("input[type='search']");
  const output = form?.querySelector("[data-search-results]");
  if (!input || !output) return () => {};
  const render = () => {
    output.innerHTML = input.value.trim()
      ? renderSearchResults(search(index, input.value), forms, roster)
      : "";
  };
  input.addEventListener("input", render);
  return render;
}


export function releaseLabel(releaseState = {}) {
  if (releaseState.status === "update_available" && releaseState.error) {
    return `Update failed · using the installed release · ${releaseState.error}`;
  }
  if (releaseState.status === "update_available") {
    return `Update available · data through ${releaseState.candidate?.dataCutoff ?? "unknown"}`;
  }
  if (releaseState.status === "updating" || releaseState.status === "caching") return "Downloading and verifying data";
  if (releaseState.status === "offline") return "Offline · using the installed release";
  if (releaseState.status === "failed") return `Update failed · ${releaseState.error ?? "try again"}`;
  return releaseState.currentReleaseId ? "Current validated release" : "Update status unavailable";
}


function offlineLabel(releaseState = {}) {
  if (releaseState.offlineReady) return "Ready offline";
  if (releaseState.status === "caching") return "Preparing offline data";
  return "Offline setup incomplete";
}


function releaseView(releaseState = {}) {
  const manifest = releaseState.manifest;
  return manifest ? {
    releaseId: manifest.releaseId,
    dataCutoff: manifest.dataCutoff,
    notes: manifest.notes ?? null,
    releaseNotes: manifest.releaseNotes,
    doClaim: manifest.doClaim,
    doNotClaim: manifest.doNotClaim,
    shellRevision: APP_SHELL_REVISION,
  } : null;
}


// ponytail: dismissal is a single localStorage flag per release id, not a
// roster-backed preference — it's disposable UI state, not data worth an
// IndexedDB write or cross-device sync.
function whatsNewDismissedKey(releaseId) {
  return `whats-new-dismissed:${releaseId}`;
}


function whatsNewCard(releaseState, storage) {
  const manifest = releaseState.manifest;
  if (!manifest?.releaseId || !manifest?.notes) return null;
  if (storage?.getItem?.(whatsNewDismissedKey(manifest.releaseId)) === "1") return null;
  return { releaseId: manifest.releaseId, dataCutoff: manifest.dataCutoff, notes: manifest.notes };
}


// ponytail: same disposable-flag pattern as the what's-new dismissal — a
// single localStorage key, not release-scoped, since the card's content is
// static orientation copy rather than per-release notes.
const START_HERE_DISMISSED_KEY = "start-here-dismissed";


function showStartHere(storage) {
  return storage?.getItem?.(START_HERE_DISMISSED_KEY) !== "1";
}


function placementFor(state, roster) {
  if (!state.gym || !state.placement || !state.core?.forms) return undefined;
  try {
    return scorePlacement({
      lineupFormIds: state.lineupFormIds ?? [],
      ownedFormIds: roster?.ownedFormIds ?? [],
      defenderRows: state.gym.defenders,
      forms: state.core.forms,
      weights: state.placement.weights,
    });
  } catch {
    return undefined;
  }
}


export function gymEligibleDefenderForms(forms = {}) {
  return Object.values(forms).filter((form) => {
    const tags = new Set(form?.tags ?? []);
    const formName = String(form?.form ?? "").toUpperCase();
    const mythicalGymException = form?.dex === 808 || form?.dex === 809;
    return form?.released === true
      && Number(form?.base_defense) > 0
      && Number(form?.base_stamina) > 0
      && !tags.has("mega")
      && !tags.has("legendary")
      && (!tags.has("mythical") || mythicalGymException)
      && !tags.has("ultrabeast")
      && !formName.startsWith("MEGA")
      && formName !== "PRIMAL";
  }).sort((left, right) => left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  }) || left.form_id.localeCompare(right.form_id));
}


function replaceObject(target, value) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(value));
}


function downloadFile(filename, payload, { documentObject, windowObject }) {
  if (!documentObject?.createElement || !windowObject?.URL?.createObjectURL || typeof Blob === "undefined") return;
  const url = windowObject.URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = documentObject.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  windowObject.URL.revokeObjectURL(url);
}


const TASK_ROUTES = new Set(["raids", "gyms", "pvp"]);
const RAID_LANES = new Set(["regular", "shadow", "owned"]);
const RAID_LEVELS = new Set(["normal", "weatherBoosted"]);
const RAID_VIEWS = new Set(["rankings", "target"]);
const RAID_TARGET_CATEGORIES = Object.freeze([
  ["all", "All targets"],
  ["standard", "Standard"],
  ["mega", "Mega"],
  ["supermega", "Super Mega"],
  ["primal", "Primal"],
  ["shadow", "Shadow"],
  ["legendary", "Legendary"],
  ["mythical", "Mythical"],
  ["ultrabeast", "Ultra Beast"],
]);
const RAID_TARGET_CATEGORY_SET = new Set(RAID_TARGET_CATEGORIES.map(([value]) => value));
const SUPER_MEGA_FORM_IDS = new Set(["0026-mega-y"]);


function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}


function allowed(value, choices, fallback) {
  return choices.has(value) ? value : fallback;
}


function validFormId(value, validFormIds, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  if (validFormIds instanceof Set && !validFormIds.has(value)) return fallback;
  return value;
}


function raidState(filters = {}, validFormIds = null) {
  const observedCp = typeof filters.observedCp === "string"
    && /^\d{0,5}$/.test(filters.observedCp)
    ? filters.observedCp
    : "";
  return {
    attackingType: allowed(filters.attackingType, new Set(ATTACK_TYPES), "Bug"),
    counterLane: allowed(filters.counterLane, RAID_LANES, "regular"),
    encounterLevel: allowed(filters.encounterLevel, RAID_LEVELS, "normal"),
    observedCp,
    targetFormId: validFormId(filters.targetFormId, validFormIds, "0150-normal"),
    targetCategory: allowed(filters.targetCategory, RAID_TARGET_CATEGORY_SET, "all"),
    view: allowed(filters.view, RAID_VIEWS, "rankings"),
    showAll: Boolean(filters.showAll),
  };
}


function raidTargetMatchesCategory(target, form, category) {
  if (category === "all") return true;
  const tags = new Set(form?.tags ?? []);
  const formName = String(form?.form ?? "").toUpperCase();
  const isSuperMega = SUPER_MEGA_FORM_IDS.has(target?.bossFormId);
  const isPrimal = formName === "PRIMAL";
  const isMega = tags.has("mega") && !isPrimal && !isSuperMega;
  if (category === "supermega") return isSuperMega;
  if (category === "primal") return isPrimal;
  if (category === "mega") return isMega;
  if (category === "shadow") return form?.shadow === true;
  if (category === "legendary") return tags.has("legendary");
  if (category === "mythical") return tags.has("mythical");
  if (category === "ultrabeast") return tags.has("ultrabeast");
  if (category === "standard") {
    return form?.shadow !== true
      && !isMega
      && !isPrimal
      && !isSuperMega
      && !tags.has("legendary")
      && !tags.has("mythical")
      && !tags.has("ultrabeast");
  }
  return false;
}


export function raidTargetsForCategory(targets = [], forms = {}, category = "all") {
  const safeCategory = RAID_TARGET_CATEGORY_SET.has(category) ? category : "all";
  return [...targets]
    .filter((target) => raidTargetMatchesCategory(target, forms[target?.bossFormId], safeCategory))
    .sort((left, right) => left.boss.localeCompare(right.boss, undefined, {
      numeric: true,
      sensitivity: "base",
    }) || left.bossFormId.localeCompare(right.bossFormId));
}


function normalizeGymLineup(formIds, gymDefenderFormIds, gymDefenderSpeciesByFormId) {
  const lineup = [];
  const usedSpecies = new Set();
  for (const formId of Array.isArray(formIds) ? formIds : []) {
    if (lineup.length >= 6 || typeof formId !== "string") continue;
    if (gymDefenderFormIds && !gymDefenderFormIds.has(formId)) continue;
    const species = gymDefenderSpeciesByFormId?.get(formId) ?? formId;
    if (usedSpecies.has(species)) continue;
    usedSpecies.add(species);
    lineup.push(formId);
  }
  return lineup;
}


function gymState(
  filters = {}, gymDefenderFormIds = null, gymDefenderSpeciesByFormId = null,
) {
  const lineupFormIds = normalizeGymLineup(
    filters.lineupFormIds,
    gymDefenderFormIds,
    gymDefenderSpeciesByFormId,
  );
  const safeIndex = (value) => Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000
    ? value
    : 0;
  return {
    lineupFormIds,
    ownedIndex: safeIndex(filters.ownedIndex),
    overallIndex: safeIndex(filters.overallIndex),
  };
}


function blankInstanceDraft() {
  return { editingId: null, cp: "", ivs: { atk: "", def: "", sta: "" }, fastMove: "", chargedMoves: [], nickname: "" };
}


function draftFromInstance(instance) {
  return {
    editingId: instance.id,
    cp: instance.cp,
    ivs: { ...instance.ivs },
    fastMove: instance.fastMove ?? "",
    chargedMoves: [...(instance.chargedMoves ?? [])],
    nickname: instance.nickname ?? "",
  };
}


export function createInteractionState({
  roster = {},
  validFormIds = null,
  gymDefenderFormIds = validFormIds,
  gymDefenderSpeciesByFormId = null,
  storage = null,
} = {}) {
  const savedTask = plainObject(roster.preferences?.lastTask)
    && TASK_ROUTES.has(roster.preferences.lastTask.route)
    && plainObject(roster.preferences.lastTask.filters)
    ? roster.preferences.lastTask
    : null;
  const taskFilters = savedTask?.filters ?? {};
  return {
    raid: raidState(savedTask?.route === "raids" ? taskFilters : {}, validFormIds),
    gym: gymState(
      savedTask?.route === "gyms" ? taskFilters : {},
      gymDefenderFormIds,
      gymDefenderSpeciesByFormId,
    ),
    pvp: createPvpState({
      preferences: roster.preferences ?? {},
      filters: savedTask?.route === "pvp" ? taskFilters : {},
    }),
    drill: createDrillState({ storage }),
    swap: createSwapState(),
    lastTask: savedTask ? { route: savedTask.route } : null,
    moreList: null,
    installMessage: "",
    rosterMessage: "",
    rosterQuery: "",
    interactionMessage: "",
    moveSheet: null,
    instanceSheet: null,
    rosterShareOpen: false,
    textSize: loadTextSize(storage),
  };
}


function taskFilters(route, ui) {
  if (route === "raids") return structuredClone(ui.raid);
  if (route === "gyms") return structuredClone(ui.gym);
  if (route === "pvp") return structuredClone(ui.pvp);
  throw new TypeError(`Unsupported resumable task route: ${String(route)}`);
}


export function createInteractionController({
  ui,
  roster,
  rosterStore = null,
  validFormIds = new Set(),
  forms = {},
  gymDefenderFormIds = validFormIds,
  gymDefenderSpeciesByFormId = null,
  renderRoute = () => {},
  releaseManager = null,
  navigateMore = null,
  installPrompt = null,
  onRosterExport = null,
  onRosterShareCopy = null,
  onFeedbackExport = null,
  searchRefresh = () => {},
  storage = null,
  rerenderCurrent = () => {},
  rootElement = null,
} = {}) {
  if (!ui || !roster) throw new TypeError("Interaction state and roster are required.");

  let rosterWriteQueue = Promise.resolve();
  const enqueueRosterWrite = (buildNext) => {
    const operation = rosterWriteQueue.then(async () => {
      const snapshot = structuredClone(buildNext(structuredClone(roster)));
      if (rosterStore?.replace) await rosterStore.replace(snapshot);
      replaceObject(roster, snapshot);
      return snapshot;
    });
    rosterWriteQueue = operation.catch(() => {});
    return operation;
  };
  const mutateRoster = (buildNext) => enqueueRosterWrite(buildNext);
  let failureRoute = ui.lastTask?.route ?? "home";
  const persistTask = async (route, nextUi) => {
    failureRoute = route;
    const filters = taskFilters(route, nextUi);
    await mutateRoster((current) => {
      const preferences = {
        ...(current.preferences ?? {}),
        lastTask: { route, filters },
      };
      if (route === "pvp") preferences.pvp = structuredClone(nextUi.pvp);
      return { ...current, preferences };
    });
    nextUi.lastTask = { route };
    nextUi.interactionMessage = "";
    replaceObject(ui, nextUi);
  };
  const rerender = (route) => renderRoute(route);

  const api = {
    onRosterExport,
    onRosterShareCopy,
    onFeedbackExport,
    handleFailure(error) {
      ui.interactionMessage = `Could not save changes: ${error?.message ?? error}`;
      rerender(failureRoute);
    },
    handleInput(event) {
      const rosterSearch = event?.target?.closest?.("[data-roster-search]");
      if (rosterSearch) {
        ui.rosterQuery = String(rosterSearch.value ?? "").slice(0, 80);
        const caret = Math.min(
          Number.isInteger(rosterSearch.selectionStart) ? rosterSearch.selectionStart : ui.rosterQuery.length,
          ui.rosterQuery.length,
        );
        const ownerDocument = rosterSearch.ownerDocument;
        rerender("more");
        const nextSearch = ownerDocument?.querySelector?.("[data-roster-search]");
        nextSearch?.focus?.({ preventScroll: true });
        nextSearch?.setSelectionRange?.(caret, caret);
        return;
      }
      const swapOpponentQuery = event?.target?.closest?.("[data-swap-opponent-query]");
      if (swapOpponentQuery) {
        ui.swap = setSwapOpponentQuery(ui.swap, swapOpponentQuery.value);
        const caret = Math.min(
          Number.isInteger(swapOpponentQuery.selectionStart) ? swapOpponentQuery.selectionStart : ui.swap.opponentQuery.length,
          ui.swap.opponentQuery.length,
        );
        const ownerDocument = swapOpponentQuery.ownerDocument;
        rerender("swap");
        const nextInput = ownerDocument?.querySelector?.("[data-swap-opponent-query]");
        nextInput?.focus?.({ preventScroll: true });
        nextInput?.setSelectionRange?.(caret, caret);
      }
    },
    async handleChange(event) {
      const target = event?.target;
      const raidType = target?.closest?.("[data-raid-type]");
      if (raidType) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({ ...nextUi.raid, attackingType: raidType.value }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const raidTarget = target?.closest?.("[data-raid-target]");
      if (raidTarget) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({ ...nextUi.raid, targetFormId: raidTarget.value }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const raidTargetCategory = target?.closest?.("[data-raid-target-category]");
      if (raidTargetCategory) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({
          ...nextUi.raid,
          targetCategory: raidTargetCategory.value,
        }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const observedCp = target?.closest?.("[data-observed-cp]");
      if (observedCp) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({ ...nextUi.raid, observedCp: observedCp.value }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const encounterLevel = target?.closest?.("[data-encounter-level]");
      if (encounterLevel) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({ ...nextUi.raid, encounterLevel: encounterLevel.value }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const gymLineup = target?.closest?.("[data-gym-lineup]");
      if (gymLineup) {
        const nextUi = structuredClone(ui);
        nextUi.gym.lineupFormIds = normalizeGymLineup(
          [...(gymLineup.selectedOptions ?? [])].map((selectedOption) => selectedOption.value),
          gymDefenderFormIds,
          gymDefenderSpeciesByFormId,
        );
        await persistTask("gyms", nextUi);
        rerender("gyms");
        return;
      }
      const gymLineupAdd = target?.closest?.("[data-gym-lineup-add]");
      if (gymLineupAdd?.value) {
        const nextUi = structuredClone(ui);
        nextUi.gym.lineupFormIds = normalizeGymLineup(
          [...nextUi.gym.lineupFormIds, gymLineupAdd.value],
          gymDefenderFormIds,
          gymDefenderSpeciesByFormId,
        );
        await persistTask("gyms", nextUi);
        rerender("gyms");
        return;
      }
      const instanceCp = target?.closest?.("[data-instance-cp]");
      if (instanceCp && ui.instanceSheet) {
        ui.instanceSheet.draft.cp = instanceCp.value;
        ui.instanceSheet.error = "";
        rerender("more");
        return;
      }
      const instanceIv = target?.closest?.("[data-instance-iv]");
      if (instanceIv && ui.instanceSheet) {
        const raw = instanceIv.value;
        ui.instanceSheet.draft.ivs[instanceIv.dataset.instanceIv] = raw === "" ? "" : Number(raw);
        ui.instanceSheet.error = "";
        rerender("more");
        return;
      }
      const instanceNickname = target?.closest?.("[data-instance-nickname]");
      if (instanceNickname && ui.instanceSheet) {
        ui.instanceSheet.draft.nickname = instanceNickname.value;
        rerender("more");
        return;
      }
      const pvpFilter = target?.closest?.("[data-pvp-filter]");
      if (pvpFilter) {
        const nextUi = structuredClone(ui);
        nextUi.pvp = createPvpState({ filters: { ...nextUi.pvp, [pvpFilter.dataset.pvpFilter]: pvpFilter.value } });
        await persistTask("pvp", nextUi);
        rerender("pvp");
        return;
      }
      const myTeamSlot = target?.closest?.("[data-my-team-slot]");
      if (myTeamSlot) {
        const { myTeamSlot: slot, myTeamLeague: league } = myTeamSlot.dataset;
        await mutateRoster((current) => ({
          ...current,
          preferences: withMyTeamOverride(current.preferences, league, slot, myTeamSlot.value),
        }));
        rerender("pvp");
        return;
      }
      const rosterImport = target?.closest?.('[data-action="roster-import"]')
        ?? (target?.dataset?.action === "roster-import" ? target : null);
      if (rosterImport?.files?.[0]) {
        try {
          const payload = JSON.parse(await rosterImport.files[0].text());
          const validatingStore = rosterStore?.replace
            ? rosterStore
            : { async replace() {} };
          const imported = await importRoster(payload, validFormIds, validatingStore);
          replaceObject(roster, imported);
          const nextUi = createInteractionState({
            roster,
            validFormIds,
            gymDefenderFormIds,
            gymDefenderSpeciesByFormId,
            storage,
          });
          nextUi.moreList = ui.moreList;
          nextUi.installMessage = ui.installMessage;
          nextUi.interactionMessage = ui.interactionMessage;
          nextUi.rosterMessage = `Imported ${roster.ownedFormIds.length} owned forms.`;
          replaceObject(ui, nextUi);
        } catch (error) {
          ui.rosterMessage = `Roster import failed: ${error?.message ?? error}`;
        }
        rerender("more");
      }
      const pokeGenieImport = target?.closest?.('[data-action="poke-genie-import"]')
        ?? (target?.dataset?.action === "poke-genie-import" ? target : null);
      if (pokeGenieImport?.files?.[0]) {
        try {
          const text = await pokeGenieImport.files[0].text();
          const { instances: parsed, errors } = parsePokeGenieCsv(text, forms);
          failureRoute = "more";
          if (parsed.length) {
            await mutateRoster((current) => {
              const owned = new Set(current.ownedFormIds ?? []);
              const counts = { ...(current.ownedFormCounts ?? {}) };
              for (const instance of parsed) {
                owned.add(instance.formId);
                counts[instance.formId] = Math.min(
                  999,
                  (Number.isInteger(counts[instance.formId]) ? counts[instance.formId] : 0) + 1,
                );
              }
              return {
                ...current,
                schemaVersion: 2,
                ownedFormIds: [...owned].sort(),
                ownedFormCounts: Object.fromEntries(
                  Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
                ),
                instances: [...(current.instances ?? []), ...parsed],
              };
            });
          }
          const skipped = errors.length
            ? ` ${errors.length} row${errors.length === 1 ? "" : "s"} skipped: ${errors.slice(0, 3).join(" ")}${errors.length > 3 ? ".." : ""}`
            : "";
          ui.rosterMessage = parsed.length
            ? `Imported ${parsed.length} Pokémon from Poke Genie CSV. Add moves for them via "Add details" on My Roster.${skipped}`
            : `Poke Genie import found nothing to add.${skipped}`;
        } catch (error) {
          ui.rosterMessage = `Poke Genie import failed: ${error?.message ?? error}`;
        }
        rerender("more");
      }
    },
    async handleClick(event) {
      const target = event?.target;
      const moveTrigger = target?.closest?.("[data-move-id]");
      if (moveTrigger) {
        ui.moveSheet = moveTrigger.dataset.moveId;
        rerenderCurrent();
        return;
      }
      const moveSheetClose = target?.closest?.('[data-action="close-move-sheet"]')
        ?? (target?.dataset?.action === "close-move-sheet" ? target : null);
      const moveSheetBackdrop = target?.closest?.("[data-move-sheet-backdrop]");
      if (moveSheetClose || (moveSheetBackdrop && target === moveSheetBackdrop)) {
        ui.moveSheet = null;
        rerenderCurrent();
        return;
      }
      const openInstanceSheet = target?.closest?.("[data-open-instance-sheet-form-id]");
      if (openInstanceSheet) {
        const formId = openInstanceSheet.dataset.openInstanceSheetFormId;
        if (validFormIds.has(formId)) ui.instanceSheet = { formId, draft: blankInstanceDraft(), error: "" };
        rerenderCurrent();
        return;
      }
      const instanceSheetClose = target?.closest?.('[data-action="close-instance-sheet"]')
        ?? (target?.dataset?.action === "close-instance-sheet" ? target : null);
      const instanceSheetBackdrop = target?.closest?.("[data-instance-sheet-backdrop]");
      if (instanceSheetClose || (instanceSheetBackdrop && target === instanceSheetBackdrop)) {
        ui.instanceSheet = null;
        rerenderCurrent();
        return;
      }
      const editInstance = target?.closest?.("[data-edit-instance-id]");
      if (editInstance && ui.instanceSheet) {
        const instance = (roster.instances ?? []).find((row) => row.id === editInstance.dataset.editInstanceId);
        if (instance) ui.instanceSheet = { formId: ui.instanceSheet.formId, draft: draftFromInstance(instance), error: "" };
        rerenderCurrent();
        return;
      }
      const deleteInstance = target?.closest?.("[data-delete-instance-id]");
      if (deleteInstance) {
        const instanceId = deleteInstance.dataset.deleteInstanceId;
        failureRoute = "more";
        await mutateRoster((current) => ({
          ...current,
          instances: (current.instances ?? []).filter((row) => row.id !== instanceId),
        }));
        if (ui.instanceSheet?.draft?.editingId === instanceId) ui.instanceSheet.draft = blankInstanceDraft();
        rerender("more");
        return;
      }
      const fastMoveChip = target?.closest?.("[data-instance-fast-move]");
      if (fastMoveChip && ui.instanceSheet) {
        ui.instanceSheet.draft.fastMove = fastMoveChip.dataset.instanceFastMove;
        ui.instanceSheet.error = "";
        rerenderCurrent();
        return;
      }
      const chargedMoveChip = target?.closest?.("[data-instance-charged-move]");
      if (chargedMoveChip && ui.instanceSheet) {
        const moveId = chargedMoveChip.dataset.instanceChargedMove;
        const selected = new Set(ui.instanceSheet.draft.chargedMoves);
        if (selected.has(moveId)) selected.delete(moveId);
        else if (selected.size < 2) selected.add(moveId);
        ui.instanceSheet.draft.chargedMoves = [...selected];
        ui.instanceSheet.error = "";
        rerenderCurrent();
        return;
      }
      const textSizeControl = target?.closest?.("[data-text-size]");
      if (textSizeControl) {
        const size = saveTextSize(storage, textSizeControl.dataset.textSize);
        applyTextSize(rootElement, size);
        ui.textSize = size;
        rerender("more");
        return;
      }
      const feedbackButton = target?.closest?.("[data-feedback-verdict]");
      if (feedbackButton) {
        const { feedbackSurface, feedbackFormId, feedbackVerdict } = feedbackButton.dataset;
        recordFeedback(storage, feedbackSurface, feedbackFormId, feedbackVerdict);
        ui.interactionMessage = "Thanks for the feedback.";
        rerenderCurrent();
        return;
      }
      const raidView = target?.closest?.("[data-raid-view]");
      if (raidView) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({ ...nextUi.raid, view: raidView.dataset.raidView }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const counterLane = target?.closest?.("[data-counter-lane]");
      if (counterLane) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({ ...nextUi.raid, counterLane: counterLane.dataset.counterLane }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const raidShowAll = target?.closest?.("[data-raid-show-all]");
      if (raidShowAll) {
        const nextUi = structuredClone(ui);
        nextUi.raid = raidState({ ...nextUi.raid, showAll: !nextUi.raid.showAll }, validFormIds);
        await persistTask("raids", nextUi);
        rerender("raids");
        return;
      }
      const ownedControl = target?.closest?.("[data-owned-form-id]");
      if (ownedControl) {
        const formId = ownedControl.dataset.ownedFormId;
        if (!validFormIds.has(formId)) return;
        const toggleOwnedFields = (current) => {
          const owned = new Set(current.ownedFormIds ?? []);
          const counts = { ...(current.ownedFormCounts ?? {}) };
          if (owned.has(formId)) {
            owned.delete(formId);
            delete counts[formId];
          } else {
            owned.add(formId);
            counts[formId] = 1;
          }
          return {
            ownedFormIds: [...owned].sort(),
            ownedFormCounts: Object.fromEntries(
              Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
            ),
          };
        };
        if (ownedControl.dataset.ownedRoute === "search") {
          await mutateRoster((current) => ({ ...current, schemaVersion: 2, ...toggleOwnedFields(current) }));
          searchRefresh();
          return;
        }
        const route = ownedControl.dataset.ownedRoute === "gyms" ? "gyms" : "raids";
        failureRoute = route;
        const nextUi = structuredClone(ui);
        const filters = taskFilters(route, nextUi);
        await mutateRoster((current) => ({
          ...current,
          schemaVersion: 2,
          ...toggleOwnedFields(current),
          preferences: {
            ...(current.preferences ?? {}),
            lastTask: { route, filters },
          },
        }));
        nextUi.lastTask = { route };
        nextUi.interactionMessage = "";
        replaceObject(ui, nextUi);
        rerender(route);
        return;
      }
      const quantityControl = target?.closest?.("[data-roster-quantity-form-id]");
      if (quantityControl) {
        const formId = quantityControl.dataset.rosterQuantityFormId;
        if (!validFormIds.has(formId)) return;
        failureRoute = "more";
        const delta = quantityControl.dataset.direction === "decrease" ? -1 : 1;
        await mutateRoster((current) => {
          const owned = new Set(current.ownedFormIds ?? []);
          const counts = Object.fromEntries([...owned].sort().map((ownedFormId) => [
            ownedFormId,
            Number.isInteger(current.ownedFormCounts?.[ownedFormId])
              ? current.ownedFormCounts[ownedFormId]
              : 1,
          ]));
          const nextCount = Math.max(0, Math.min(999, (counts[formId] ?? 0) + delta));
          if (nextCount === 0) {
            owned.delete(formId);
            delete counts[formId];
          } else {
            owned.add(formId);
            counts[formId] = nextCount;
          }
          return {
            ...current,
            schemaVersion: 2,
            ownedFormIds: [...owned].sort(),
            ownedFormCounts: Object.fromEntries(
              Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
            ),
          };
        });
        ui.rosterMessage = "Roster saved on this device.";
        rerender("more");
        return;
      }
      const lineupControl = target?.closest?.("[data-gym-lineup-form-id]");
      if (lineupControl) {
        const formId = lineupControl.dataset.gymLineupFormId;
        const nextUi = structuredClone(ui);
        const index = nextUi.gym.lineupFormIds.indexOf(formId);
        if (index >= 0) nextUi.gym.lineupFormIds.splice(index, 1);
        else {
          nextUi.gym.lineupFormIds = normalizeGymLineup(
            [...nextUi.gym.lineupFormIds, formId],
            gymDefenderFormIds,
            gymDefenderSpeciesByFormId,
          );
        }
        await persistTask("gyms", nextUi);
        rerender("gyms");
        return;
      }
      const alternative = target?.closest?.("[data-lane][data-direction]")
        ?? (target?.dataset?.lane && target?.dataset?.direction ? target : null);
      if (alternative) {
        const field = alternative.dataset.lane === "owned" ? "ownedIndex" : "overallIndex";
        const nextUi = structuredClone(ui);
        nextUi.gym[field] += alternative.dataset.direction === "previous" ? -1 : 1;
        await persistTask("gyms", nextUi);
        rerender("gyms");
        return;
      }
      const pvpView = target?.closest?.("[data-pvp-view]");
      if (pvpView) {
        const nextUi = structuredClone(ui);
        nextUi.pvp = createPvpState({ filters: { ...nextUi.pvp, view: pvpView.dataset.pvpView } });
        await persistTask("pvp", nextUi);
        rerender("pvp");
        return;
      }
      const swapLeague = target?.closest?.("[data-swap-league]");
      if (swapLeague) {
        ui.swap = setSwapLeague(ui.swap, swapLeague.dataset.swapLeague);
        rerender("swap");
        return;
      }
      const swapManualPick = target?.closest?.("[data-swap-manual-form-id]");
      if (swapManualPick) {
        ui.swap = toggleSwapManualPick(ui.swap, swapManualPick.dataset.swapManualFormId);
        rerender("swap");
        return;
      }
      const swapOpponentPick = target?.closest?.("[data-swap-opponent-form-id]");
      if (swapOpponentPick) {
        ui.swap = selectSwapOpponent(ui.swap, swapOpponentPick.dataset.swapOpponentFormId);
        rerender("swap");
        return;
      }
      const moreList = target?.closest?.("[data-more-list]");
      if (moreList) {
        event.preventDefault?.();
        ui.moreList = moreList.dataset.moreList;
        navigateMore?.(ui.moreList);
        rerender("more");
        return;
      }
      const moreBack = target?.closest?.('a.safe-escape[href="./#more"]');
      if (moreBack && ui.moreList) {
        event.preventDefault?.();
        ui.moreList = null;
        navigateMore?.(null);
        rerender("more");
        return;
      }
      const drillChoice = target?.closest?.("[data-drill-choice]");
      if (drillChoice) {
        const nextUi = structuredClone(ui);
        nextUi.drill = answerDrillQuestion(nextUi.drill, drillChoice.dataset.drillChoice, storage);
        replaceObject(ui, nextUi);
        rerender("drill");
        return;
      }
      const drillNext = target?.closest?.("[data-drill-next]");
      if (drillNext) {
        const nextUi = structuredClone(ui);
        nextUi.drill = advanceDrillQuestion(nextUi.drill);
        replaceObject(ui, nextUi);
        rerender("drill");
        return;
      }
      const drillRestart = target?.closest?.("[data-drill-restart]");
      if (drillRestart) {
        const nextUi = structuredClone(ui);
        nextUi.drill = restartDrillRound(nextUi.drill);
        replaceObject(ui, nextUi);
        rerender("drill");
        return;
      }
      const drillMode = target?.closest?.("[data-drill-mode]");
      if (drillMode) {
        const nextUi = structuredClone(ui);
        nextUi.drill = setDrillMode(nextUi.drill, drillMode.dataset.drillMode);
        replaceObject(ui, nextUi);
        rerender("drill");
        return;
      }
      const actionEl = target?.closest?.("[data-action]");
      const action = actionEl?.dataset?.action;
      if (action === "dismiss-whats-new") {
        const releaseId = actionEl.dataset.releaseId;
        if (releaseId) storage?.setItem?.(whatsNewDismissedKey(releaseId), "1");
        rerender("home");
      } else if (action === "dismiss-start-here") {
        storage?.setItem?.(START_HERE_DISMISSED_KEY, "1");
        rerender("home");
      } else if (action === "apply-update") await releaseManager?.applyUpdate();
      else if (action === "rollback-release") await releaseManager?.rollback();
      else if (action === "check-update") await releaseManager?.initialize();
      else if (action === "install-app") {
        if (installPrompt?.prompt) await installPrompt.prompt();
        else ui.installMessage = "On iPhone, use Share → Add to Home Screen.";
        rerender("more");
      } else if (action === "roster-export") {
        const payload = stableRosterJson(roster);
        (api.onRosterExport ?? onRosterExport)?.(payload);
        rerender("more");
      } else if (action === "toggle-roster-share") {
        ui.rosterShareOpen = !ui.rosterShareOpen;
        rerender("more");
      } else if (action === "copy-roster-share") {
        const payload = stableRosterJson(roster);
        const copied = await (api.onRosterShareCopy ?? onRosterShareCopy)?.(payload);
        ui.rosterMessage = copied
          ? "Copied roster to clipboard."
          : "Could not copy automatically — select and copy the text above.";
        rerender("more");
      } else if (action === "feedback-export") {
        const payload = exportFeedback(storage);
        (api.onFeedbackExport ?? onFeedbackExport)?.(payload);
        rerender("more");
      } else if (action === "cancel-edit-instance") {
        if (ui.instanceSheet) ui.instanceSheet.draft = blankInstanceDraft();
        rerender("more");
      } else if (action === "save-instance") {
        if (ui.instanceSheet) {
          const form = forms[ui.instanceSheet.formId];
          const editingId = ui.instanceSheet.draft.editingId;
          try {
            const instance = buildInstance(form, ui.instanceSheet.draft);
            const original = editingId ? (roster.instances ?? []).find((row) => row.id === editingId) : null;
            const saved = original ? { ...instance, id: original.id, addedAt: original.addedAt } : instance;
            failureRoute = "more";
            await mutateRoster((current) => ({
              ...current,
              instances: [...(current.instances ?? []).filter((row) => row.id !== editingId), saved],
            }));
            ui.instanceSheet.draft = blankInstanceDraft();
            ui.instanceSheet.error = "";
          } catch (error) {
            ui.instanceSheet.error = error?.message ?? String(error);
          }
        }
        rerender("more");
      } else if (action === "swap-continue-team") {
        ui.swap = advanceSwapToOpponent(ui.swap);
        rerender("swap");
      } else if (action === "swap-back-team") {
        event.preventDefault?.();
        ui.swap = backToSwapTeam(ui.swap);
        rerender("swap");
      } else if (action === "swap-back-opponent") {
        event.preventDefault?.();
        ui.swap = backToSwapOpponent(ui.swap);
        rerender("swap");
      } else if (action === "swap-reset") {
        event.preventDefault?.();
        ui.swap = createSwapState();
        rerender("swap");
      }
    },
  };
  let interactionQueue = Promise.resolve();
  for (const name of ["handleChange", "handleClick"]) {
    const handler = api[name];
    api[name] = (...args) => {
      const operation = interactionQueue.then(() => handler.apply(api, args));
      interactionQueue = operation.catch(() => {});
      return operation;
    };
  }
  return api;
}


function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}


function moveWithElite(moveId, elite, kind) {
  return moveLink(moveId, { elite, kind });
}


// "Make it raid-ready": total power-up cost up to Level 40, plus how far walking as a buddy
// stretches the Candy side. This is about the COUNTER Pokemon the player brings to the raid,
// which has nothing to do with the boss's own catch-CP/weather widget above.
// Honesty flag: when the roster has a detailed instance (exact CP/IVs) for this form, its
// derived level replaces the flat "fresh Level 20 catch" guess and the panel says so — the
// upgrade path the flat-assumption ponytail note above used to invite.
function raidReadyPanel(formId, forms, fromLevel, instance) {
  const derivedLevel = instance ? instanceLevel(forms?.[formId], instance) : null;
  const level = derivedLevel ?? fromLevel;
  const { candy, stardust } = powerUpCost(level, 40);
  if (candy === 0 && stardust === 0) {
    return `<div class="raid-ready-panel"><p class="status-kicker">Make it raid-ready</p><p>Already Level 40 — no more power-ups needed.</p></div>`;
  }
  const buddyKm = forms?.[formId]?.buddy_distance_km;
  const levelLine = derivedLevel === null
    ? `Level ${escapeHtml(level)} → 40 (assuming a fresh raid catch)`
    : `Level ${escapeHtml(level)} → 40 (from your saved CP/IVs)`;
  return `<div class="raid-ready-panel">
    <p class="status-kicker">Make it raid-ready</p>
    <p>${levelLine}: <strong>${escapeHtml(candy)} Candy</strong> + <strong>${escapeHtml(stardust.toLocaleString())} Stardust</strong></p>
    ${Number.isInteger(buddyKm) && buddyKm > 0 ? `<p>Walking earns 1 Candy per ${escapeHtml(buddyKm)} km as your buddy.</p>` : ""}
    <p class="raid-ready-note">Stardust is hard to earn back — power up Pokemon you'll use a lot.</p>
    <p class="raid-ready-note">Levels above 40 use XL Candy — not covered here.</p>
  </div>`;
}


// Local-only "did this help?" thumbs — see feedback.js for the store.
function feedbackThumbs(surface, formId) {
  return `<div class="feedback-thumbs" role="group" aria-label="Was this helpful?">
    <span>Helpful?</span>
    <button type="button" data-feedback-surface="${escapeHtml(surface)}" data-feedback-form-id="${escapeHtml(formId)}" data-feedback-verdict="up" aria-label="Yes, this was helpful">👍</button>
    <button type="button" data-feedback-surface="${escapeHtml(surface)}" data-feedback-form-id="${escapeHtml(formId)}" data-feedback-verdict="down" aria-label="No, this was not helpful">👎</button>
  </div>`;
}


function raidCounterCard(row, roster, forms, { fromLevel, budgetPickIds } = {}, bossTypes = []) {
  const owned = (roster.ownedFormIds ?? []).includes(row.formId);
  const ownedCount = owned
    ? (Number.isInteger(roster.ownedFormCounts?.[row.formId]) ? roster.ownedFormCounts[row.formId] : 1)
    : 0;
  const multiplier = Number(row.effectiveness ?? 1);
  const dps = multiplier >= 2.56 ? row.dps?.doubleWeakness
    : multiplier >= 1.6 ? row.dps?.superEffective : row.dps?.neutral;
  const practicalMoves = `${moveWithElite(row.fastMove, row.eliteFastTM, "Fast")} + ${moveWithElite(row.chargedMove, row.eliteChargedTM, "Charged")}`;
  const optimalMoves = `${moveWithElite(row.optimalFastMove, row.optimalEliteFastTM, "Fast")} + ${moveWithElite(row.optimalChargedMove, row.optimalEliteChargedTM, "Charged")}`;
  const movesDisagree = row.fastMove !== row.optimalFastMove
    || row.chargedMove !== row.optimalChargedMove;
  // Real-or-zero: only claim "community pick" when the form is actually on the curated budget-raid
  // list; omit the line entirely rather than infer it from a looser signal like row.budgetValue.
  const because = becauseLine(row.attackingType, bossTypes);
  const isBudgetPick = budgetPickIds?.has(row.formId);
  const bestInstance = bestInstanceForForm(roster.instances ?? [], row.formId);
  return `<li class="raid-card${owned ? " is-owned" : ""}" data-form-id="${escapeHtml(row.formId)}">
    <p class="raid-rank">Type rank #${escapeHtml(row.typeRank ?? row.rank)} · ${escapeHtml(multiplier)}×</p>
    <h4>${escapeHtml(row.pokemon)}</h4>
    ${because ? `<p class="raid-because">${escapeHtml(because)}</p>` : ""}
    <p><strong>Optimal DPS moves:</strong> ${optimalMoves}</p>
    ${movesDisagree ? `<p><strong>Practical moves:</strong> ${practicalMoves}</p>` : ""}
    <p>${Number.isFinite(Number(dps)) ? `${Number(dps).toFixed(2)} standardized DPS` : "DPS unavailable"} · ${escapeHtml(row.investmentTier)}</p>
    <p><strong>Availability:</strong> ${escapeHtml(row.availability ?? "Availability not documented")}</p>
    ${isBudgetPick ? `<p class="budget-verdict">Community pick: strong value</p>` : ""}
    ${raidReadyPanel(row.formId, forms, fromLevel, bestInstance)}
    ${ownedStarButton({ formId: row.formId, name: row.pokemon, owned, route: "raids" })}
    <span class="owned-count">${owned ? `Owned ×${ownedCount}` : "Not owned"}</span>
    ${feedbackThumbs("raid-counter", row.formId)}
  </li>`;
}


// Beginner card: name + availability only, no DPS/move breakdown — the because-line
// lives once on the group header since it's identical for every row in a type group.
function beginnerCounterCard(row, roster) {
  const owned = (roster.ownedFormIds ?? []).includes(row.formId);
  const ownedCount = owned
    ? (Number.isInteger(roster.ownedFormCounts?.[row.formId]) ? roster.ownedFormCounts[row.formId] : 1)
    : 0;
  return `<li class="raid-card${owned ? " is-owned" : ""}" data-form-id="${escapeHtml(row.formId)}">
    <p class="raid-rank">#${escapeHtml(row.typeRank ?? row.rank)}</p>
    <h4>${escapeHtml(row.pokemon)}</h4>
    <p><strong>Availability:</strong> ${escapeHtml(row.availability ?? "Availability not documented")}</p>
    ${ownedStarButton({ formId: row.formId, name: row.pokemon, owned, route: "raids" })}
    <span class="owned-count">${owned ? `Owned ×${ownedCount}` : "Not owned"}</span>
  </li>`;
}


function beginnerCounterGroups(groups, roster, bossTypes, forms = {}, cardOptions = {}) {
  return groups.map(([attackingType, groupRows]) => {
    const because = becauseLine(attackingType, bossTypes);
    return `<div class="raid-type-group">
      <h4>${escapeHtml(attackingType)}</h4>
      ${because ? `<p class="raid-because">${escapeHtml(because)}</p>` : ""}
      <ol class="raid-card-list">${groupRows.map((row) => beginnerCounterCard(row, roster)).join("")}</ol>
    </div>`;
  }).join("");
}


function raidTargetSurface(state, ui, roster) {
  const allTargets = state.raidTargetTool?.targets ?? [];
  const category = allowed(ui.raid.targetCategory, RAID_TARGET_CATEGORY_SET, "all");
  const targets = raidTargetsForCategory(allTargets, state.core?.forms ?? state.forms ?? {}, category);
  if (!targets.some((row) => row.bossFormId === ui.raid.targetFormId)) {
    ui.raid.targetFormId = targets[0]?.bossFormId ?? "";
  }
  if (!ui.raid.targetFormId) return "<p>No raid targets are available in this release.</p>";
  const plan = buildRaidPlan({
    targetFormId: ui.raid.targetFormId,
    observedCp: ui.raid.observedCp,
    encounterLevel: ui.raid.encounterLevel,
    ownedFormIds: roster.ownedFormIds,
  }, state);
  const lanes = {
    regular: ["Regular, Mega & Primal", plan.regularCounters, plan.beginnerRegularGroups],
    shadow: ["Shadows", plan.shadowCounters, plan.beginnerShadowGroups],
    owned: ["Owned counters", plan.ownedCounters, plan.beginnerOwnedGroups],
  };
  const [laneLabel, rows, beginnerGroups] = lanes[ui.raid.counterLane] ?? lanes.regular;
  const bossTypes = plan.target.bossTypes ?? [];
  const forms = state.core?.forms ?? state.forms ?? {};
  const budgetPickIds = new Set((state.budgets?.raid ?? []).map((row) => row.formId));
  // Fresh raid catch (Level 20), independent of the boss's own encounter/weather CP above —
  // that widget verifies the BOSS's catch, not the level of the player's counter Pokemon.
  const cardOptions = { fromLevel: 20, budgetPickIds };
  return `<section class="raid-target-view" aria-labelledby="raid-target-title">
    <h2 id="raid-target-title">Raid Target</h2>
    <div class="pvp-controls">
      <label>Boss category<select data-raid-target-category>${RAID_TARGET_CATEGORIES.map(([value, label]) => option(value, label, category)).join("")}</select></label>
      <label>Exact boss form<select data-raid-target>${targets.map((target) => option(target.bossFormId, target.boss, ui.raid.targetFormId)).join("")}</select></label>
      <label>Encounter level<select data-encounter-level>${option("normal", "Level 20", ui.raid.encounterLevel)}${option("weatherBoosted", "Weather boosted · Level 25", ui.raid.encounterLevel)}</select></label>
      <label>Observed catch CP<input inputmode="numeric" data-observed-cp value="${escapeHtml(ui.raid.observedCp)}"></label>
    </div>
    <div class="raid-boss-summary">
      <p class="raid-boss-heading"><strong>${escapeHtml(plan.target.boss)}</strong> ${bossTypes.map(typeChip).join("")}</p>
      <p class="type-chip-list" aria-label="Boss weaknesses">Weak to: ${plan.weaknesses.length ? plan.weaknesses.map((row) => (
    `<span class="type-weak-badge${row.effectiveness >= 2.56 ? " is-double" : ""}">${typeChip(row.attackingType)}${row.effectiveness >= 2.56 ? "4x" : "2x"}</span>`
  )).join("") : "none documented"}</p>
    </div>
    <p><strong>Level 20 encounter:</strong> 10/10/10 minimum ${escapeHtml(plan.target.normal.minimumRaidIVCP)} · ${jargonTerm("hundo", "hundo")} ${escapeHtml(plan.target.normal.hundoCP)}</p>
    <p><strong>Level 25 weather-boosted encounter:</strong> 10/10/10 minimum ${escapeHtml(plan.target.weatherBoosted.minimumRaidIVCP)} · ${jargonTerm("hundo", "hundo")} ${escapeHtml(plan.target.weatherBoosted.hundoCP)}</p>
    <p><strong>${jargonTerm("weather-boost", "Weather boost")}:</strong> ${escapeHtml(plan.weatherBoostConditions.join(", ") || "No boosting weather documented")}</p>
    <p aria-live="polite">${plan.hundoVerdict.label ? `<strong>${escapeHtml(plan.hundoVerdict.label)}</strong> — ` : ""}${escapeHtml(plan.hundoVerdict.message)}</p>
    ${plan.target.encounterNote ? `<p>${escapeHtml(plan.target.encounterNote)}</p>` : ""}
    <div class="beatability-card" data-beatability-band="${escapeHtml(plan.beatability.band)}">
      <p class="status-kicker">Can we beat this?</p>
      <p class="beatability-headline"><strong>${escapeHtml(plan.beatability.headline)}</strong></p>
      <p>${escapeHtml(plan.beatability.detail)}</p>
      <p class="beatability-caveat">${escapeHtml(plan.beatability.caveat)}</p>
      ${feedbackThumbs("raid-beatability-verdict", plan.target.bossFormId ?? ui.raid.targetFormId)}
    </div>
    <div class="placement-controls" aria-label="Counter lanes">
      ${Object.entries(lanes).map(([lane, [label]]) => `<button type="button" data-counter-lane="${lane}" aria-pressed="${lane === ui.raid.counterLane}">${escapeHtml(label)}</button>`).join("")}
    </div>
    <div class="placement-controls" aria-label="Counter detail level">
      <button type="button" data-raid-show-all aria-pressed="${ui.raid.showAll}">Show all + damage numbers</button>
    </div>
    <h3>${escapeHtml(laneLabel)}</h3>
    ${rows.length ? (ui.raid.showAll
      ? `<ol class="raid-card-list">${rows.map((row) => raidCounterCard(row, roster, forms, cardOptions, bossTypes)).join("")}</ol>`
      : beginnerCounterGroups(beginnerGroups, roster, bossTypes, forms, cardOptions)) : (ui.raid.counterLane === "owned"
      ? "<p>Star Pokémon you own and this fills in with your best raid team.</p>"
      : "<p>No owned qualifying counter is marked yet.</p>")}
    <p class="raid-method-note">${escapeHtml(plan.caveat)}</p>
  </section>`;
}


function renderRaidSurface(state, ui, roster) {
  const controls = `<div class="pvp-controls" aria-label="Raid tools">
    <label>Attacking type<select data-raid-type>${ATTACK_TYPES.map((type) => option(type, type, ui.raid.attackingType)).join("")}</select></label>
    <fieldset><legend>Raid view</legend>
      <button type="button" data-raid-view="rankings" aria-pressed="${ui.raid.view === "rankings"}">Top 15 by type</button>
      <button type="button" data-raid-view="target" aria-pressed="${ui.raid.view === "target"}">Raid Target</button>
    </fieldset>
  </div>`;
  return `<div class="raids-view">${controls}${ui.raid.view === "target"
    ? raidTargetSurface(state, ui, roster)
    : renderRaids({ attackingType: ui.raid.attackingType, raids: state.raids, forms: state.core.forms })}</div>`;
}


function gymLineupControls(state, ui) {
  const defenders = state.gym?.defenders ?? [];
  const eligible = gymEligibleDefenderForms(state.core?.forms ?? {});
  const selected = ui.gym.lineupFormIds.map((formId) => state.core.forms[formId]?.name ?? formId);
  const selectedSpecies = new Set(ui.gym.lineupFormIds.map(
    (formId) => state.core.forms[formId]?.dex ?? formId,
  ));
  const atCapacity = ui.gym.lineupFormIds.length >= 6;
  return `<section class="gym-section" aria-labelledby="gym-lineup-control-title">
    <p class="status-kicker">Tap in placement order</p><h2 id="gym-lineup-control-title">Defenders already in the gym</h2>
    <p>${selected.length ? escapeHtml(selected.join(" → ")) : "No defenders selected yet."}</p>
    <p>Up to six defenders; Pokémon GO permits only one form of a species in the same gym.</p>
    <label class="gym-lineup-picker">Add any eligible defender
      <select data-gym-lineup-add><option value="">Choose a Pokémon…</option>${eligible.map((form) => {
        const disabled = atCapacity || selectedSpecies.has(form.dex);
        return `<option value="${escapeHtml(form.form_id)}"${disabled ? " disabled" : ""}>${escapeHtml(form.name)}</option>`;
      }).join("")}</select>
    </label>
    ${selected.length ? `<div class="placement-controls" aria-label="Selected defenders">${ui.gym.lineupFormIds.map((formId) => `<button type="button" data-gym-lineup-form-id="${escapeHtml(formId)}" aria-pressed="true">Remove ${escapeHtml(state.core.forms[formId]?.name ?? formId)}</button>`).join("")}</div>` : ""}
    <details><summary>Quick add common defenders</summary><div class="placement-controls">${defenders.map((row) => {
      const active = ui.gym.lineupFormIds.includes(row.formId);
      return `<button type="button" data-gym-lineup-form-id="${escapeHtml(row.formId)}" aria-pressed="${active}">${active ? "Remove" : "Add"} ${escapeHtml(row.pokemon)}</button>`;
    }).join("")}</div></details>
  </section>`;
}


function interactionNotice(ui) {
  const messages = [ui.installMessage, ui.rosterMessage, ui.interactionMessage].filter(Boolean);
  return messages.length ? `<aside class="fallback-section" aria-live="polite">${messages.map(escapeHtml).join(" · ")}</aside>` : "";
}


function continueTaskFor(state, ui) {
  const route = ui.lastTask?.route;
  if (route === "raids") {
    const target = (state.raidTargetTool?.targets ?? [])
      .find((row) => row.bossFormId === ui.raid.targetFormId);
    return {
      route,
      label: ui.raid.view === "target" ? "Continue Raid Target" : "Continue Raid Rankings",
      detail: ui.raid.view === "target"
        ? `${target?.boss ?? "Saved raid target"} · ${ui.raid.counterLane} counters`
        : `${ui.raid.attackingType} attackers · ${ui.raid.counterLane} lane`,
    };
  }
  if (route === "gyms") {
    const count = ui.gym.lineupFormIds.length;
    return {
      route,
      label: "Continue Gym Plan",
      detail: `${count} defender${count === 1 ? "" : "s"} selected · owned and overall lanes`,
    };
  }
  if (route === "pvp") {
    const league = ui.pvp.league === "all"
      ? "All leagues"
      : `${ui.pvp.league[0].toUpperCase()}${ui.pvp.league.slice(1)} League`;
    return {
      route,
      label: "Continue PvP",
      detail: `${league} · ${ui.pvp.form} forms · ${ui.pvp.view}`,
    };
  }
  return null;
}


function bindInteractions(app, controller) {
  if (typeof app?.addEventListener !== "function") return () => {};
  const delegate = (operation) => {
    void Promise.resolve().then(operation).catch((error) => controller.handleFailure(error));
  };
  const onClick = (event) => delegate(() => controller.handleClick(event));
  const onChange = (event) => delegate(() => controller.handleChange(event));
  const onInput = (event) => controller.handleInput(event);
  app.addEventListener("click", onClick);
  app.addEventListener("change", onChange);
  app.addEventListener("input", onInput);
  // "error" does not bubble, so this must be a capturing listener; it swaps
  // any broken sprite <img> for its fallback circle without inline JS.
  app.addEventListener("error", handleSpriteError, true);
  return () => {
    app.removeEventListener?.("click", onClick);
    app.removeEventListener?.("change", onChange);
    app.removeEventListener?.("input", onInput);
    app.removeEventListener?.("error", handleSpriteError, true);
  };
}


export function bootstrap({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  state = windowObject?.__FIELD_GUIDE_STATE__,
  roster = { schemaVersion: 2, ownedFormIds: [], ownedFormCounts: {}, favorites: [], preferences: {} },
  releaseState = {},
  releaseManager = null,
  rosterStore = null,
  uiState = null,
  installPrompt = null,
} = {}) {
  const app = documentObject?.getElementById?.("app");
  if (!app || !windowObject || !usableState(state)) {
    return { status: "fallback", router: null };
  }

  const fallbackSections = Object.fromEntries(ROUTES.map((route) => {
    const section = documentObject.getElementById(route);
    return [route, section?.outerHTML ?? ""];
  }));
  const index = buildSearchIndex({
    ...state.core,
    raidTargetTool: state.raidTargetTool,
  });
  const validFormIds = new Set(Object.keys(state.core.forms));
  const gymDefenderForms = gymEligibleDefenderForms(state.core.forms);
  const gymDefenderFormIds = new Set(gymDefenderForms.map((form) => form.form_id));
  const gymDefenderSpeciesByFormId = new Map(
    gymDefenderForms.map((form) => [form.form_id, form.dex]),
  );
  const storage = windowObject.localStorage ?? null;
  const ui = uiState ?? createInteractionState({
    roster,
    validFormIds,
    gymDefenderFormIds,
    gymDefenderSpeciesByFormId,
    storage,
  });
  applyTextSize(documentObject.documentElement, ui.textSize);
  const moveCatalog = state.core.methodology?.raidDps?.moveCatalog ?? {};
  const moveIndex = buildMoveIndex(state.raids, state.pvp);
  let controller;
  let searchRefresh = () => {};
  let currentRoute = "home";
  const renderers = {
    home() {
      app.innerHTML = interactionNotice(ui) + renderHome({
        cutoff: state.core.meta?.asOf,
        offlineStatus: state.offlineStatus ?? offlineLabel(releaseState),
        updateStatus: state.updateStatus ?? releaseLabel(releaseState),
        continueTask: continueTaskFor(state, ui),
        currentBosses: state.currentBosses,
        currentEvents: state.currentEvents,
        raidTargetTool: state.raidTargetTool,
        forms: state.core.forms,
        whatsNew: whatsNewCard(releaseState, storage),
        showStartHere: showStartHere(storage),
      });
      searchRefresh = bindSearch(documentObject, index, state.core.forms, roster);
    },
    basics() {
      app.innerHTML = renderBasics();
    },
    types() {
      app.innerHTML = renderTypes();
    },
    glossary() {
      app.innerHTML = renderGlossary();
    },
    drill() {
      app.innerHTML = renderDrill(ui.drill);
    },
    raids() {
      const bossParam = new URLSearchParams(windowObject.location?.search ?? "").get("boss");
      if (bossParam && validFormIds.has(bossParam)) {
        ui.raid.targetFormId = bossParam;
        ui.raid.view = "target";
        // Consume the deep-link param once so later re-renders (e.g. picking a
        // different boss target) aren't silently overridden back to it.
        const url = new URL(windowObject.location.href);
        url.searchParams.delete("boss");
        windowObject.history.replaceState({}, "", url.href);
      }
      app.innerHTML = interactionNotice(ui) + (state.raids && state.raidTargetTool
        ? renderRaidSurface(state, ui, roster)
        : fallbackSections.raids);
    },
    gyms() {
      const placementState = { ...state, lineupFormIds: ui.gym.lineupFormIds };
      app.innerHTML = interactionNotice(ui) + (state.gym
        ? `${gymLineupControls(state, ui)}${renderGyms({
          gym: state.gym,
          forms: state.core.forms,
          placementResult: placementFor(placementState, roster),
          ownedFormIds: roster.ownedFormIds,
          ownedIndex: ui.gym.ownedIndex,
          overallIndex: ui.gym.overallIndex,
        })}`
        : fallbackSections.gyms);
    },
    pvp() {
      app.innerHTML = interactionNotice(ui) + (state.pvp
        ? renderPvp({
          pvp: state.pvp, pvpTeams: state.pvpTeams,
          pvpAlternatives: state.pvpAlternatives, forms: state.core.forms,
          roster, state: ui.pvp,
        })
        : fallbackSections.pvp);
    },
    swap() {
      app.innerHTML = interactionNotice(ui) + (state.pvp
        ? renderSwap({
          pvp: state.pvp, pvpTeams: state.pvpTeams, forms: state.core.forms,
          roster, state: ui.swap, moveCatalog,
        })
        : fallbackSections.swap);
    },
    coach() {
      app.innerHTML = interactionNotice(ui) + renderCoach({ data: state, roster });
    },
    more() {
      app.innerHTML = renderMore({
        ...state.core,
        budgets: state.budgets,
        megasPrimals: state.megasPrimals,
        futureProof: state.futureProof,
        coveragePlanner: state.coveragePlanner,
        listId: ui.moreList ?? new URLSearchParams(windowObject.location?.search ?? "").get("list"),
        roster,
        rosterQuery: ui.rosterQuery,
        rosterShareOpen: ui.rosterShareOpen,
        textSize: ui.textSize,
        release: releaseView(releaseState),
        update: { ...releaseState, label: releaseLabel(releaseState) },
      }) + interactionNotice(ui);
    },
  };
  for (const route of Object.keys(renderers)) {
    const base = renderers[route];
    renderers[route] = () => {
      currentRoute = route;
      base();
      if (ui.moveSheet) {
        app.innerHTML += renderMoveSheet({
          moveId: ui.moveSheet,
          catalog: moveCatalog,
          moveIndex,
          roster,
          forms: state.core.forms,
        });
      }
      if (ui.instanceSheet) {
        app.innerHTML += renderInstanceSheet({
          form: state.core.forms[ui.instanceSheet.formId],
          instances: roster.instances ?? [],
          draft: ui.instanceSheet.draft,
          error: ui.instanceSheet.error,
        });
      }
    };
  }
  const router = createRouter({
    basePath: basePathFrom(windowObject.location),
    renderers,
    windowObject,
    documentObject,
  });
  controller = createInteractionController({
    ui,
    roster,
    rosterStore,
    validFormIds,
    forms: state.core.forms,
    gymDefenderFormIds,
    gymDefenderSpeciesByFormId,
    releaseManager,
    installPrompt,
    renderRoute(route) { renderers[route]?.(); },
    navigateMore(listId) {
      const url = new URL(windowObject.location.href);
      if (listId) url.searchParams.set("list", listId);
      else url.searchParams.delete("list");
      url.hash = "more";
      windowObject.history.pushState({}, "", url.href);
    },
    onRosterExport(payload) {
      downloadFile("pokemon-go-field-guide-roster.json", payload, { documentObject, windowObject });
    },
    onFeedbackExport(payload) {
      downloadFile("pokemon-go-field-guide-feedback.json", payload, { documentObject, windowObject });
    },
    async onRosterShareCopy(payload) {
      const clipboard = windowObject.navigator?.clipboard;
      if (!clipboard?.writeText) return false;
      try {
        await clipboard.writeText(payload);
        return true;
      } catch {
        return false;
      }
    },
    searchRefresh: () => searchRefresh(),
    rerenderCurrent: () => renderers[currentRoute]?.(),
    rootElement: documentObject.documentElement,
    storage,
  });
  router.start();
  const stopInteractions = bindInteractions(app, controller);
  return { status: "ready", router, searchIndex: index, controller, ui, stopInteractions };
}


export async function startFieldGuide({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  releaseManager = new ReleaseManager({ baseUrl: windowObject?.location?.href ?? "./" }),
  rosterStore = null,
} = {}) {
  const root = documentObject?.documentElement;
  root?.setAttribute?.("data-offline-ready", "false");
  let active = null;
  let roster = {
    schemaVersion: 2, ownedFormIds: [], ownedFormCounts: {}, favorites: [], preferences: {},
  };
  const ui = createInteractionState({ roster, storage: windowObject?.localStorage ?? null });
  let store = rosterStore;
  releaseManager.subscribe((releaseState) => {
    root?.setAttribute?.("data-offline-ready", releaseState.offlineReady ? "true" : "false");
    if (!releaseState.data) return;
    active?.router?.stop?.();
    active?.stopInteractions?.();
    active = bootstrap({
      windowObject,
      documentObject,
      state: { core: releaseState.data, ...releaseState.data },
      roster,
      releaseState,
      releaseManager,
      rosterStore: store,
      uiState: ui,
    });
  });
  const releaseState = await releaseManager.initialize();
  if (releaseState.data) {
    try {
      store = store ?? createIndexedDbAdapter();
      roster = await loadRoster(store);
      const gymDefenderForms = gymEligibleDefenderForms(releaseState.data.forms ?? {});
      replaceObject(ui, createInteractionState({
        roster,
        validFormIds: new Set(Object.keys(releaseState.data.forms ?? {})),
        gymDefenderFormIds: new Set(gymDefenderForms.map((form) => form.form_id)),
        gymDefenderSpeciesByFormId: new Map(
          gymDefenderForms.map((form) => [form.form_id, form.dex]),
        ),
        storage: windowObject?.localStorage ?? null,
      }));
      active?.router?.stop?.();
      active?.stopInteractions?.();
      active = bootstrap({
        windowObject,
        documentObject,
        state: { core: releaseState.data, ...releaseState.data },
        roster,
        releaseState,
        releaseManager,
        rosterStore: store,
        uiState: ui,
      });
    } catch {
      // Roster failure must not replace a usable guide with an empty shell.
    }
  }
  return { releaseManager, releaseState, app: active };
}


if (typeof window !== "undefined" && typeof document !== "undefined") {
  void startFieldGuide();
}
