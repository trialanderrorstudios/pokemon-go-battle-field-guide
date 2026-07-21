import { createRouter, ROUTES } from "./router.js";
import { ReleaseManager } from "./release-manager.js";
import { ATTACK_TYPES, buildRaidPlan } from "./raid-target.js";
import { buildSearchIndex, search } from "./search.js";
import {
  createIndexedDbAdapter,
  importRoster,
  loadRoster,
} from "./storage.js";
import { scorePlacement } from "./placement.js";
import { escapeHtml, renderHome } from "./views/home.js";
import { renderGyms } from "./views/gyms.js";
import { renderMore } from "./views/more.js";
import { createPvpState, renderPvp } from "./views/pvp.js";
import { renderRaids } from "./views/raids.js";


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


function renderSearchResults(results) {
  if (!results.length) return "<p>No local matches.</p>";
  return `<ul>${results.slice(0, 10).map((result) => (
    `<li><strong>${escapeHtml(result.name)}</strong> <span>${escapeHtml(result.resultCategory)}</span></li>`
  )).join("")}</ul>`;
}


function bindSearch(documentObject, index) {
  const form = documentObject.querySelector("[data-global-search]");
  const input = form?.querySelector("input[type='search']");
  const output = form?.querySelector("[data-search-results]");
  if (!input || !output) return;
  input.addEventListener("input", () => {
    output.innerHTML = input.value.trim()
      ? renderSearchResults(search(index, input.value))
      : "";
  });
}


function releaseLabel(releaseState = {}) {
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
    releaseNotes: manifest.releaseNotes,
    doClaim: manifest.doClaim,
    doNotClaim: manifest.doNotClaim,
  } : null;
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


function stableRosterJson(roster) {
  const ownedFormIds = [...(roster.ownedFormIds ?? [])].sort();
  const ownedFormCounts = Object.fromEntries(ownedFormIds.map((formId) => [
    formId,
    Number.isInteger(roster.ownedFormCounts?.[formId]) && roster.ownedFormCounts[formId] > 0
      ? roster.ownedFormCounts[formId]
      : 1,
  ]));
  return `${JSON.stringify({
    schemaVersion: 2,
    ownedFormIds,
    ownedFormCounts,
    favorites: [...(roster.favorites ?? [])].sort(),
    preferences: roster.preferences ?? {},
  })}\n`;
}


