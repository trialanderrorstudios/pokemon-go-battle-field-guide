import { createRouter, ROUTES } from "./router.js";
import { APP_SHELL_REVISION, ReleaseManager } from "./release-manager.js";
import { ATTACK_TYPES, WEATHERS, becauseLine, buildRaidPlan, loadWeather, powerUpCost, saveWeather } from "./raid-target.js";
import {
  buildSearchIndex, loadRecentSearches, removeRecentSearch, saveRecentSearch, search,
} from "./search.js";
import {
  ROSTER_SCHEMA,
  createIndexedDbAdapter,
  importRoster,
  loadRoster,
  loadTrainerProfile,
  saveTrainerProfile,
  stableRosterJson,
} from "./storage.js";
import { scorePlacement } from "./placement.js";
import { jargonTerm } from "./glossary.js";
import { dismissGuide, renderGuide, showGuide } from "./guide.js";
import { escapeHtml, ownedStarButton, renderHome } from "./views/home.js";
import { renderBasics } from "./views/basics.js";
import { renderMaxBasics } from "./views/maxbasics.js";
import { renderTypes, typeChip } from "./views/types.js";
import { renderGlossary } from "./views/glossary.js";
import { handleSpriteError, spriteHtml } from "./sprites.js";
import { renderGyms } from "./views/gyms.js";
import { renderMore } from "./views/more.js";
import { buildMoveIndex } from "./moves.js";
import { moveLink, renderMoveSheet } from "./views/move-sheet.js";
import { renderInstanceSheet } from "./views/instance-sheet.js";
import { STANDARD_TARGET_DEFENSE, instanceBreakpointReports } from "./breakpoints.js";
import {
  bestInstanceForForm, buildInstance, instanceLevel, reviseInstanceCp,
} from "./instances.js";
import { parsePokeGenieCsv } from "./poke-genie-import.js";
import {
  buildLeaderboard,
  completeDefense,
  deleteDefenseEntry,
  exportPlayerLog,
  importPlayerLog,
  loadDefenseLog,
  saveDefenseLog,
  setLocalPlayerName,
  startDefense,
} from "./gym-defense-log.js";
import { gymDefenseCardData, instanceCardData, shareOrDownloadCard, triageSummaryCardData } from "./share-card.js";
import {
  buildDeploymentMap,
  findNearestCachedGym,
  getCachedGymCoords,
  getRecentGymNames,
  getTopAvailableDefender,
  setCachedGymCoords,
  speciesDefendingGym,
} from "./gym-availability.js";
import {
  affordability,
  clearCandyCount,
  clearMegaEnergyCount,
  clearStardust,
  loadCandyInventory,
  loadMegaEnergyInventory,
  loadStardust,
  saveStardust,
  setCandyCount,
  setMegaEnergyCount,
} from "./resource-inventory.js";
import {
  exportFeedback, loadFeedback, recordFeedback, saveFeedback,
} from "./feedback.js";
import { applyTextSize, loadTextSize, saveTextSize } from "./text-size.js";
import { clearDiagnostics, exportDiagnostics, installDiagnosticsCapture, loadDiagnostics } from "./diagnostics.js";
import { applyTheme, loadTheme, saveTheme } from "./theme.js";
import {
  buildBackupEnvelope,
  mergeBackupPayload,
  parseBackupEnvelope,
  recordBackupNow,
  replaceBackupPayload,
  shouldShowBackupNudge,
  snoozeBackupNudge,
  stableBackupJson,
  summarizeBackup,
} from "./backup.js";
import { createPvpState, renderPvp } from "./views/pvp.js";
import { withMyTeamOverride } from "./pvp-team.js";
import { renderRaids } from "./views/raids.js";
import {
  advanceDrillQuestion,
  answerDrillQuestion,
  createDrillState,
  loadDrillStats,
  restartDrillRound,
  saveDrillStats,
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
import { renderToday, toggleTodayTask } from "./views/today.js";
import { renderEggs } from "./views/eggs.js";
import { triageRoster } from "./triage.js";
import {
  advanceTriageView,
  candyTransferText,
  createTriageViewState,
  renderTriage,
  retreatTriageView,
  setTriageFilter,
} from "./views/triage.js";


function usableState(state) {
  return state
    && typeof state === "object"
    && state.core
    && typeof state.core === "object"
    && state.core.forms
    && typeof state.core.forms === "object";
}


// Route -> release file paths (release-manager.js loadReleaseFiles paths)
// that route's data depends on. core.json loads eagerly for every route
// (forms/meta/methodology); everything below loads lazily on first visit to
// a route that needs it, then stays cached in memory for the session. Routes
// not listed here (basics/maxbasics/types/glossary/drill) render from static
// copy only and never touch release chunk data.
export const ROUTE_CHUNKS = Object.freeze({
  home: ["raid-targets.json", "current-bosses.json", "current-events.json"],
  raids: ["raids.json", "raid-targets.json"],
  gyms: ["gyms.json"],
  pvp: ["pvp.json"],
  swap: ["pvp.json"],
  coach: ["raid-targets.json", "current-bosses.json", "current-events.json", "extras.json", "pvp.json"],
  // Today composes the same feeds Coach does (events + buildCoachSummary),
  // so it waits on the same chunk set — a checklist built from partial data
  // would confidently tell the user "nothing on today".
  today: ["raid-targets.json", "current-bosses.json", "current-events.json", "extras.json", "pvp.json"],
  // gyms.json: ranked defenders are a KEEP signal — without it triage marks
  // Blissey-class walls as transfer candy (operator-reported 2026-07-23).
  triage: ["raids.json", "pvp.json", "extras.json", "gyms.json"],
  more: ["extras.json"],
  eggs: ["current-eggs.json"],
});

export function chunksNeededFor(route, loadedChunkPaths) {
  return (ROUTE_CHUNKS[route] ?? []).filter((path) => !loadedChunkPaths.has(path));
}

export function routeChunksReady(route, loadedChunkPaths) {
  return (ROUTE_CHUNKS[route] ?? []).every((path) => loadedChunkPaths.has(path));
}


// Mirrors pwa.py's VIEW_KEYS: which top-level `state` fields each release
// file's data lands as, once merged in.
const CHUNK_FIELDS = Object.freeze({
  "raids.json": ["raids"],
  "raid-targets.json": ["raidTargetTool"],
  "gyms.json": ["gym", "placement"],
  "pvp.json": ["pvp", "pvpTeams", "pvpAlternatives"],
  "extras.json": ["budgets", "megasPrimals", "futureProof", "coveragePlanner"],
  "current-bosses.json": ["currentBosses"],
  "current-events.json": ["currentEvents"],
  "current-eggs.json": ["currentEggs"],
});

// bootstrap()'s default for loadedChunkPaths when a caller (a test, or any
// direct bootstrap() call outside startFieldGuide's own explicit tracking)
// hands it an already-fully-populated `state` object: infer which chunks are
// "loaded" from which fields are actually present, so pre-existing callers
// that build a complete fixture state don't have to know this mechanism
// exists. startFieldGuide always threads its own real fetch-tracked Set
// instead, which is the only way to know an *optional* file (current-bosses/
// current-events) was fetched-and-genuinely-absent rather than never tried.
export function inferChunkPaths(state) {
  const loaded = new Set(["core.json"]);
  for (const [path, fields] of Object.entries(CHUNK_FIELDS)) {
    if (fields.some((field) => Object.hasOwn(state ?? {}, field))) loaded.add(path);
  }
  return loaded;
}


// Owns the route-driven lazy chunk fetch/merge: which release files are
// loaded so far for the current release, and fetching a route's missing
// ones on first visit. Standalone (no DOM) so it's unit-testable directly;
// startFieldGuide is the only caller and supplies the re-render side effect.
export function createRouteChunkLoader({ releaseManager, getReleaseState, onChunksLoaded = () => {} }) {
  // Two sets, deliberately not one: `claimedChunkPaths` dedups in-flight
  // fetches (a path is claimed the instant a fetch starts); `loadedChunkPaths`
  // is the honesty gate bootstrap()'s routeChunksReady() renders off, and only
  // gains a path once its data has actually landed in extraChunkData. A
  // second visit to the same route while the first fetch is still in flight
  // must see the path as claimed (skip a duplicate fetch) but NOT loaded
  // (skip rendering data that isn't in `state` yet) — conflating the two into
  // one Set let that second visit render a full view off absent data.
  let claimedChunkPaths = new Set(["core.json"]);
  let loadedChunkPaths = new Set(["core.json"]);
  let extraChunkData = {};
  return {
    // Call whenever a wholesale-new releaseState.data lands (install/update/
    // rollback) — chunk data belongs to one specific release and must never
    // leak across a release change.
    reset() {
      claimedChunkPaths = new Set(["core.json"]);
      loadedChunkPaths = new Set(["core.json"]);
      extraChunkData = {};
    },
    get loadedChunkPaths() { return loadedChunkPaths; },
    get extraChunkData() { return extraChunkData; },
    async ensureRouteChunks(route) {
      const releaseState = getReleaseState();
      const manifest = releaseState?.manifest;
      if (!manifest) return;
      const requestReleaseId = manifest.releaseId;
      const missing = chunksNeededFor(route, claimedChunkPaths);
      if (!missing.length) return;
      // Claim immediately so a second visit to the same (or another route
      // needing an overlapping file) while this fetch is in flight doesn't
      // start a duplicate request; a failure below releases the claim so
      // the next visit retries.
      for (const path of missing) claimedChunkPaths.add(path);
      let chunk;
      try {
        chunk = await releaseManager.loadReleaseFiles(manifest, missing);
      } catch {
        // A release install/update/rollback may have landed while this fetch
        // was in flight — that already called reset(), repointing
        // claimedChunkPaths to a new Set for the new release. Deleting into it
        // here would strip legitimate claims/loads that belong to the new
        // release, not this stale failed request.
        if (getReleaseState()?.manifest?.releaseId !== requestReleaseId) return;
        for (const path of missing) claimedChunkPaths.delete(path);
        return; // Fallback/loading copy stays up; the next visit retries.
      }
      // A release install/update/rollback may have landed while this fetch
      // was in flight — that already called reset(); don't let a stale
      // release's chunk data merge into the new one.
      if (getReleaseState()?.manifest?.releaseId !== requestReleaseId) return;
      for (const path of missing) loadedChunkPaths.add(path);
      Object.assign(extraChunkData, chunk);
      onChunksLoaded();
    },
  };
}


function basePathFrom(location) {
  const path = location.pathname;
  return path.endsWith("/") ? path : path.slice(0, path.lastIndexOf("/") + 1);
}


// Reuses the same static "fallback section" styling the pre-JS index.html
// sections already use (see fallbackSections) for the brief window between
// a route's first visit and its release chunk finishing its fetch+parse.
function chunkLoadingNotice(label) {
  return `<p class="status-kicker">Loading ${escapeHtml(label)} data…</p>`;
}


// Highlights the first case-insensitive occurrence of the raw (un-normalized)
// query in the display name. Fuzzy/typo matches and accent/hyphen-only
// matches have no exact substring to point at, so those just fall back to
// the plain escaped name — no highlight, not an error.
function highlightMatch(name, rawQuery) {
  const query = rawQuery.trim();
  const index = query ? name.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index === -1) return escapeHtml(name);
  return `${escapeHtml(name.slice(0, index))}<mark>${escapeHtml(name.slice(index, index + query.length))}</mark>${escapeHtml(name.slice(index + query.length))}`;
}