function downloadRoster(payload, { documentObject, windowObject }) {
  if (!documentObject?.createElement || !windowObject?.URL?.createObjectURL || typeof Blob === "undefined") return;
  const url = windowObject.URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = documentObject.createElement("a");
  link.href = url;
  link.download = "pokemon-go-field-guide-roster.json";
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


export function createInteractionState({
  roster = {},
  validFormIds = null,
  gymDefenderFormIds = validFormIds,
  gymDefenderSpeciesByFormId = null,
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
    lastTask: savedTask ? { route: savedTask.route } : null,
    moreList: null,
    installMessage: "",
    rosterMessage: "",
    rosterQuery: "",
    interactionMessage: "",
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
  gymDefenderFormIds = validFormIds,
  gymDefenderSpeciesByFormId = null,
  renderRoute = () => {},
  releaseManager = null,
  navigateMore = null,
  installPrompt = null,
  onRosterExport = null,
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
    handleFailure(error) {
      ui.interactionMessage = `Could not save changes: ${error?.message ?? error}`;
      rerender(failureRoute);
    },
    handleInput(event) {
      const rosterSearch = event?.target?.closest?.("[data-roster-search]");
      if (!rosterSearch) return;
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
      const pvpFilter = target?.closest?.("[data-pvp-filter]");
      if (pvpFilter) {
        const nextUi = structuredClone(ui);
        nextUi.pvp = createPvpState({ filters: { ...nextUi.pvp, [pvpFilter.dataset.pvpFilter]: pvpFilter.value } });
        await persistTask("pvp", nextUi);
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
    },
    async handleClick(event) {
      const target = event?.target;
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
      const ownedControl = target?.closest?.("[data-owned-form-id]");
      if (ownedControl) {
        const formId = ownedControl.dataset.ownedFormId;
        if (!validFormIds.has(formId)) return;
        const route = ownedControl.dataset.ownedRoute === "gyms" ? "gyms" : "raids";
        failureRoute = route;
        const nextUi = structuredClone(ui);
        const filters = taskFilters(route, nextUi);
        await mutateRoster((current) => {
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
            ...current,
            schemaVersion: 2,
            ownedFormIds: [...owned].sort(),
            ownedFormCounts: Object.fromEntries(
              Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
            ),
            preferences: {
              ...(current.preferences ?? {}),
              lastTask: { route, filters },
            },
          };
        });
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
      const action = target?.closest?.("[data-action]")?.dataset?.action;
      if (action === "apply-update") await releaseManager?.applyUpdate();
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


function displayMove(moveId) {
  return String(moveId ?? "Unknown move").toLowerCase().split("_")
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "").join(" ");
}


function moveWithElite(moveId, elite, kind) {
  return `${escapeHtml(displayMove(moveId))}${elite ? ` <small class="elite-tm">Elite ${escapeHtml(kind)} TM</small>` : ""}`;
}


function raidCounterCard(row, roster) {
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
  return `<li class="raid-card" data-form-id="${escapeHtml(row.formId)}">
    <p class="raid-rank">Type rank #${escapeHtml(row.typeRank ?? row.rank)} · ${escapeHtml(multiplier)}×</p>
    <h4>${escapeHtml(row.pokemon)}</h4>
    <p><strong>Optimal DPS moves:</strong> ${optimalMoves}</p>
    ${movesDisagree ? `<p><strong>Practical moves:</strong> ${practicalMoves}</p>` : ""}
    <p>${Number.isFinite(Number(dps)) ? `${Number(dps).toFixed(2)} standardized DPS` : "DPS unavailable"} · ${escapeHtml(row.investmentTier)}</p>
    <p><strong>Availability:</strong> ${escapeHtml(row.availability ?? "Availability not documented")}</p>
    <button type="button" data-owned-form-id="${escapeHtml(row.formId)}" aria-pressed="${owned}">${owned ? `Owned ×${ownedCount} · Remove all copies` : "Mark one owned"}</button>
  </li>`;
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
    regular: ["Regular, Mega & Primal", plan.regularCounters],
    shadow: ["Shadows", plan.shadowCounters],
    owned: ["Owned counters", plan.ownedCounters],
  };
  const [laneLabel, rows] = lanes[ui.raid.counterLane] ?? lanes.regular;
  return `<section class="raid-target-view" aria-labelledby="raid-target-title">
    <h2 id="raid-target-title">Raid Target</h2>
    <div class="pvp-controls">
      <label>Boss category<select data-raid-target-category>${RAID_TARGET_CATEGORIES.map(([value, label]) => option(value, label, category)).join("")}</select></label>
      <label>Exact boss form<select data-raid-target>${targets.map((target) => option(target.bossFormId, target.boss, ui.raid.targetFormId)).join("")}</select></label>
      <label>Encounter level<select data-encounter-level>${option("normal", "Level 20", ui.raid.encounterLevel)}${option("weatherBoosted", "Weather boosted · Level 25", ui.raid.encounterLevel)}</select></label>
      <label>Observed catch CP<input inputmode="numeric" data-observed-cp value="${escapeHtml(ui.raid.observedCp)}"></label>
    </div>
    <p><strong>${escapeHtml(plan.target.boss)}</strong> · ${escapeHtml((plan.target.bossTypes ?? []).join(" / "))}</p>
    <p><strong>Level 20 encounter:</strong> 10/10/10 minimum ${escapeHtml(plan.target.normal.minimumRaidIVCP)} · hundo ${escapeHtml(plan.target.normal.hundoCP)}</p>
    <p><strong>Level 25 weather-boosted encounter:</strong> 10/10/10 minimum ${escapeHtml(plan.target.weatherBoosted.minimumRaidIVCP)} · hundo ${escapeHtml(plan.target.weatherBoosted.hundoCP)}</p>
    <p><strong>Weather boost:</strong> ${escapeHtml(plan.weatherBoostConditions.join(", ") || "No boosting weather documented")}</p>
    <p aria-live="polite">${escapeHtml(plan.hundoVerdict.message)}</p>
    ${plan.target.encounterNote ? `<p>${escapeHtml(plan.target.encounterNote)}</p>` : ""}
    <div class="placement-controls" aria-label="Counter lanes">
      ${Object.entries(lanes).map(([lane, [label]]) => `<button type="button" data-counter-lane="${lane}" aria-pressed="${lane === ui.raid.counterLane}">${escapeHtml(label)}</button>`).join("")}
    </div>
    <h3>${escapeHtml(laneLabel)}</h3>
    ${rows.length ? `<ol class="raid-card-list">${rows.map((row) => raidCounterCard(row, roster)).join("")}</ol>` : "<p>No owned qualifying counter is marked yet.</p>"}
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
    : renderRaids({ attackingType: ui.raid.attackingType, raids: state.raids })}</div>`;
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
  return () => {
    app.removeEventListener?.("click", onClick);
    app.removeEventListener?.("change", onChange);
    app.removeEventListener?.("input", onInput);
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
  const ui = uiState ?? createInteractionState({
    roster,
    validFormIds,
    gymDefenderFormIds,
    gymDefenderSpeciesByFormId,
  });
  let controller;
  const renderers = {
    home() {
      app.innerHTML = interactionNotice(ui) + renderHome({
        cutoff: state.core.meta?.asOf,
        offlineStatus: state.offlineStatus ?? offlineLabel(releaseState),
        updateStatus: state.updateStatus ?? releaseLabel(releaseState),
        continueTask: continueTaskFor(state, ui),
      });
      bindSearch(documentObject, index);
    },
    raids() {
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
          pvp: state.pvp, pvpTeams: state.pvpTeams, forms: state.core.forms,
          state: ui.pvp,
        })
        : fallbackSections.pvp);
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
        release: releaseView(releaseState),
        update: { ...releaseState, label: releaseLabel(releaseState) },
      }) + interactionNotice(ui);
    },
  };
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
      downloadRoster(payload, { documentObject, windowObject });
    },
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
  const ui = createInteractionState({ roster });
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