function renderSearchResults(results, forms, roster, rawQuery = "") {
  if (!results.length) return "<p>No local matches.</p>";
  const owned = new Set(roster?.ownedFormIds ?? []);
  return `<ul>${results.slice(0, 10).map((result) => (
    `<li class="search-result-card${owned.has(result.formId) ? " is-owned" : ""}">${spriteHtml(result.formId, forms, result.name, forms?.[result.formId]?.primary_type)}<strong>${highlightMatch(result.name, rawQuery)}</strong> <span>${escapeHtml(result.resultCategory)}</span>${ownedStarButton({ formId: result.formId, name: result.name, owned: owned.has(result.formId), route: "search" })}</li>`
  )).join("")}</ul>`;
}


function recentSearchesHtml(terms) {
  if (!terms.length) return "";
  return `<p class="search-recents-label">Recent searches</p><ul class="search-recents-chips">${terms.map((term) => (
    `<li><span class="chip recent-chip"><button type="button" class="recent-chip-term" data-recent-term="${escapeHtml(term)}">${escapeHtml(term)}</button><button type="button" class="recent-chip-dismiss" data-recent-dismiss="${escapeHtml(term)}" aria-label="Remove ${escapeHtml(term)} from recent searches">×</button></span></li>`
  )).join("")}</ul>`;
}


// Web Push groundwork — flag-gated, no relay exists yet. See
// docs/push-notifications-spike.md for the full spike and the operator's
// relay decision. Default OFF: no permission prompt, no subscribe call, no
// network activity unless a developer has opted in via the localStorage
// dev toggle documented there.
const PUSH_FLAG_KEY = "pogo-push-flag-dev";

export function isPushFlagEnabled(storage) {
  return storage?.getItem?.(PUSH_FLAG_KEY) === "1";
}

export function setPushFlag(storage, enabled) {
  try {
    if (enabled) storage?.setItem?.(PUSH_FLAG_KEY, "1");
    else storage?.removeItem?.(PUSH_FLAG_KEY);
  } catch {
    // Storage can legitimately be unavailable — the toggle still applies
    // for this session, it just won't persist to the next visit.
  }
}


// Permission state machine. The Notification API's own "granted"/"denied"/
// "default" is the source of truth; this just folds the flag and
// unsupported-browser cases into the same small state set a UI can switch
// on. There is no "pending" state — requestPushPermission() is a single
// awaited call, not a stored transition.
export const PUSH_STATES = Object.freeze(["unsupported", "flag-off", "default", "denied", "granted"]);

export function pushState({ flagEnabled, permission } = {}) {
  if (!flagEnabled) return "flag-off";
  if (permission === "granted" || permission === "denied") return permission;
  if (permission === "default") return "default";
  return "unsupported";
}

// Only call this from an explicit user tap handler — never on load or on a
// flag flip. Requesting permission automatically burns the browser's one
// prompt and can get the origin silently blocked for the rest of the
// install.
export async function requestPushPermission({ flagEnabled, notification = globalThis.Notification } = {}) {
  if (!flagEnabled) return "flag-off";
  if (!notification?.requestPermission) return "unsupported";
  const permission = await notification.requestPermission();
  return pushState({ flagEnabled, permission });
}


export function bindSearch(documentObject, index, forms, roster, storage = null) {
  const form = documentObject.querySelector("[data-global-search]");
  const input = form?.querySelector("input[type='search']");
  const output = form?.querySelector("[data-search-results]");
  if (!input || !output) return () => {};
  const recentsContainer = form?.querySelector("[data-search-recents]");
  const renderRecents = () => {
    if (!recentsContainer) return;
    recentsContainer.innerHTML = recentSearchesHtml(loadRecentSearches(storage));
  };
  const render = () => {
    const query = input.value.trim();
    output.innerHTML = query ? renderSearchResults(search(index, input.value), forms, roster, input.value) : "";
    if (recentsContainer) recentsContainer.hidden = Boolean(query);
  };
  input.addEventListener("input", render);
  // Recent searches are recorded on submit (Enter), not on every keystroke —
  // otherwise every partial typed prefix would get remembered.
  form?.addEventListener?.("submit", (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    saveRecentSearch(storage, input.value);
    renderRecents();
  });
  recentsContainer?.addEventListener?.("click", (event) => {
    const dismiss = event.target.closest?.("[data-recent-dismiss]");
    if (dismiss) {
      removeRecentSearch(storage, dismiss.dataset.recentDismiss);
      renderRecents();
      return;
    }
    const term = event.target.closest?.("[data-recent-term]");
    if (term) {
      input.value = term.dataset.recentTerm;
      render();
      input.focus?.();
    }
  });
  renderRecents();
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


// Honest LED mapping for the dex head (see the .minileds cluster in
// index.html / app.css): green = data fresh (release current), yellow =
// update ready, blue = roster loaded. Pure function so it's testable without
// a DOM — updateLeds() below is the only thing that touches elements.
export function ledState(releaseState = {}, roster = {}) {
  const rosterLoaded = (roster.instances?.length ?? 0) > 0 || (roster.ownedFormIds?.length ?? 0) > 0;
  const updateReady = releaseState.status === "update_available";
  const dataFresh = !updateReady && releaseState.status !== "failed" && Boolean(releaseState.currentReleaseId);
  return { roster: rosterLoaded, update: updateReady, fresh: dataFresh };
}


function updateLeds(documentObject, releaseState, roster) {
  const header = documentObject.querySelector?.(".dexhead");
  if (!header) return;
  const state = ledState(releaseState, roster);
  header.querySelector(".led-roster")?.classList.toggle("is-on", state.roster);
  header.querySelector(".led-update")?.classList.toggle("is-on", state.update);
  header.querySelector(".led-fresh")?.classList.toggle("is-on", state.fresh);
}


// ponytail: same disposable-flag pattern as whats-new dismissal, keyed to the
// candidate release id so dismissing this release's banner doesn't hide the
// next one.
function updateBannerDismissedKey(releaseId) {
  return `update-banner-dismissed:${releaseId}`;
}


// Pure state machine for the top-of-screen update banner: "ready" while a
// candidate release is waiting and not snoozed, "dismissed" once the operator
// snoozes that specific release id, "applied" once there's no pending
// candidate to offer (never had one, or the tap already went through).
export function updateBannerPhase(releaseState = {}, storage) {
  const releaseId = releaseState.status === "update_available" ? releaseState.candidate?.releaseId : null;
  if (!releaseId) return "applied";
  return storage?.getItem?.(updateBannerDismissedKey(releaseId)) === "1" ? "dismissed" : "ready";
}


function updateBanner(documentObject, releaseState, storage) {
  const banner = documentObject.getElementById?.("update-banner");
  if (!banner) return;
  banner.hidden = updateBannerPhase(releaseState, storage) !== "ready";
  const label = documentObject.getElementById?.("update-banner-label");
  if (label) {
    // ponytail: same "durable update_available only follows a failed
    // auto-apply" state the More view's releaseLabel() already names —
    // match its wording instead of a generic "ready" claim.
    label.textContent = releaseState.error
      ? "Update failed — tap to retry"
      : "New version ready — tap to update";
  }
}


// Poke Genie CSV imports are a point-in-time snapshot (see poke-genie-import.js);
// nudge to re-import once it's plausibly stale. Same "ready/dismissed/applied"
// shape as updateBannerPhase, but the snooze is a 7-day expiry instead of a
// permanent per-release dismissal, since staleness never resolves itself.
const STALENESS_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
const STALENESS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
// Views that read roster.instances for CP/IV-precise guidance — where a stale
// import actually misleads. "more" is where My Roster + re-import live.
const STALENESS_BANNER_ROUTES = new Set(["more", "coach", "swap", "triage"]);

function stalenessSnoozeKey(importedAt) {
  return `poke-genie-staleness-snoozed:${importedAt}`;
}

export function pokeGenieStalenessPhase(roster, storage, now = Date.now()) {
  const importedAt = roster?.preferences?.pokeGenieImport?.importedAt;
  const importedMs = typeof importedAt === "string" ? Date.parse(importedAt) : NaN;
  if (Number.isNaN(importedMs) || now - importedMs < STALENESS_THRESHOLD_MS) return "applied";
  const snoozedUntil = Number(storage?.getItem?.(stalenessSnoozeKey(importedAt)));
  return Number.isFinite(snoozedUntil) && now < snoozedUntil ? "dismissed" : "ready";
}

function updateStalenessBanner(documentObject, roster, storage, currentRoute) {
  const banner = documentObject.getElementById?.("staleness-banner");
  if (!banner) return;
  const visible = STALENESS_BANNER_ROUTES.has(currentRoute) && pokeGenieStalenessPhase(roster, storage) === "ready";
  banner.hidden = !visible;
  if (!visible) return;
  const label = documentObject.getElementById?.("staleness-banner-label");
  if (label) {
    const importedAt = roster.preferences.pokeGenieImport.importedAt;
    const days = Math.floor((Date.now() - Date.parse(importedAt)) / (24 * 60 * 60 * 1000));
    label.textContent = `Your import is ${days} days old — Pokémon you've changed since won't match. Re-import from Poke Genie to refresh.`;
  }
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


const TRIAGE_GUIDE_DISMISSED_KEY = "triage-guide-dismissed";


function showTriageGuide(storage) {
  return storage?.getItem?.(TRIAGE_GUIDE_DISMISSED_KEY) !== "1";
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


// "Mega", "Super Mega", or "Primal" if the form mega-evolves; null otherwise.
// Shares the same tag/name checks as raidTargetMatchesCategory() above —
// composed here rather than re-derived, so the guidance card and the
// category filter never disagree on what counts as a mega-family target.
function megaKind(bossFormId, form) {
  const tags = new Set(form?.tags ?? []);
  const formName = String(form?.form ?? "").toUpperCase();
  if (SUPER_MEGA_FORM_IDS.has(bossFormId)) return "Super Mega";
  if (formName === "PRIMAL") return "Primal";
  if (tags.has("mega")) return "Mega";
  return null;
}


// Teach copy for mega-family raid targets: the one-active-mega rule and the
// per-species (per-form, since the May 2026 X/Y split) Mega Energy scope.
// Both facts verified against Bulbapedia's "Mega Evolution (GO)" and
// "Mega Energy" pages (2026). Deliberately does not hardcode a Mega Energy
// cost table — Niantic tunes per-species costs over time and this app has
// no sourced, current figure to show; the in-game screen always has the
// live number. Mega Energy count below is optional manual tracking only,
// same "you tell us" honesty as Candy.
function megaGuidanceCard(kind, bossFormId, megaEnergyInventory) {
  const owned = megaEnergyInventory?.[bossFormId];
  return `<div class="mega-guidance-card">
    <p class="status-kicker">${escapeHtml(kind)} guidance</p>
    <p>Only <strong>one Mega-Evolved Pokémon can be active at a time</strong>, account-wide — Mega Evolving a second one reverts the first.</p>
    <p>Mega Energy is species-specific, and (since a May 2026 update) Mega X and Mega Y of the same species use separate Energy pools — Energy for one species or variant can't Mega Evolve a different one.</p>
    <p class="raid-ready-note">Mega Energy costs vary by species and change with Niantic updates, so this guide doesn't show a number here — check the in-game Mega Evolution screen for the current cost.</p>
    <label class="resource-inline-input">Your Mega Energy for this form (optional — the game doesn't share this, you tell us)
      <input inputmode="numeric" data-mega-energy-input data-mega-energy-form-id="${escapeHtml(bossFormId)}" value="${owned === null || owned === undefined ? "" : escapeHtml(owned)}">
    </label>
  </div>`;
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
  return {
    editingId: null, cp: "", ivs: { atk: "", def: "", sta: "" }, fastMove: "", chargedMoves: [],
    nickname: "", isShiny: false, isLucky: false,
  };
}


function blankDefenseLogDraft(now = Date.now()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const defaultStartedAt = `${year}-${month}-${day}T${hours}:${minutes}`;
  return {
    pokemon: "",
    gymName: "",
    startedAt: defaultStartedAt,
    instanceId: null,
    recentGyms: [],
    completingId: null,
    completeDraft: { endedAt: "", coins: "" },
    importText: "",
    message: "",
    shareOpen: false,
    geoLoading: false,
    lastGeoCoords: null,
    autoPickNote: "",
    autoPicked: false,
  };
}

// The gyms() prefill only runs while the pokemon field is blank, so changing
// the gym *after* a suggestion was auto-filled would otherwise leave a stale
// (possibly now-excluded) defender sitting in the field. Call this whenever
// gymName changes so an auto-picked value clears and the prefill re-runs
// against the new gym's exclusions; a hand-typed pick is left alone.
function resetAutoPickedDefender(draft) {
  if (draft.autoPicked) {
    draft.pokemon = "";
    draft.instanceId = null;
    draft.autoPickNote = "";
    draft.autoPicked = false;
  }
}


function draftFromInstance(instance) {
  return {
    editingId: instance.id,
    cp: instance.cp,
    ivs: { ...instance.ivs },
    fastMove: instance.fastMove ?? "",
    chargedMoves: [...(instance.chargedMoves ?? [])],
    nickname: instance.nickname ?? "",
    isShiny: Boolean(instance.isShiny),
    isLucky: Boolean(instance.isLucky),
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
    triage: createTriageViewState(),
    lastTask: savedTask ? { route: savedTask.route } : null,
    moreList: null,
    installMessage: "",
    rosterMessage: "",
    rosterQuery: "",
    collectionQuery: "",
    collectionFilter: "all",
    interactionMessage: "",
    moveSheet: null,
    instanceSheet: null,
    rosterShareOpen: false,
    diagnostics: { copyStatus: "", copyPayload: "", storageEstimate: undefined },
    textSize: loadTextSize(storage),
    theme: loadTheme(storage),
    trainerProfile: loadTrainerProfile(storage),
    weather: loadWeather(storage),
    backupNudge: shouldShowBackupNudge(storage),
    backupImportPreview: null,
    defenseLog: loadDefenseLog(storage),
    defenseLogDraft: (() => {
      const draft = blankDefenseLogDraft(Date.now());
      const log = loadDefenseLog(storage);
      draft.recentGyms = getRecentGymNames(log);
      return draft;
    })(),
    stardust: loadStardust(storage),
    candyInventory: loadCandyInventory(storage),
    megaEnergyInventory: loadMegaEnergyInventory(storage),
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
  onClipboardCopy = null,
  onRosterShareCopy = null,
  onTriageCopy = null,
  onDiagnosticsCopy = null,
  onConfirm = () => true,
  onFeedbackExport = null,
  onBackupExport = null,
  onShareCard = null,
  getTriageResult = () => ({ entries: [] }),
  onRosterChanged = () => {},
  searchRefresh = () => {},
  storage = null,
  rerenderCurrent = () => {},
  isCurrentRoute = () => true,
  rootElement = null,
  scrollToTop = () => {},
} = {}) {
  if (!ui || !roster) throw new TypeError("Interaction state and roster are required.");

  const clearTriageCopyStatus = (state = ui) => {
    if (state.triage) state.triage.copyStatus = "";
  };
  let rosterWriteQueue = Promise.resolve();
  const enqueueRosterWrite = (buildNext) => {
    const operation = rosterWriteQueue.then(async () => {
      const snapshot = structuredClone(buildNext(structuredClone(roster)));
      if (rosterStore?.replace) await rosterStore.replace(snapshot);
      replaceObject(roster, snapshot);
      clearTriageCopyStatus();
      onRosterChanged();
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
    clearTriageCopyStatus(nextUi);
    replaceObject(ui, nextUi);
  };
  const rerender = (route) => renderRoute(route);

  const api = {
    onRosterExport,
    onRosterShareCopy: onRosterShareCopy ?? onClipboardCopy,
    onTriageCopy: onTriageCopy ?? onClipboardCopy,
    onDiagnosticsCopy: onDiagnosticsCopy ?? onClipboardCopy,
    onConfirm,
    onFeedbackExport,
    onBackupExport,
    onShareCard,
    getTriageResult,
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
      const collectionSearch = event?.target?.closest?.("[data-collection-search]");
      if (collectionSearch) {
        ui.collectionQuery = String(collectionSearch.value ?? "").slice(0, 80);
        const caret = Math.min(
          Number.isInteger(collectionSearch.selectionStart) ? collectionSearch.selectionStart : ui.collectionQuery.length,
          ui.collectionQuery.length,
        );
        const ownerDocument = collectionSearch.ownerDocument;
        rerender("more");
        const nextSearch = ownerDocument?.querySelector?.("[data-collection-search]");
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
      const stardustInput = target?.closest?.("[data-stardust-input]");
      if (stardustInput) {
        if (stardustInput.value === "") {
          ui.stardust = clearStardust(storage);
        } else {
          try {
            ui.stardust = saveStardust(storage, stardustInput.value);
          } catch {
            // Invalid entry (negative/non-integer) — keep the last good value.
          }
        }
        // The same entry field lives on the Raid Target view and the trainer
        // profile card (More) — rerender whichever route hosts the control.
        rerender(stardustInput.dataset.stardustRoute ?? "raids");
        return;
      }
      const candyInput = target?.closest?.("[data-candy-input]");
      if (candyInput && candyInput.dataset.candyFormId) {
        if (candyInput.value === "") {
          ui.candyInventory = clearCandyCount(storage, candyInput.dataset.candyFormId);
        } else {
          try {
            ui.candyInventory = setCandyCount(storage, candyInput.dataset.candyFormId, candyInput.value);
          } catch {
            // Invalid entry — keep the last good value.
          }
        }
        rerender("raids");
        return;
      }
      const megaEnergyInput = target?.closest?.("[data-mega-energy-input]");
      if (megaEnergyInput && megaEnergyInput.dataset.megaEnergyFormId) {
        if (megaEnergyInput.value === "") {
          ui.megaEnergyInventory = clearMegaEnergyCount(storage, megaEnergyInput.dataset.megaEnergyFormId);
        } else {
          try {
            ui.megaEnergyInventory = setMegaEnergyCount(
              storage, megaEnergyInput.dataset.megaEnergyFormId, megaEnergyInput.value,
            );
          } catch {
            // Invalid entry — keep the last good value.
          }
        }
        rerender("raids");
        return;
      }
      // Weather is manual and session-scoped (resets daily) — see raid-target.js —
      // not part of the persisted raid task filters the other raid controls share above.
      const weatherChoice = target?.closest?.("[data-weather-choice]");
      if (weatherChoice) {
        ui.weather = saveWeather(storage, weatherChoice.value);
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
      const defenseLogPokemon = target?.closest?.("[data-defense-log-pokemon]");
      if (defenseLogPokemon) {
        ui.defenseLogDraft.pokemon = defenseLogPokemon.value;
        // A hand-edited name may no longer be the suggested instance; drop
        // the id rather than badge the wrong Pokémon (honest-matching rule).
        ui.defenseLogDraft.instanceId = null;
        ui.defenseLogDraft.autoPicked = false;
        rerender("gyms");
        return;
      }
      const defenseLogGym = target?.closest?.("[data-defense-log-gym]");
      if (defenseLogGym) {
        resetAutoPickedDefender(ui.defenseLogDraft);
        ui.defenseLogDraft.gymName = defenseLogGym.value;
        rerender("gyms");
        return;
      }
      const defenseLogStart = target?.closest?.("[data-defense-log-start]");
      if (defenseLogStart) {
        ui.defenseLogDraft.startedAt = defenseLogStart.value;
        rerender("gyms");
        return;
      }
      const trainerLevelControl = target?.closest?.("[data-trainer-level]");
      if (trainerLevelControl) {
        const raw = trainerLevelControl.value;
        ui.trainerProfile = saveTrainerProfile(storage, {
          ...ui.trainerProfile,
          level: raw === "" ? null : Number(raw),
        });
        onRosterChanged(); // trainer level feeds triage's memoized power-up cap notes too
        rerender("more");
        return;
      }
      const trainerNameControl = target?.closest?.("[data-trainer-name]");
      if (trainerNameControl) {
        ui.trainerProfile = saveTrainerProfile(storage, { ...ui.trainerProfile, name: trainerNameControl.value });
        rerender("more");
        return;
      }
      const defenseLogPlayerName = target?.closest?.("[data-defense-log-player-name]");
      if (defenseLogPlayerName) {
        try {
          ui.defenseLog = setLocalPlayerName(ui.defenseLog, defenseLogPlayerName.value);
          saveDefenseLog(storage, ui.defenseLog);
          ui.defenseLogDraft.message = "";
        } catch (error) {
          ui.defenseLogDraft.message = error?.message ?? String(error);
        }
        rerender("gyms");
        return;
      }
      const defenseLogCompleteEnd = target?.closest?.("[data-defense-log-complete-end]");
      if (defenseLogCompleteEnd) {
        ui.defenseLogDraft.completeDraft.endedAt = defenseLogCompleteEnd.value;
        rerender("gyms");
        return;
      }
      const defenseLogCompleteCoins = target?.closest?.("[data-defense-log-complete-coins]");
      if (defenseLogCompleteCoins) {
        ui.defenseLogDraft.completeDraft.coins = defenseLogCompleteCoins.value;
        rerender("gyms");
        return;
      }
      const defenseLogImportText = target?.closest?.("[data-defense-log-import-text]");
      if (defenseLogImportText) {
        ui.defenseLogDraft.importText = defenseLogImportText.value;
        rerender("gyms");
        return;
      }
      const instanceCp = target?.closest?.("[data-instance-cp]");
      if (instanceCp && ui.instanceSheet) {
        ui.instanceSheet.draft.cp = instanceCp.value;
        ui.instanceSheet.error = "";
        rerender(ui.instanceSheet.returnRoute ?? "more");
        return;
      }
      const instanceIv = target?.closest?.("[data-instance-iv]");
      if (instanceIv && ui.instanceSheet) {
        const raw = instanceIv.value;
        ui.instanceSheet.draft.ivs[instanceIv.dataset.instanceIv] = raw === "" ? "" : Number(raw);
        ui.instanceSheet.error = "";
        rerender(ui.instanceSheet.returnRoute ?? "more");
        return;
      }
      const instanceNickname = target?.closest?.("[data-instance-nickname]");
      if (instanceNickname && ui.instanceSheet) {
        ui.instanceSheet.draft.nickname = instanceNickname.value;
        rerender(ui.instanceSheet.returnRoute ?? "more");
        return;
      }
      const quickCpInput = target?.closest?.("[data-quick-cp-input]");
      if (quickCpInput && ui.instanceSheet?.quickCp) {
        ui.instanceSheet.quickCp.value = quickCpInput.value;
        ui.instanceSheet.quickCp.error = "";
        rerender(ui.instanceSheet.returnRoute ?? "more");
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
          clearTriageCopyStatus();
          onRosterChanged();
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
                schemaVersion: ROSTER_SCHEMA,
                ownedFormIds: [...owned].sort(),
                ownedFormCounts: Object.fromEntries(
                  Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
                ),
                instances: [...(current.instances ?? []), ...parsed],
                preferences: {
                  ...(current.preferences ?? {}),
                  // Point-in-time snapshot stamp — see pokeGenieStalenessPhase()
                  // for the staleness nudge this feeds.
                  pokeGenieImport: { importedAt: new Date().toISOString(), rowCount: parsed.length },
                },
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
      const backupImport = target?.closest?.('[data-action="backup-import"]')
        ?? (target?.dataset?.action === "backup-import" ? target : null);
      if (backupImport?.files?.[0]) {
        try {
          const text = await backupImport.files[0].text();
          const envelope = await parseBackupEnvelope(text, validFormIds);
          ui.backupImportPreview = { envelope, summary: summarizeBackup(envelope) };
          ui.rosterMessage = "";
        } catch (error) {
          ui.backupImportPreview = null;
          ui.rosterMessage = `Backup file could not be read: ${error?.message ?? error}`;
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
        const instanceId = openInstanceSheet.dataset.openInstanceSheetInstanceId;
        const instance = instanceId
          ? (roster.instances ?? []).find((row) => row.id === instanceId && row.formId === formId)
          : null;
        const returnRoute = openInstanceSheet.dataset.instanceSheetReturnRoute === "triage" || instance
          ? "triage"
          : "more";
        if (validFormIds.has(formId)) {
          ui.instanceSheet = {
            formId,
            draft: instance ? draftFromInstance(instance) : blankInstanceDraft(),
            error: "",
            focusInstanceId: instance?.id ?? null,
            returnRoute,
            shareMessage: "",
          };
        }
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
        if (instance) {
          ui.instanceSheet = {
            ...ui.instanceSheet,
            draft: draftFromInstance(instance),
            error: "",
            focusInstanceId: ui.instanceSheet.returnRoute === "triage" ? instance.id : null,
            quickCp: null,
            shareMessage: "",
          };
        }
        rerenderCurrent();
        return;
      }
      const quickCpInstance = target?.closest?.("[data-quick-cp-instance-id]");
      if (quickCpInstance && ui.instanceSheet) {
        const instance = (roster.instances ?? []).find((row) => row.id === quickCpInstance.dataset.quickCpInstanceId);
        if (instance) {
          ui.instanceSheet.quickCp = { instanceId: instance.id, value: String(instance.cp), error: "" };
        }
        rerenderCurrent();
        return;
      }
      const shareInstance = target?.closest?.("[data-share-instance-id]");
      if (shareInstance && ui.instanceSheet) {
        const instance = (roster.instances ?? []).find((row) => row.id === shareInstance.dataset.shareInstanceId);
        const form = forms[ui.instanceSheet.formId];
        const cardData = instanceCardData(instance, form);
        const outcome = cardData ? await (api.onShareCard ?? onShareCard)?.("instance", cardData) : "no-data";
        ui.instanceSheet.shareMessage = outcome === "shared" ? "Shared your card."
          : outcome === "downloaded" ? "Downloaded your card."
          : outcome === "cancelled" ? ""
          : "Could not share or download the card on this device.";
        rerenderCurrent();
        return;
      }
      const deleteInstance = target?.closest?.("[data-delete-instance-id]");
      if (deleteInstance) {
        const instanceId = deleteInstance.dataset.deleteInstanceId;
        const returnRoute = ui.instanceSheet?.returnRoute ?? "more";
        failureRoute = returnRoute;
        await mutateRoster((current) => ({
          ...current,
          instances: (current.instances ?? []).filter((row) => row.id !== instanceId),
        }));
        if (ui.instanceSheet?.draft?.editingId === instanceId) {
          if (returnRoute === "triage") ui.instanceSheet = null;
          else ui.instanceSheet.draft = blankInstanceDraft();
        }
        rerender(returnRoute);
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
      const instanceShinyToggle = target?.closest?.("[data-instance-shiny-toggle]");
      if (instanceShinyToggle && ui.instanceSheet) {
        ui.instanceSheet.draft.isShiny = !ui.instanceSheet.draft.isShiny;
        rerenderCurrent();
        return;
      }
      const instanceLuckyToggle = target?.closest?.("[data-instance-lucky-toggle]");
      if (instanceLuckyToggle && ui.instanceSheet) {
        ui.instanceSheet.draft.isLucky = !ui.instanceSheet.draft.isLucky;
        rerenderCurrent();
        return;
      }
      const shinyFormToggle = target?.closest?.("[data-shiny-toggle-form-id]");
      if (shinyFormToggle) {
        const formId = shinyFormToggle.dataset.shinyToggleFormId;
        // A shiny instance forces this true — the quick-toggle can't lie it
        // back off (mirrors the disabled state rendered in more.js).
        const forced = (roster.instances ?? []).some((row) => row.formId === formId && row.isShiny);
        if (!forced && validFormIds.has(formId)) {
          failureRoute = "more";
          await mutateRoster((current) => {
            const flagged = new Set(current.shinyOwnedFormIds ?? []);
            if (flagged.has(formId)) flagged.delete(formId); else flagged.add(formId);
            return { ...current, schemaVersion: ROSTER_SCHEMA, shinyOwnedFormIds: [...flagged].sort() };
          });
        }
        rerender("more");
        return;
      }
      const luckyFormToggle = target?.closest?.("[data-lucky-toggle-form-id]");
      if (luckyFormToggle) {
        const formId = luckyFormToggle.dataset.luckyToggleFormId;
        const forced = (roster.instances ?? []).some((row) => row.formId === formId && row.isLucky);
        if (!forced && validFormIds.has(formId)) {
          failureRoute = "more";
          await mutateRoster((current) => {
            const flagged = new Set(current.luckyOwnedFormIds ?? []);
            if (flagged.has(formId)) flagged.delete(formId); else flagged.add(formId);
            return { ...current, schemaVersion: ROSTER_SCHEMA, luckyOwnedFormIds: [...flagged].sort() };
          });
        }
        rerender("more");
        return;
      }
      const collectionFilterControl = target?.closest?.("[data-collection-filter]");
      if (collectionFilterControl) {
        ui.collectionFilter = collectionFilterControl.dataset.collectionFilter;
        rerender("more");
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
      const themeControl = target?.closest?.("[data-theme-choice]");
      if (themeControl) {
        const theme = saveTheme(storage, themeControl.dataset.themeChoice);
        applyTheme(rootElement, theme);
        ui.theme = theme;
        rerender("more");
        return;
      }
      const trainerTeamControl = target?.closest?.("[data-trainer-team]");
      if (trainerTeamControl) {
        const nextTeam = trainerTeamControl.dataset.trainerTeam;
        ui.trainerProfile = saveTrainerProfile(storage, {
          ...ui.trainerProfile,
          team: ui.trainerProfile.team === nextTeam ? null : nextTeam, // tap again to clear
        });
        rerender("more");
        return;
      }
      const requestPushButton = target?.closest?.('[data-action="request-push-permission"]');
      if (requestPushButton) {
        requestPushPermission({ flagEnabled: isPushFlagEnabled(storage), notification: windowObject.Notification })
          .then(() => rerender("more"));
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
      const triageFilter = target?.closest?.("[data-triage-filter]");
      if (triageFilter) {
        ui.triage = setTriageFilter(ui.triage, triageFilter.dataset.triageFilter);
        rerender("triage");
        return;
      }
      const triageShowMore = target?.closest?.("[data-triage-show-more]");
      if (triageShowMore) {
        ui.triage = advanceTriageView(ui.triage);
        rerender("triage");
        return;
      }
      const triagePrevious = target?.closest?.("[data-triage-previous]");
      if (triagePrevious) {
        ui.triage = retreatTriageView(ui.triage);
        rerender("triage");
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
          await mutateRoster((current) => ({ ...current, schemaVersion: ROSTER_SCHEMA, ...toggleOwnedFields(current) }));
          searchRefresh();
          return;
        }
        const route = ownedControl.dataset.ownedRoute === "gyms" ? "gyms" : "raids";
        failureRoute = route;
        const nextUi = structuredClone(ui);
        const filters = taskFilters(route, nextUi);
        await mutateRoster((current) => ({
          ...current,
          schemaVersion: ROSTER_SCHEMA,
          ...toggleOwnedFields(current),
          preferences: {
            ...(current.preferences ?? {}),
            lastTask: { route, filters },
          },
        }));
        nextUi.lastTask = { route };
        nextUi.interactionMessage = "";
        clearTriageCopyStatus(nextUi);
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
            schemaVersion: ROSTER_SCHEMA,
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
      } else if (action === "dismiss-triage-guide") {
        storage?.setItem?.(TRIAGE_GUIDE_DISMISSED_KEY, "1");
        rerender("triage");
      } else if (action === "open-triage-explainer") {
        ui.triage.explainerOpen = true;
        rerender("triage");
      } else if (action === "copy-triage-candy") {
        const payload = candyTransferText(api.getTriageResult?.());
        const copied = Boolean(payload) && await api.onTriageCopy?.(payload);
        ui.triage.copyStatus = copied ? "success" : "failure";
        rerender("triage");
      } else if (action === "share-triage-summary-card") {
        const cardData = triageSummaryCardData(api.getTriageResult?.()?.counts);
        const outcome = cardData ? await (api.onShareCard ?? onShareCard)?.("triageSummary", cardData) : "no-data";
        ui.triage.shareStatus = outcome === "cancelled" ? "" : outcome;
        rerender("triage");
      } else if (action === "share-gym-defense-card") {
        const row = buildLeaderboard(ui.defenseLog, Date.now(), ui.trainerProfile.team)
          .find((entry) => entry.playerName === ui.defenseLog.localPlayerName);
        const cardData = gymDefenseCardData(row);
        const outcome = cardData ? await (api.onShareCard ?? onShareCard)?.("gymDefense", cardData) : "no-data";
        ui.defenseLogDraft.message = outcome === "shared" ? "Shared your defense card."
          : outcome === "downloaded" ? "Downloaded your defense card."
          : outcome === "cancelled" ? ""
          : "Could not share or download the card on this device.";
        rerender("gyms");
      } else if (action === "dismiss-guide") {
        const route = actionEl.dataset.guideRoute;
        if (route) dismissGuide(route, storage);
        rerenderCurrent();
      } else if (action === "show-guide") {
        const route = actionEl.dataset.guideRoute;
        if (route) showGuide(route, storage);
        rerenderCurrent();
      } else if (action === "toggle-today-task") {
        const taskId = actionEl.dataset.todayTaskId;
        if (taskId) toggleTodayTask(taskId, storage);
        rerenderCurrent();
      } else if (action === "scroll-app-top") {
        scrollToTop();
      } else if (action === "reveal-events") {
        // Home's week-strip rows without a boss/external link (and its
        // "All events" link) open the collapsed "Upcoming events" accordion
        // and jump to it — a plain #hash anchor would instead round-trip
        // through the router's hashchange handler, which re-renders Home
        // and resets scroll to the top before the browser's own anchor
        // jump ever gets seen.
        const details = rootElement?.querySelector?.("#home-event-details");
        if (details) {
          details.open = true;
          details.scrollIntoView?.({ block: "start" });
        }
      } else if (action === "dismiss-update-banner") {
        const releaseId = releaseManager?.state?.candidate?.releaseId;
        if (releaseId) storage?.setItem?.(updateBannerDismissedKey(releaseId), "1");
        rerenderCurrent();
      } else if (action === "dismiss-staleness-banner") {
        const importedAt = roster?.preferences?.pokeGenieImport?.importedAt;
        if (importedAt) storage?.setItem?.(stalenessSnoozeKey(importedAt), String(Date.now() + STALENESS_SNOOZE_MS));
        rerenderCurrent();
      } else if (action === "dismiss-backup-nudge") {
        snoozeBackupNudge(storage);
        ui.backupNudge = false;
        rerender("more");
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
      } else if (action === "backup-export") {
        const envelope = buildBackupEnvelope({
          roster: structuredClone(roster),
          defenseLog: structuredClone(ui.defenseLog),
          textSize: ui.textSize,
          theme: ui.theme,
          drillStats: loadDrillStats(storage),
          feedback: loadFeedback(storage),
          appShellRevision: APP_SHELL_REVISION,
        });
        (api.onBackupExport ?? onBackupExport)?.(stableBackupJson(envelope));
        recordBackupNow(storage);
        ui.backupNudge = false;
        ui.rosterMessage = "Backup downloaded.";
        rerender("more");
      } else if (action === "backup-restore-cancel") {
        ui.backupImportPreview = null;
        rerender("more");
      } else if (action === "backup-restore-merge" || action === "backup-restore-replace") {
        const preview = ui.backupImportPreview;
        if (!preview) { rerender("more"); return; }
        const mode = action === "backup-restore-merge" ? "merge" : "replace";
        const current = {
          roster: structuredClone(roster),
          defenseLog: structuredClone(ui.defenseLog),
          textSize: ui.textSize,
          theme: ui.theme,
          drillStats: loadDrillStats(storage),
          feedback: loadFeedback(storage),
        };
        const restored = mode === "merge"
          ? mergeBackupPayload(current, preview.envelope.payload)
          : replaceBackupPayload(preview.envelope.payload);
        failureRoute = "more";
        await mutateRoster(() => restored.roster);
        ui.defenseLog = saveDefenseLog(storage, restored.defenseLog);
        ui.textSize = saveTextSize(storage, restored.textSize);
        applyTextSize(rootElement, ui.textSize);
        ui.theme = saveTheme(storage, restored.theme);
        applyTheme(rootElement, ui.theme);
        ui.drill.stats = saveDrillStats(storage, restored.drillStats);
        saveFeedback(storage, restored.feedback);
        recordBackupNow(storage);
        ui.backupNudge = false;
        ui.backupImportPreview = null;
        ui.rosterMessage = mode === "merge"
          ? "Backup merged into your data."
          : "Your data was replaced from the backup.";
        rerender("more");
      } else if (action === "copy-diagnostics-entry") {
        const index = Number(actionEl.dataset.diagnosticsIndex);
        const entry = loadDiagnostics(storage)[index];
        const payload = entry ? `${JSON.stringify(entry, null, 2)}\n` : "";
        const copied = Boolean(payload) && await api.onDiagnosticsCopy?.(payload);
        ui.diagnostics.copyStatus = copied ? "success" : "failure";
        ui.diagnostics.copyPayload = copied ? "" : payload;
        rerender("more");
      } else if (action === "copy-diagnostics-all") {
        const payload = exportDiagnostics(storage);
        const copied = await api.onDiagnosticsCopy?.(payload);
        ui.diagnostics.copyStatus = copied ? "success" : "failure";
        ui.diagnostics.copyPayload = copied ? "" : payload;
        rerender("more");
      } else if (action === "clear-diagnostics") {
        if (api.onConfirm?.("Clear all diagnostics entries? This can't be undone.")) {
          clearDiagnostics(storage);
          ui.diagnostics.copyStatus = "";
          ui.diagnostics.copyPayload = "";
          rerender("more");
        }
      } else if (action === "cancel-edit-instance") {
        const returnRoute = ui.instanceSheet?.returnRoute ?? "more";
        if (ui.instanceSheet) {
          if (returnRoute === "triage") ui.instanceSheet = null;
          else ui.instanceSheet.draft = blankInstanceDraft();
        }
        rerender(returnRoute);
      } else if (action === "save-instance") {
        const returnRoute = ui.instanceSheet?.returnRoute ?? "more";
        if (ui.instanceSheet) {
          const form = forms[ui.instanceSheet.formId];
          const editingId = ui.instanceSheet.draft.editingId;
          try {
            const instance = buildInstance(form, ui.instanceSheet.draft);
            const original = editingId ? (roster.instances ?? []).find((row) => row.id === editingId) : null;
            const saved = original ? { ...instance, id: original.id, addedAt: original.addedAt } : instance;
            failureRoute = returnRoute;
            await mutateRoster((current) => ({
              ...current,
              instances: [...(current.instances ?? []).filter((row) => row.id !== editingId), saved],
            }));
            if (returnRoute === "triage") ui.instanceSheet = null;
            else {
              ui.instanceSheet.draft = blankInstanceDraft();
              ui.instanceSheet.error = "";
            }
          } catch (error) {
            ui.instanceSheet.error = error?.message ?? String(error);
          }
        }
        rerender(returnRoute);
      } else if (action === "cancel-quick-cp") {
        const returnRoute = ui.instanceSheet?.returnRoute ?? "more";
        if (ui.instanceSheet) ui.instanceSheet.quickCp = null;
        rerender(returnRoute);
      } else if (action === "save-quick-cp") {
        const returnRoute = ui.instanceSheet?.returnRoute ?? "more";
        const quickCp = ui.instanceSheet?.quickCp;
        if (quickCp) {
          const instance = (roster.instances ?? []).find((row) => row.id === quickCp.instanceId);
          const form = forms[ui.instanceSheet.formId];
          try {
            const revised = reviseInstanceCp(form, instance, Number(quickCp.value));
            failureRoute = returnRoute;
            await mutateRoster((current) => ({
              ...current,
              instances: (current.instances ?? []).map((row) => (row.id === revised.id ? revised : row)),
            }));
            ui.instanceSheet.quickCp = null;
          } catch (error) {
            ui.instanceSheet.quickCp.error = error?.message ?? String(error);
          }
        }
        rerender(returnRoute);
      } else if (action === "defense-log-start") {
        try {
          ui.defenseLog = startDefense(ui.defenseLog, ui.defenseLogDraft);
          saveDefenseLog(storage, ui.defenseLog);
          // If the user has a cached location from geolocation and typed a gym name,
          // cache the gym location for future geolocation lookups
          if (ui.defenseLogDraft.gymName && ui.defenseLogDraft.lastGeoCoords) {
            setCachedGymCoords(storage, ui.defenseLogDraft.gymName, ui.defenseLogDraft.lastGeoCoords.latitude, ui.defenseLogDraft.lastGeoCoords.longitude);
          }
          const draft = blankDefenseLogDraft();
          draft.recentGyms = getRecentGymNames(ui.defenseLog);
          ui.defenseLogDraft = draft;
        } catch (error) {
          ui.defenseLogDraft.message = error?.message ?? String(error);
        }
        rerender("gyms");
      } else if (action === "defense-log-open-complete") {
        ui.defenseLogDraft.completingId = actionEl.dataset.defenseEntryId ?? null;
        ui.defenseLogDraft.completeDraft = { endedAt: "", coins: "" };
        ui.defenseLogDraft.message = "";
        rerender("gyms");
      } else if (action === "defense-log-cancel-complete") {
        ui.defenseLogDraft.completingId = null;
        rerender("gyms");
      } else if (action === "defense-log-complete") {
        try {
          ui.defenseLog = completeDefense(ui.defenseLog, ui.defenseLogDraft.completingId, ui.defenseLogDraft.completeDraft);
          saveDefenseLog(storage, ui.defenseLog);
          ui.defenseLogDraft.completingId = null;
          ui.defenseLogDraft.completeDraft = { endedAt: "", coins: "" };
          ui.defenseLogDraft.message = "";
        } catch (error) {
          ui.defenseLogDraft.message = error?.message ?? String(error);
        }
        rerender("gyms");
      } else if (action === "defense-log-delete") {
        const entryId = actionEl.dataset.defenseEntryId;
        ui.defenseLog = deleteDefenseEntry(ui.defenseLog, entryId);
        saveDefenseLog(storage, ui.defenseLog);
        if (ui.defenseLogDraft.completingId === entryId) ui.defenseLogDraft.completingId = null;
        rerender("gyms");
      } else if (action === "defense-log-toggle-share") {
        ui.defenseLogDraft.shareOpen = !ui.defenseLogDraft.shareOpen;
        rerender("gyms");
      } else if (action === "defense-log-copy-share") {
        const payload = exportPlayerLog(ui.defenseLog);
        const copied = await (api.onRosterShareCopy ?? onRosterShareCopy)?.(payload);
        ui.defenseLogDraft.message = copied
          ? "Copied your leaderboard text to clipboard."
          : "Could not copy automatically — select and copy the text above.";
        rerender("gyms");
      } else if (action === "defense-log-import") {
        try {
          const { log: nextLog, playerName, importedCount } = importPlayerLog(ui.defenseLog, ui.defenseLogDraft.importText);
          ui.defenseLog = nextLog;
          saveDefenseLog(storage, ui.defenseLog);
          ui.defenseLogDraft.importText = "";
          ui.defenseLogDraft.message = `Imported ${importedCount} ${importedCount === 1 ? "entry" : "entries"} for ${playerName}.`;
        } catch (error) {
          ui.defenseLogDraft.message = error?.message ?? String(error);
        }
        rerender("gyms");
      } else if (action === "defense-log-use-location") {
        // Geolocation gym picker: request coords, find nearest cached gym within 150m
        if (!navigator.geolocation) {
          ui.defenseLogDraft.message = "Geolocation not available on this device.";
          rerender("gyms");
          return;
        }
        ui.defenseLogDraft.geoLoading = true;
        rerender("gyms");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            // Store coords for potential caching when dropping the defender
            ui.defenseLogDraft.lastGeoCoords = { latitude, longitude };
            // Cache current location for the gym being defended (if a name is entered)
            if (ui.defenseLogDraft.gymName) {
              setCachedGymCoords(storage, ui.defenseLogDraft.gymName, latitude, longitude);
            }
            const nearest = findNearestCachedGym(storage, latitude, longitude);
            if (nearest) {
              resetAutoPickedDefender(ui.defenseLogDraft);
              ui.defenseLogDraft.gymName = nearest;
              ui.defenseLogDraft.message = `Preselected nearest gym: ${nearest}`;
            } else {
              // Check if we have any cached gyms (not just nearby)
              const hasAnyCachedGyms = typeof storage?.length === 'number' && storage.length > 0
                && [...Array(storage.length)].some((_, i) => storage.key(i)?.startsWith('gym-geo:'));
              if (hasAnyCachedGyms) {
                ui.defenseLogDraft.message = "No cached gyms within 150m. Type a gym name to start a new cache.";
              } else {
                ui.defenseLogDraft.message = "No cached gym locations yet. Type a gym name and drop a defender to cache it.";
              }
            }
            ui.defenseLogDraft.geoLoading = false;
            // Geolocation is async — only pull the user back to gyms if they're
            // still there; otherwise just update the draft for next time they visit.
            if (isCurrentRoute("gyms")) rerender("gyms");
          },
          (error) => {
            ui.defenseLogDraft.message = `Geolocation denied or unavailable — please type a gym name.`;
            ui.defenseLogDraft.geoLoading = false;
            if (isCurrentRoute("gyms")) rerender("gyms");
          },
          { timeout: 10000 },
        );
      } else if (action === "defense-log-quick-gym") {
        // Recent gyms chip tap: prefill gym name
        const gym = actionEl.dataset.gym;
        if (gym) {
          resetAutoPickedDefender(ui.defenseLogDraft);
          ui.defenseLogDraft.gymName = gym;
          ui.defenseLogDraft.message = "";
        }
        rerender("gyms");
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
// Turns an affordability() verdict into one honest line — never claims
// "can afford" off a currency the player never entered.
function affordabilityLine(afford) {
  if (afford.status === "unknown") {
    return "Enter your Candy and Stardust below to check affordability.";
  }
  if (afford.status === "can-afford") {
    return "You can afford this power-up right now.";
  }
  if (afford.status === "short") {
    const parts = [];
    if (afford.candyKnown && afford.candyShort > 0) parts.push(`${afford.candyShort} more Candy`);
    if (afford.stardustKnown && afford.stardustShort > 0) parts.push(`${afford.stardustShort.toLocaleString()} more Stardust`);
    return `Short: need ${parts.join(" and ")}.`;
  }
  // "partial": one currency is recorded and sufficient, the other is unknown.
  const known = afford.candyKnown ? "Candy" : "Stardust";
  const unknown = afford.candyKnown ? "Stardust" : "Candy";
  return `Enough ${known} recorded — enter your ${unknown} below to confirm.`;
}


function raidReadyPanel(formId, forms, fromLevel, instance, stardustOwned, candyOwned) {
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
  const afford = affordability({
    candyNeeded: candy, stardustNeeded: stardust, candyOwned, stardustOwned,
  });
  return `<div class="raid-ready-panel">
    <p class="status-kicker">Make it raid-ready</p>
    <p>${levelLine}: <strong>${escapeHtml(candy)} Candy</strong> + <strong>${escapeHtml(stardust.toLocaleString())} Stardust</strong></p>
    ${Number.isInteger(buddyKm) && buddyKm > 0 ? `<p>Walking earns 1 Candy per ${escapeHtml(buddyKm)} km as your buddy.</p>` : ""}
    <p class="raid-ready-note">Stardust is hard to earn back — power up Pokemon you'll use a lot.</p>
    <p class="raid-ready-note">Levels above 40 use XL Candy — not covered here.</p>
    <p class="resource-affordability" data-affordability="${escapeHtml(afford.status)}">${affordabilityLine(afford)}</p>
    <label class="resource-inline-input">Your Candy for ${escapeHtml(forms?.[formId]?.name ?? "this Pokémon")} (optional — the game doesn't share this, you tell us)
      <input inputmode="numeric" data-candy-input data-candy-form-id="${escapeHtml(formId)}" value="${candyOwned === null || candyOwned === undefined ? "" : escapeHtml(candyOwned)}">
    </label>
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


// Collapsible "Breakpoints" section: damage-per-hit for the instance's ACTUAL
// known moves (never the optimal moveset it might not have) against this
// boss's types, plus the next level where a power-up would gain another
// point of damage per hit and whether today's weather already boosts a move.
// Renders nothing for star-only rows (no detailed instance) or when the
// release's move catalog doesn't document a move's PvE stats — see
// breakpoints.js for both fallbacks.
function breakpointsSection(form, bestInstance, bossTypes, { moveCatalog, weather, targetDefense } = {}) {
  if (!form || !bestInstance) return "";
  const reports = instanceBreakpointReports({
    form, instance: bestInstance, moveCatalog, bossTypes, weather, targetDefense,
  });
  if (!reports.length) return "";
  const rows = reports.map((report) => {
    const slotLabel = report.slot === "charged" ? "Charged" : "Fast";
    const weatherLine = report.weatherBoosted
      ? (report.weatherGain > 0
        ? ` ${jargonTerm("weather-boost", "Weather boost")} adds +${escapeHtml(report.weatherGain)} damage/hit right now.`
        : ` ${jargonTerm("weather-boost", "Weather boost")} is active but doesn't change this hit's rounded damage.`)
      : "";
    const nextLine = report.nextBreakpoint
      ? ` Next ${jargonTerm("breakpoint", "breakpoint")}: Level ${escapeHtml(report.nextBreakpoint.level)} → ${escapeHtml(report.nextBreakpoint.damage)} damage/hit (+${escapeHtml(report.nextBreakpoint.gain)}).`
      : " No further damage-per-hit breakpoint through Level 51.";
    return `<li><strong>${moveLink(report.moveId, { kind: slotLabel })}</strong> (${slotLabel}): ${escapeHtml(report.currentDamage)} damage/hit at Level ${escapeHtml(report.currentLevel)}.${weatherLine}${nextLine}</li>`;
  }).join("");
  return `<details class="raid-breakpoints">
    <summary>Breakpoints</summary>
    <ul>${rows}</ul>
    <p class="raid-method-note">Assumes the boss defends at this release's standard Level 40 / 100 defense raid-DPS baseline (${escapeHtml(targetDefense ?? STANDARD_TARGET_DEFENSE)} defense) — a real boss's actual defense can differ.</p>
  </details>`;
}


function raidCounterCard(row, roster, forms, {
  fromLevel, budgetPickIds, deploymentMap, stardust, candyInventory, moveCatalog, weather, targetDefense,
} = {}, bossTypes = []) {
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
  // Detailed owned instances are never excluded from raid counter cards —
  // this is a ranking list, not a suggestion queue — so a deployed instance
  // only gets a badge, same instance-matching contract as gym-availability.js.
  const deployment = bestInstance ? deploymentMap?.get(bestInstance.id) : null;
  return `<li class="raid-card${owned ? " is-owned" : ""}" data-form-id="${escapeHtml(row.formId)}">
    <p class="raid-rank">Type rank #${escapeHtml(row.typeRank ?? row.rank)} · ${escapeHtml(multiplier)}×</p>
    <h4>${escapeHtml(row.pokemon)}</h4>
    ${because ? `<p class="raid-because">${escapeHtml(because)}</p>` : ""}
    <p><strong>Optimal DPS moves:</strong> ${optimalMoves}</p>
    ${movesDisagree ? `<p><strong>Practical moves:</strong> ${practicalMoves}</p>` : ""}
    <p>${Number.isFinite(Number(dps)) ? `${Number(dps).toFixed(2)} standardized DPS` : "DPS unavailable"} · ${escapeHtml(row.investmentTier)}${row.weatherBoosted ? ` · <span class="weather-boosted-badge">Boosted today</span>` : ""}</p>
    <p><strong>Availability:</strong> ${escapeHtml(row.availability ?? "Availability not documented")}</p>
    ${isBudgetPick ? `<p class="budget-verdict">Community pick: strong value</p>` : ""}
    ${deployment ? `<p class="budget-verdict">Defending a gym right now</p>` : ""}
    ${raidReadyPanel(row.formId, forms, fromLevel, bestInstance, stardust, candyInventory?.[row.formId])}
    ${breakpointsSection(forms?.[row.formId], bestInstance, bossTypes, { moveCatalog, weather, targetDefense })}
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
    <p class="raid-rank">#${escapeHtml(row.typeRank ?? row.rank)}${row.weatherBoosted ? ` · <span class="weather-boosted-badge">Boosted today</span>` : ""}</p>
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
    weather: ui.weather,
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
  const deploymentMap = buildDeploymentMap(ui.defenseLog, Date.now());
  const raidDpsMethodology = state.core?.methodology?.raidDps ?? {};
  const cardOptions = {
    fromLevel: 20,
    budgetPickIds,
    deploymentMap,
    stardust: ui.stardust,
    candyInventory: ui.candyInventory,
    moveCatalog: raidDpsMethodology.moveCatalog ?? {},
    weather: ui.weather,
    targetDefense: raidDpsMethodology.assumptions?.targetDefense,
  };
  return `<section class="raid-target-view" aria-labelledby="raid-target-title">
    <h2 id="raid-target-title">Raid Target</h2>
    <div class="pvp-controls">
      <label>Boss category<select data-raid-target-category>${RAID_TARGET_CATEGORIES.map(([value, label]) => option(value, label, category)).join("")}</select></label>
      <label>Exact boss form<select data-raid-target>${targets.map((target) => option(target.bossFormId, target.boss, ui.raid.targetFormId)).join("")}</select></label>
      <label>Encounter level<select data-encounter-level>${option("normal", "Level 20", ui.raid.encounterLevel)}${option("weatherBoosted", "Weather boosted · Level 25", ui.raid.encounterLevel)}</select></label>
      <label>Observed catch CP<input inputmode="numeric" data-observed-cp value="${escapeHtml(ui.raid.observedCp)}"></label>
      <label class="resource-inline-input">Your Stardust (optional — the game doesn't share this, you tell us)
        <input inputmode="numeric" data-stardust-input value="${ui.stardust === null || ui.stardust === undefined ? "" : escapeHtml(ui.stardust)}">
      </label>
    </div>
    <div class="raid-boss-summary">
      <p class="raid-boss-heading"><strong>${escapeHtml(plan.target.boss)}</strong> ${bossTypes.map(typeChip).join("")}</p>
      <p class="type-chip-list" aria-label="Boss weaknesses">Weak to: ${plan.weaknesses.length ? plan.weaknesses.map((row) => (
    `<span class="type-weak-badge${row.effectiveness >= 2.56 ? " is-double" : ""}">${typeChip(row.attackingType)}${row.effectiveness >= 2.56 ? "4x" : "2x"}</span>`
  )).join("") : "None documented"}</p>
    </div>
    <div class="raid-cp-lines">
      <div class="raid-cp-set">
        <p><strong>Level 20 encounter:</strong></p>
        <p><strong>Min CP:</strong> 10/10/10: ${escapeHtml(plan.target.normal.minimumRaidIVCP)}</p>
        <p><strong>${jargonTerm("hundo", "Hundo CP")}:</strong> ${escapeHtml(plan.target.normal.hundoCP)}</p>
      </div>
      <div class="raid-cp-set">
        <p><strong>Level 25 weather-boosted encounter:</strong></p>
        <p><strong>Min CP:</strong> 10/10/10: ${escapeHtml(plan.target.weatherBoosted.minimumRaidIVCP)}</p>
        <p><strong>${jargonTerm("hundo", "Hundo CP")}:</strong> ${escapeHtml(plan.target.weatherBoosted.hundoCP)}</p>
      </div>
    </div>
    <p><strong>${jargonTerm("weather-boost", "Weather boost")}:</strong> ${escapeHtml(plan.weatherBoostConditions.join(", ") || "No boosting weather documented")}</p>
    ${plan.weather !== "None" ? `<p class="raid-weather-now">${plan.bossBoostedNow
      ? `<strong>Boosted right now (${escapeHtml(plan.weather)}):</strong> this boss is stronger and its catch will be Level 25.`
      : `Not boosted right now (${escapeHtml(plan.weather)}) — this boss stays at its normal Level 20 catch.`}</p>` : ""}
    <p aria-live="polite">${plan.hundoVerdict.label ? `<strong>${escapeHtml(plan.hundoVerdict.label)}</strong> — ` : ""}${escapeHtml(plan.hundoVerdict.message)}</p>
    ${plan.target.encounterNote ? `<p>${escapeHtml(plan.target.encounterNote)}</p>` : ""}
    ${(() => {
    const kind = megaKind(plan.target.bossFormId, forms[plan.target.bossFormId]);
    return kind ? megaGuidanceCard(kind, plan.target.bossFormId, ui.megaEnergyInventory) : "";
  })()}
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
    <label>Current weather<select data-weather-choice>${WEATHERS.map((weather) => option(weather, weather, ui.weather)).join("")}</select></label>
    <fieldset><legend>Raid view</legend>
      <button type="button" data-raid-view="rankings" aria-pressed="${ui.raid.view === "rankings"}">Top 15 by type</button>
      <button type="button" data-raid-view="target" aria-pressed="${ui.raid.view === "target"}">Raid Target</button>
    </fieldset>
  </div>`;
  return `<div class="raids-view">${controls}${ui.raid.view === "target"
    ? raidTargetSurface(state, ui, roster)
    : renderRaids({ attackingType: ui.raid.attackingType, raids: state.raids, forms: state.core.forms, pvp: state.pvp })}</div>`;
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


function bindInteractions(app, controller, extraClickTargets = []) {
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
  // The update banner lives in the persistent chrome outside #app (it must
  // survive route innerHTML swaps), so it needs its own click hookup into
  // the same [data-action] dispatch.
  for (const target of extraClickTargets) target?.addEventListener?.("click", onClick);
  return () => {
    app.removeEventListener?.("click", onClick);
    app.removeEventListener?.("change", onChange);
    app.removeEventListener?.("input", onInput);
    app.removeEventListener?.("error", handleSpriteError, true);
    for (const target of extraClickTargets) target?.removeEventListener?.("click", onClick);
  };
}


export function bootstrap({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  state = windowObject?.__FIELD_GUIDE_STATE__,
  roster = { schemaVersion: ROSTER_SCHEMA, ownedFormIds: [], ownedFormCounts: {}, favorites: [], preferences: {} },
  releaseState = {},
  releaseManager = null,
  rosterStore = null,
  uiState = null,
  installPrompt = null,
  // Which release chunk files (see ROUTE_CHUNKS) are already merged into
  // `state`; drives the loading fallback below and what onRouteVisit fetches.
  loadedChunkPaths = inferChunkPaths(state),
  // Fired (fire-and-forget) whenever a route renders, so the caller can lazy
  // -fetch that route's missing chunks and re-bootstrap once they land.
  onRouteVisit = null,
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
  applyTheme(documentObject.documentElement, ui.theme);
  const moveCatalog = state.core.methodology?.raidDps?.moveCatalog ?? {};
  const moveIndex = buildMoveIndex(state.raids, state.pvp);
  let controller;
  let searchRefresh = () => {};
  let currentRoute = "home";
  let triageResult = null;
  const getTriageResult = () => {
    if (!triageResult) triageResult = triageRoster({ data: state, roster, trainerLevel: ui.trainerProfile.level });
    return triageResult;
  };
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
        raids: state.raids,
        whatsNew: whatsNewCard(releaseState, storage),
      });
      searchRefresh = bindSearch(documentObject, index, state.core.forms, roster, storage);
    },
    basics() {
      app.innerHTML = renderBasics();
    },
    maxbasics() {
      app.innerHTML = renderMaxBasics();
    },
    types() {
      app.innerHTML = renderTypes();
    },
    eggs() {
      app.innerHTML = interactionNotice(ui) + (state.currentEggs
        ? renderEggs({ currentEggs: state.currentEggs, forms: state.core.forms })
        : chunkLoadingNotice("Egg Pool"));
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
      const placementResult = placementFor(placementState, roster);
      // Smart default: prefill a blank drop-form Pokémon field with the top
      // owned suggestion (same Placement Coach ranking) that isn't already
      // deployed elsewhere. Only applies while the field is genuinely blank,
      // so it never clobbers what the user is actively typing.
      if (!ui.defenseLogDraft.pokemon && placementResult) {
        const deploymentMap = buildDeploymentMap(ui.defenseLog, Date.now());
        const suggestions = (placementResult.ownedAlternatives ?? []).map((row) => ({
          ...row,
          instanceId: bestInstanceForForm(roster.instances ?? [], row.formId)?.id ?? null,
        }));
        // Species already defending THIS gym (one of each species per gym is a
        // real game rule — see gym-availability.js) are excluded, falling back
        // silently to an empty set when the gym field is blank or has no log data.
        const excludedSpecies = speciesDefendingGym(ui.defenseLog, ui.defenseLogDraft.gymName);
        const skippedForGym = suggestions.find((row) => (
          !deploymentMap.has(row.instanceId ?? row.formId) && excludedSpecies.has(row.pokemon)
        ));
        const topFormId = getTopAvailableDefender(suggestions, deploymentMap, excludedSpecies);
        if (topFormId) {
          ui.defenseLogDraft.pokemon = state.core.forms[topFormId]?.name ?? topFormId;
          // Carry the exact roster instance so the logged entry can be
          // matched for availability badging; hand-typed names never get one.
          ui.defenseLogDraft.instanceId = suggestions.find((row) => row.formId === topFormId)?.instanceId ?? null;
          ui.defenseLogDraft.autoPicked = true;
          ui.defenseLogDraft.autoPickNote = skippedForGym && skippedForGym.formId !== topFormId
            ? `${skippedForGym.pokemon} already defends ${ui.defenseLogDraft.gymName} — suggesting the next best available option instead.`
            : "";
        } else {
          // No available defender (all owned suggestions deployed or excluded)
          // — clear any note left over from a previous prefill pass so it
          // doesn't describe a Pokémon that's no longer suggested.
          ui.defenseLogDraft.autoPickNote = "";
        }
      }
      app.innerHTML = interactionNotice(ui) + (state.gym
        ? `${gymLineupControls(state, ui)}${renderGyms({
          gym: state.gym,
          forms: state.core.forms,
          placementResult,
          ownedFormIds: roster.ownedFormIds,
          ownedIndex: ui.gym.ownedIndex,
          overallIndex: ui.gym.overallIndex,
          defenseLog: ui.defenseLog,
          defenseLogDraft: ui.defenseLogDraft,
          rosterInstances: roster.instances,
          trainerTeam: ui.trainerProfile.team,
        })}`
        : fallbackSections.gyms);
    },
    pvp() {
      app.innerHTML = interactionNotice(ui) + (state.pvp
        ? renderPvp({
          pvp: state.pvp, pvpTeams: state.pvpTeams,
          pvpAlternatives: state.pvpAlternatives, forms: state.core.forms,
          roster, state: ui.pvp, trainerLevel: ui.trainerProfile.level,
        })
        : fallbackSections.pvp);
    },
    swap() {
      app.innerHTML = interactionNotice(ui) + (state.pvp
        ? renderSwap({
          pvp: state.pvp, pvpTeams: state.pvpTeams, forms: state.core.forms,
          roster, state: ui.swap, moveCatalog,
        })
        : (fallbackSections.swap || chunkLoadingNotice("Swap")));
    },
    coach() {
      // Coach composes raid targets, current bosses/events, PvP teams, and
      // Future-Proof picks from several release chunks — a partial mix would
      // silently under-report (e.g. "nothing worth raiding" because bosses
      // just haven't loaded yet), so it waits for all of them rather than
      // rendering a misleading summary.
      app.innerHTML = interactionNotice(ui) + (routeChunksReady("coach", loadedChunkPaths)
        ? renderCoach({ data: state, roster, trainerLevel: ui.trainerProfile.level })
        : chunkLoadingNotice("Coach"));
    },
    today() {
      // Same honesty gate as Coach: the checklist reads events + coach picks,
      // so it waits for those chunks instead of claiming an empty day.
      app.innerHTML = interactionNotice(ui) + (routeChunksReady("today", loadedChunkPaths)
        ? renderToday({
          data: state, roster, defenseLog: ui.defenseLog, storage,
        })
        : chunkLoadingNotice("Today"));
    },
    triage() {
      // Same honesty concern as Coach: a "cut" or "keep" verdict computed
      // from partially-loaded raids/pvp/budget data would be wrong, not just
      // incomplete, so triage waits for its chunks before judging the roster.
      app.innerHTML = interactionNotice(ui) + (routeChunksReady("triage", loadedChunkPaths)
        ? renderTriage({
          result: getTriageResult(),
          forms: state.core.forms,
          state: ui.triage,
          showGuide: showTriageGuide(storage),
        })
        : chunkLoadingNotice("Triage"));
    },
    more() {
      // Storage estimate is async and only needs fetching once per session;
      // cache it on ui.diagnostics and rerender More when it resolves.
      if (ui.diagnostics.storageEstimate === undefined) {
        ui.diagnostics.storageEstimate = null;
        windowObject.navigator?.storage?.estimate?.()
          .then((estimate) => {
            ui.diagnostics.storageEstimate = estimate ?? false;
            if (currentRoute === "more") renderers.more();
          })
          .catch(() => { ui.diagnostics.storageEstimate = false; });
      }
      app.innerHTML = (routeChunksReady("more", loadedChunkPaths)
        ? renderMore({
          ...state.core,
          budgets: state.budgets,
          megasPrimals: state.megasPrimals,
          futureProof: state.futureProof,
          coveragePlanner: state.coveragePlanner,
          listId: ui.moreList ?? new URLSearchParams(windowObject.location?.search ?? "").get("list"),
          roster,
          rosterQuery: ui.rosterQuery,
          collectionQuery: ui.collectionQuery,
          collectionFilter: ui.collectionFilter,
          rosterShareOpen: ui.rosterShareOpen,
          textSize: ui.textSize,
          theme: ui.theme,
          trainerProfile: ui.trainerProfile,
          stardust: ui.stardust,
          backupNudge: ui.backupNudge,
          backupImportPreview: ui.backupImportPreview,
          pushFlag: isPushFlagEnabled(storage),
          pushPermission: pushState({
            flagEnabled: isPushFlagEnabled(storage),
            permission: windowObject.Notification?.permission,
          }),
          release: releaseView(releaseState),
          update: { ...releaseState, label: releaseLabel(releaseState) },
          diagnostics: {
            entries: loadDiagnostics(storage),
            copyStatus: ui.diagnostics.copyStatus,
            copyPayload: ui.diagnostics.copyPayload,
            storageEstimate: ui.diagnostics.storageEstimate,
            swControllerState: !windowObject.navigator?.serviceWorker
              ? "unsupported"
              : (windowObject.navigator.serviceWorker.controller ? "controlled" : "not controlled"),
            selfRepairAt: Number(storage?.getItem?.(SELF_REPAIR_GUARD_KEY)) || null,
            // Which release chunks have actually merged into state this
            // session — "why is Coach stuck loading" support signal.
            loadedChunks: [...loadedChunkPaths].sort(),
          },
        })
        : fallbackSections.more) + interactionNotice(ui);
    },
  };
  for (const route of Object.keys(renderers)) {
    const base = renderers[route];
    renderers[route] = () => {
      currentRoute = route;
      // Handle URL quick-log params for gyms: ?log=1&gym=<name>&mon=<formId>#gyms
      // searchParams.get() returns already-decoded values, so don't decodeURIComponent again
      if (route === "gyms") {
        const url = new URL(windowObject.location.href);
        if (url.searchParams.get("log") === "1") {
          const gymName = url.searchParams.get("gym");
          const monFormId = url.searchParams.get("mon");
          if (gymName) ui.defenseLogDraft.gymName = gymName;
          if (monFormId) {
            ui.defenseLogDraft.pokemon = monFormId;
            // URL text is untrusted and not a roster pick — never badge-match it.
            ui.defenseLogDraft.instanceId = null;
          }
          // Clear the log param so it doesn't re-clobber on rerenders
          url.searchParams.delete("log");
          windowObject.history.replaceState({}, "", url.href);
          // Don't auto-submit; let user review and click submit
        }
      }
      base();
      // Route-driven chunk loading: kick off (fire-and-forget) any release
      // chunk this route needs but hasn't loaded yet, AFTER base() has
      // rendered off the current loadedChunkPaths — ensureRouteChunks claims
      // missing paths synchronously (before its first await), so calling it
      // first would make routeChunksReady lie to base() about data that
      // hasn't landed yet. onRouteVisit re-bootstraps once the fetch lands
      // so the loading notice/fallback above swaps for the real view.
      onRouteVisit?.(route);
      // Prepend into #app so the guide scrolls with the view instead of
      // sitting in fixed chrome above the bezel. insertAdjacentHTML (not a
      // second innerHTML assignment) only parses the new fragment, so it
      // doesn't tear down nodes base() already bound live listeners to
      // (e.g. home's search input via bindSearch).
      app.insertAdjacentHTML("afterbegin", renderGuide(route, storage));
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
          focusInstanceId: ui.instanceSheet.focusInstanceId,
          quickCp: ui.instanceSheet.quickCp,
          shareMessage: ui.instanceSheet.shareMessage,
        });
      }
      updateLeds(documentObject, releaseState, roster);
      updateBanner(documentObject, releaseState, storage);
      updateStalenessBanner(documentObject, roster, storage, currentRoute);
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
    renderRoute(route) {
      renderers[route]?.();
    },
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
    onBackupExport(payload) {
      downloadFile("pokemon-go-field-guide-backup.json", payload, { documentObject, windowObject });
    },
    onShareCard(type, data) {
      return shareOrDownloadCard(type, data, { documentObject, windowObject, navigatorObject: windowObject.navigator });
    },
    async onClipboardCopy(payload) {
      const clipboard = windowObject.navigator?.clipboard;
      if (!clipboard?.writeText) return false;
      try {
        await clipboard.writeText(payload);
        return true;
      } catch {
        return false;
      }
    },
    onConfirm: (message) => Boolean(windowObject.confirm?.(message)),
    getTriageResult,
    onRosterChanged() { triageResult = null; },
    searchRefresh: () => searchRefresh(),
    rerenderCurrent: () => renderers[currentRoute]?.(),
    isCurrentRoute: (route) => currentRoute === route,
    rootElement: documentObject.documentElement,
    scrollToTop: () => app.scrollTo?.(0, 0),
    storage,
  });
  router.start();
  const stopInteractions = bindInteractions(app, controller, [
    documentObject.getElementById?.("update-banner"),
    documentObject.getElementById?.("staleness-banner"),
  ]);
  return { status: "ready", router, searchIndex: index, controller, ui, stopInteractions };
}


const SELF_REPAIR_GUARD_KEY = "pogo-sw-self-repair-at";
const SELF_REPAIR_COOLDOWN_MS = 10 * 60 * 1000;

// Escape hatch for clients stranded by a broken service-worker upgrade
// (2026-07-22 incident: purged caches + pruned release left boot with no
// data forever). Drops SW registrations and caches only — localStorage and
// IndexedDB (roster, stars, prefs) are deliberately untouched — then
// reloads once. The cooldown stamp bounds this to one attempt per window
// so a genuinely-down server cannot cause a reload loop.
export async function attemptSelfRepair({
  windowObject = globalThis.window,
  navigatorObject = globalThis.navigator,
  cachesObject = globalThis.caches,
  now = Date.now,
} = {}) {
  const storage = windowObject?.localStorage;
  if (!navigatorObject?.serviceWorker?.getRegistrations || !storage) return false;
  if (navigatorObject.onLine === false) return false;
  const registrations = await navigatorObject.serviceWorker.getRegistrations();
  if (!registrations.length) return false;
  const last = Number(storage.getItem(SELF_REPAIR_GUARD_KEY) ?? 0);
  if (Number.isFinite(last) && now() - last < SELF_REPAIR_COOLDOWN_MS) return false;
  storage.setItem(SELF_REPAIR_GUARD_KEY, String(now()));
  for (const registration of registrations) await registration.unregister();
  if (cachesObject?.keys) {
    for (const key of await cachesObject.keys()) await cachesObject.delete(key);
  }
  windowObject?.location?.reload?.();
  return true;
}

export async function startFieldGuide({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  releaseManager = new ReleaseManager({ baseUrl: windowObject?.location?.href ?? "./" }),
  rosterStore = null,
} = {}) {
  const root = documentObject?.documentElement;
  root?.setAttribute?.("data-offline-ready", "false");
  installDiagnosticsCapture({
    windowObject,
    getRoute: () => windowObject?.location?.hash?.slice(1) || "home",
    getShellRevision: () => APP_SHELL_REVISION,
    getReleaseId: () => releaseManager?.state?.manifest?.releaseId ?? "unknown",
  });
  let active = null;
  let roster = {
    schemaVersion: ROSTER_SCHEMA, ownedFormIds: [], ownedFormCounts: {}, favorites: [], preferences: {},
  };
  const ui = createInteractionState({ roster, storage: windowObject?.localStorage ?? null });
  let store = rosterStore;
  let releaseState;
  function mergedState() {
    return { core: releaseState.data, ...releaseState.data, ...chunkLoader.extraChunkData };
  }
  function rebootstrap() {
    active?.router?.stop?.();
    active?.stopInteractions?.();
    active = bootstrap({
      windowObject,
      documentObject,
      state: mergedState(),
      roster,
      releaseState,
      releaseManager,
      rosterStore: store,
      uiState: ui,
      loadedChunkPaths: chunkLoader.loadedChunkPaths,
      onRouteVisit: chunkLoader.ensureRouteChunks,
    });
  }
  // core.json loads eagerly (see ReleaseManager); raids/pvp/gyms/extras load
  // lazily per route — see ROUTE_CHUNKS and createRouteChunkLoader.
  const chunkLoader = createRouteChunkLoader({
    releaseManager,
    getReleaseState: () => releaseState,
    onChunksLoaded: rebootstrap,
  });
  releaseManager.subscribe((nextReleaseState) => {
    releaseState = nextReleaseState;
    root?.setAttribute?.("data-offline-ready", releaseState.offlineReady ? "true" : "false");
    if (!releaseState.data) return;
    chunkLoader.reset();
    rebootstrap();
  });
  try {
    releaseState = await releaseManager.initialize();
  } catch {
    releaseState = releaseManager.state ?? { data: null };
  }
  if (!releaseState?.data) void attemptSelfRepair({ windowObject });
  if (releaseState.data) {
    try {
      store = store ?? createIndexedDbAdapter();
      roster = await loadRoster(store);
      const gymDefenderForms = gymEligibleDefenderForms(releaseState.data.forms ?? {});
      const validFormIds = new Set(Object.keys(releaseState.data.forms ?? {}));
      // The pre-roster bootstrap may already have consumed a ?boss= deep link
      // (and deleted the param from the URL); rebuilding interaction state for
      // the roster must not wipe that selection back to defaults.
      const priorRaid = ui.raid;
      replaceObject(ui, createInteractionState({
        roster,
        validFormIds,
        gymDefenderFormIds: new Set(gymDefenderForms.map((form) => form.form_id)),
        gymDefenderSpeciesByFormId: new Map(
          gymDefenderForms.map((form) => [form.form_id, form.dex]),
        ),
        storage: windowObject?.localStorage ?? null,
      }));
      if (priorRaid) ui.raid = raidState(priorRaid, validFormIds);
      rebootstrap();
    } catch {
      // Roster failure must not replace a usable guide with an empty shell.
    }
  }
  return { releaseManager, releaseState, app: active };
}


if (typeof window !== "undefined" && typeof document !== "undefined") {
  void startFieldGuide();
}
