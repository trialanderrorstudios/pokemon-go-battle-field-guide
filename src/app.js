import { announce, createRouter, resolveRoute, ROUTES } from "./router.js";
import { APP_SHELL_REVISION, ReleaseManager } from "./release-manager.js";
import { ATTACK_TYPES, WEATHERS, becauseLine, buildRaidPlan, loadWeather, powerUpCost, saveWeather } from "./raid-target.js";
import {
  REFERENCE_PAGES,
  buildSearchIndex, loadRecentSearches, removeRecentSearch, saveRecentSearch, search,
} from "./search.js";
import {
  blankRoster,
  ROSTER_SCHEMA,
  createIndexedDbAdapter,
  importRoster,
  loadRoster,
  loadTrainerProfile,
  saveTrainerProfile,
  stableRosterJson,
} from "./storage.js";
import {
  addFriend,
  isValidFriendCode,
  loadFriendList,
  loadMyFriendCode,
  normalizeFriendCode,
  removeFriend,
  saveMyFriendCode,
  updateFriend,
} from "./friend-codes.js";
import { defenderPoolFromRanking, scorePlacement } from "./placement.js";
import { jargonTerm } from "./glossary.js";
import { dismissGuide, renderGuide, showGuide } from "./guide.js";
import {
  briefingCardCollapsedKey, briefingCollapsedKey, currentRaidPlanCardData, escapeHtml, ownedStarButton, renderHome, viewSegments,
} from "./views/home.js";
import { renderBasics } from "./views/basics.js";
import { renderMaxBasics } from "./views/maxbasics.js";
import { renderTypes, typeChip } from "./views/types.js";
import { weaknessesOf } from "./type-chart.js";
import { renderGlossary } from "./views/glossary.js";
import { handleSpriteError, spriteHtml } from "./sprites.js";
import { buildLazyGymBody, renderGyms } from "./views/gyms.js";
import { blankOcrIntakeState, blankQuickAddDraft, renderDex } from "./views/dex.js";
import { renderLeaderboard } from "./views/leaderboard.js";
import { MORE_LISTS, renderMore } from "./views/more.js";
import { buildMoveIndex } from "./moves.js";
import { moveLink, renderMoveSheet } from "./views/move-sheet.js";
import { renderInstanceSheet } from "./views/instance-sheet.js";
import { STANDARD_TARGET_DEFENSE, instanceBreakpointReports } from "./breakpoints.js";
import { buildParty } from "./party-optimizer.js";
import { buildGroupPack, parseGroupPack } from "./group-pack.js";
import { loadGroupMembers, removeGroupMember, saveGroupMember } from "./group-store.js";
import { renderGroupView } from "./views/group.js";
import { loadJournal, logJournalEntry, streakInfo, weeklyRecap } from "./journal.js";
import { genJustCompleted } from "./journal-hooks.js";
import { generateQuests, loadQuestState, toggleQuest, renderDailyQuestsCard } from "./daily-quests.js";
import { bossCountdowns, renderCountdownChips } from "./boss-countdown.js";
import { evolutionHolds, holdForFormId, renderEvolutionHoldsCard } from "./evolution-holds.js";
import { evolveChecklist } from "./evolve-checklist.js";
import { eventEvolveAdvice, renderEventEvolveCard } from "./event-evolve-advisor.js";
import { streakChipHtml } from "./views/journal.js";
import { simulateParty } from "./battle-sim.js";
import { counterSimTimes, soloVerdict } from "./sim-verdicts.js";
import { renderPartyPanel } from "./views/party.js";
import { clearBuddyPlan, loadBuddyPlan, saveBuddyPlan } from "./buddy.js";
import {
  bestInstanceForForm, buildImportedInstance, buildInstance, instanceLevel, ivCandidatesFromCpHp,
  reviseInstanceCp, solveLevel, STAR_TIER_RANGES,
} from "./instances.js";
import { nextMarkState } from "./collection.js";
import { parsePokeGenieCsv } from "./poke-genie-import.js";
import {
  appraisalTierFromText, baseSpeciesName, draftFromParse, extractMoves, parseMonScreenText, speciesFromContext,
} from "./ocr-intake.js";
import { cpBannerRetry } from "./ocr-worker.js";
import { readAppraisalBars, pickCandidateByBars } from "./ocr-appraisal-bars.js";
import { createOcrEngine as createOcrEngineDefault, OcrEngineError } from "./ocr-worker.js";
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
import {
  rotationPackCardData, trophyCardData,
  gymDefenseCardData, gymLineupCardData, instanceCardData, shareOrDownloadCard, triageSummaryCardData,
} from "./share-card.js";
import {
  exportDexSummary,
  importFriendSummary,
  loadTradeFriends,
  removeTradeFriend,
  tradeComparison,
} from "./trade-share.js";
import { renderTrades } from "./views/trades.js";
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
import { buildPvpFullRankings, createPvpState, renderPvp } from "./views/pvp.js";
import { withMyTeamOverride } from "./pvp-team.js";
import { renderRaids } from "./views/raids.js";
import {
  advanceDrillQuestion,
  answerDrillQuestion,
  buildMoveCountPool,
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
import { toggleTodayTask } from "./views/today.js";
import { todayDateISO, todayTaskKey } from "./today-tasks.js";
import { renderEggs } from "./views/eggs.js";
import { renderRocket } from "./views/rocket.js";
import { renderHundo } from "./views/hundo.js";
import { renderDelta } from "./views/delta.js";
// Home's "Spend resources here" rows. next-action.js has been in the three
// shell allowlists since it landed, but nothing ever imported it — the
// invest section threw a ReferenceError on every render until now.
import { nextActions } from "./next-action.js";
import { loadCachedReleaseDiff, refreshReleaseDiff, releaseDiffDismissedKey } from "./release-diff.js";
import { renderTricks } from "./views/tricks.js";
import { renderEvolutionItems } from "./views/evolution-items.js";
import { renderCandyPlan } from "./views/candyplan.js";
import { buildGapByFormId, typeCoverage, weakLanes } from "./gap-analyzer.js";
import { renderBuildNext } from "./views/buildnext.js";
import { triageRoster } from "./triage.js";
import { renameStringForEntry } from "./rename-string.js";
import {
  advanceTriageView,
  candyTransferText,
  createTriageViewState,
  renamePlanText,
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
// not listed here (basics and its Learn sub-views) render from static copy
// only and never touch release chunk data.
//
// A route's entry is the union of every sub-view it renders — chunk loading is
// keyed on the route, so #raids/hundo's data has to be declared by raids.
//
// Not a route key any URL resolves to — see the comment on ROUTE_CHUNKS.home
// below for why raids.json is fetched under this key instead of eagerly with
// Home's other chunks.
export const HOME_DEFERRED_CHUNK_KEY = "home:gap-teaser";

export const ROUTE_CHUNKS = Object.freeze({
  // raid-targets/current-bosses/current-events/extras are what Home's actual
  // content (Coming Up, invest-here rows, future-proof badges) is built
  // from, so those stay eager. raids.json is deliberately NOT here: Home's
  // only use of it is the roster-gap teaser (getGapByFormId below), and
  // raids.json (now split — see raids-regular.json/raids-shadow.json below)
  // alone was 1.09MB raw (92KB gzip) — the single biggest file Home was
  // parsing on every visit for a teaser most sessions never look at. It's
  // fetched separately, only after the four chunks above have landed, under
  // HOME_DEFERRED_CHUNK_KEY below — see the home renderer's onRouteVisit
  // chaining for the fetch trigger. getGapByFormId's gate doesn't care which
  // route triggered the load, so the teaser still renders honestly once both
  // halves land and stays a no-op (never a guessed gap) until then.
  home: ["raid-targets.json", "current-bosses.json", "current-events.json", "extras.json"],
  // current-bosses/current-events/pvp belong to the Hundo Priority sub-view:
  // a chase/don't-chase verdict built from partial raid+PvP data would be
  // wrong, not just incomplete. raids.json is split into raids-regular.json
  // + raids-shadow.json (pwa.py's VIEW_KEYS/SPLIT_KEY_OWNERS) — both own the
  // top-level `raids` key, so both are always requested together; see
  // ensureRouteChunks below for the merge that keeps both halves.
  raids: ["raids-regular.json", "raids-shadow.json", "raid-targets.json", "current-bosses.json", "current-events.json", "pvp.json"],
  gyms: ["gyms.json"],
  // The drop-form's Placement Coach prefill reads the same ranked defenders
  // the Gyms page does; undeclared, a cold deep-link silently loses it.
  leaderboard: ["gyms.json"],
  pvp: ["pvp.json"],
  // gyms.json: ranked defenders are a KEEP signal — without it triage marks
  // Blissey-class walls as transfer candy (operator-reported 2026-07-23).
  // current-bosses/current-events belong to the Roster Gaps sub-view, which
  // scores candidates against the bosses actually in rotation.
  triage: ["raids-regular.json", "raids-shadow.json", "pvp.json", "extras.json", "gyms.json", "current-bosses.json", "current-events.json"],
  more: ["extras.json"],
  // acquisition.json: where Eggs come from, and what the "Adventure Sync" tag
  // on a row actually means — the page tagged rows and explained neither.
  eggs: ["current-eggs.json", "acquisition.json"],
  basics: ["acquisition.json"],
  rocket: ["raid-targets.json", "current-bosses.json", "current-events.json", "rocket-lineups.json"],
  // The dex entry aggregates a form's gym/pvp/raid-boss/acquisition/egg-pool
  // facts (see docs/dex-route-spec.md §4). raids.json is deliberately NOT
  // here for the same reason as Home above — it's the single biggest file,
  // and the entry's raid-attacker section is one section among many, not the
  // reason most visits happen — so it's chained through HOME_DEFERRED_CHUNK_KEY
  // after these five land (see the dex-route-visit chaining below).
  dex: ["gyms.json", "pvp.json", "acquisition.json", "current-eggs.json", "raid-targets.json"],
  // Not a real route — no URL ever resolves here. It exists so the deferred
  // raids.json fetch (see ROUTE_CHUNKS.home above) can go through the exact
  // same claim/load/merge machinery as a real route instead of a bespoke
  // fetch call.
  [HOME_DEFERRED_CHUNK_KEY]: ["raids-regular.json", "raids-shadow.json"],
});

export function chunksNeededFor(route, loadedChunkPaths) {
  return (ROUTE_CHUNKS[route] ?? []).filter((path) => !loadedChunkPaths.has(path));
}

export function routeChunksReady(route, loadedChunkPaths) {
  return (ROUTE_CHUNKS[route] ?? []).every((path) => loadedChunkPaths.has(path));
}

// True once any chunk this route needs has exhausted its auto-retries (see
// createRouteChunkLoader's MAX_CHUNK_LOAD_ATTEMPTS) — the honesty gate the
// route-level error+retry notice renders off, instead of the indefinite
// loading one.
export function routeChunkFailed(route, failedChunkPaths) {
  return (ROUTE_CHUNKS[route] ?? []).some((path) => failedChunkPaths.has(path));
}


// Mirrors pwa.py's VIEW_KEYS: which top-level `state` fields each release
// file's data lands as, once merged in.
const CHUNK_FIELDS = Object.freeze({
  // Both own the top-level "raids" key (pwa.py's SPLIT_KEY_OWNERS) — see
  // ensureRouteChunks below for why that needs its own merge step.
  "raids-regular.json": ["raids"],
  "raids-shadow.json": ["raids"],
  "raid-targets.json": ["raidTargetTool"],
  "gyms.json": ["gym", "placement"],
  "pvp.json": ["pvp", "pvpTeams", "pvpAlternatives"],
  "extras.json": ["budgets", "megasPrimals", "futureProof", "coveragePlanner", "moveSettings"],
  "acquisition.json": ["acquisitionGuide", "shinyOdds"],
  "current-bosses.json": ["currentBosses", "currentMaxBattles"],
  "current-events.json": ["currentEvents", "eventEvolveMoves"],
  "current-eggs.json": ["currentEggs"],
  "rocket-lineups.json": ["rocketLineups"],
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
// Wave-2a HIGH finding (2026-08-11): a failed chunk fetch used to release
// its claim on every failure, so any rerender of the route (hashchange,
// popstate, or literally any in-view interaction — checkboxes/filters all
// call rerender(route)) silently re-fetched forever with no visible sign
// anything was wrong. Cap it: the first attempts keep quietly retrying (a
// transient blip clears itself on the next visit, same as before), but once
// a path exhausts MAX_CHUNK_LOAD_ATTEMPTS it stays claimed (auto-retry
// stops) and moves into failedChunkPaths so the route can render an honest
// error+retry affordance instead of spinning forever.
const MAX_CHUNK_LOAD_ATTEMPTS = 3;

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
  // Paths that hit MAX_CHUNK_LOAD_ATTEMPTS — bootstrap()'s routeChunkFailed()
  // renders the error+retry notice off this instead of the indefinite loading one.
  let failedChunkPaths = new Set();
  let attemptCounts = new Map();
  let extraChunkData = {};
  return {
    // Call whenever a wholesale-new releaseState.data lands (install/update/
    // rollback) — chunk data belongs to one specific release and must never
    // leak across a release change.
    reset() {
      claimedChunkPaths = new Set(["core.json"]);
      loadedChunkPaths = new Set(["core.json"]);
      failedChunkPaths = new Set();
      attemptCounts = new Map();
      extraChunkData = {};
    },
    get loadedChunkPaths() { return loadedChunkPaths; },
    get failedChunkPaths() { return failedChunkPaths; },
    get extraChunkData() { return extraChunkData; },
    ensureRouteChunks,
    // The route's "tap to retry" button: un-claims + clears failure state for
    // this route's still-missing chunks so ensureRouteChunks treats the next
    // call as a fresh first attempt instead of a no-op (still claimed) or a
    // silently-bounded one (attempt count already at the cap).
    retryRoute(route) {
      for (const path of ROUTE_CHUNKS[route] ?? []) {
        if (loadedChunkPaths.has(path)) continue;
        claimedChunkPaths.delete(path);
        failedChunkPaths.delete(path);
        attemptCounts.delete(path);
      }
      return ensureRouteChunks(route);
    },
  };
  // A named local function, not an object-literal method: retryRoute above
  // calls it directly (not via `this.ensureRouteChunks`, which would break
  // once callers detach it — as bootstrap()'s onRouteVisit param always does,
  // passing `chunkLoader.ensureRouteChunks` around as a bare function ref).
  async function ensureRouteChunks(route) {
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
      // One file at a time, not releaseManager.loadReleaseFiles(manifest,
      // missing) in a single call: that method merges every requested
      // file with a flat Object.assign, and raids-regular.json /
      // raids-shadow.json both own the top-level "raids" key (pwa.py's
      // SPLIT_KEY_OWNERS) — whichever loaded second would silently
      // clobber the other's half instead of the two combining. Fetching
      // one path per call costs nothing extra (loadReleaseFiles already
      // awaits its files sequentially), and lets this loop merge `raids`
      // itself instead of overwriting it.
      chunk = {};
      for (const path of missing) {
        const partial = await releaseManager.loadReleaseFiles(manifest, [path]);
        // Shallow-merging the two halves is not enough once `raids` carries a
        // sibling LIST: both chunks ship honorableMentions (9 regular, 2
        // shadow) and a spread makes the second file's array replace the
        // first's instead of joining them. Electric's only mention lives in
        // the regular half, so it vanished whenever shadow loaded second.
        // Concatenate arrays, spread everything else.
        if (partial.raids) partial.raids = mergeRaidsHalves(chunk.raids, partial.raids);
        Object.assign(chunk, partial);
      }
    } catch {
      // A release install/update/rollback may have landed while this fetch
      // was in flight — that already called reset(), repointing
      // claimedChunkPaths to a new Set for the new release. Deleting into it
      // here would strip legitimate claims/loads that belong to the new
      // release, not this stale failed request.
      if (getReleaseState()?.manifest?.releaseId !== requestReleaseId) return;
      let exhausted = false;
      for (const path of missing) {
        const attempts = (attemptCounts.get(path) ?? 0) + 1;
        attemptCounts.set(path, attempts);
        if (attempts >= MAX_CHUNK_LOAD_ATTEMPTS) {
          // Auto-retry stops here — stay claimed so a plain rerender of the
          // route doesn't just fetch again; only retryRoute() below re-arms it.
          failedChunkPaths.add(path);
          exhausted = true;
        } else {
          claimedChunkPaths.delete(path); // Fallback/loading copy stays up; the next visit retries.
        }
      }
      // Nothing auto-rerenders bootstrap() itself once a route settles into
      // "failed" (unlike a loading state, which the next natural rerender —
      // hashchange, an in-view click — repaints anyway) — fire the same
      // callback success uses so the error+retry notice shows up without
      // waiting on an unrelated interaction.
      if (exhausted) onChunksLoaded();
      return;
    }
    // A release install/update/rollback may have landed while this fetch
    // was in flight — that already called reset(); don't let a stale
    // release's chunk data merge into the new one.
    if (getReleaseState()?.manifest?.releaseId !== requestReleaseId) return;
    for (const path of missing) {
      loadedChunkPaths.add(path);
      failedChunkPaths.delete(path);
      attemptCounts.delete(path);
    }
    Object.assign(extraChunkData, chunk);
    onChunksLoaded();
  }
}


function basePathFrom(location) {
  const path = location.pathname;
  return path.endsWith("/") ? path : path.slice(0, path.lastIndexOf("/") + 1);
}


// The window between a route's first visit and its release chunk finishing its
// fetch+parse. This used to render a clone of the pre-JS static section for the
// route, which looks like a real card — so a loading screen read as a stale
// half-loaded app ("it briefly loads with some old cards visible"). Same markup
// as the boot state in index.html, so loading looks like loading wherever it
// happens, and never like content.
function chunkLoadingNotice(label) {
  return `<div class="boot-state" role="status" aria-live="polite">
    <p class="boot-state-kicker">Loading</p>
    <p class="boot-state-title">${escapeHtml(label)}</p>
    <span class="boot-bar" aria-hidden="true"><span class="boot-bar-fill"></span></span>
  </div>`;
}


// Terminal state once a route's chunk fetch has exhausted its auto-retries
// (wave-2a HIGH finding, 2026-08-11) — replaces the indefinite
// chunkLoadingNotice above with what actually happened, a note that the rest
// of the app is unaffected, and a real retry button, instead of a permanent
// unlabeled spinner with the freshness LED still lit green. Offline gets its
// own honest wording, not the same "couldn't load" phrasing an actual 404
// gets — being offline isn't the app breaking.
function chunkErrorNotice(route, label, offline) {
  const message = offline
    ? "You're offline, so this couldn't load. Everything else still works from what's already saved — reconnect and try again."
    : "This didn't load. Everything else on the page still works from what's already saved.";
  return `<div class="boot-state" role="status" aria-live="polite">
    <p class="boot-state-kicker">Couldn't load</p>
    <p class="boot-state-title">${escapeHtml(label)}</p>
    <p class="boot-state-note">${escapeHtml(message)}</p>
    <button type="button" data-action="retry-route-chunks" data-retry-route="${escapeHtml(route)}">Try again</button>
  </div>`;
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


// Tips have no sprite/owned-star affordance (they're not Pokémon forms) —
// just a link into the Tricks page instead of the sprite+star card shape.
function tipSearchResultCard(result, rawQuery) {
  return `<li class="search-result-card search-result-tip"><a class="safe-escape" href="./#basics/tricks" data-route="basics" data-view="tricks"><strong>${highlightMatch(result.name, rawQuery)}</strong> <span>Tip</span></a></li>`;
}

// "What beats this?" — a raid-boss search hit routes straight to that
// boss's prefilled Raid Target answer (weaknesses + counters) via the same
// `?boss=<formId>#raids` deep link home.js/coach.js/cd-brief.js/today.js
// already use, so no new routing/state plumbing. Weaknesses reuse
// type-chart.js's weaknessesOf — never a second hand-rolled type table. No
// owned-star here: a raid boss isn't a roster pick, so it skips
// ownedStarButton unlike the plain pokemon card below.
// A raid-boss hit used to be a sprite, a name and four weakness chips — you
// had to tap through to learn the one thing you are usually searching for,
// which is whether the CP in front of you is a hundo. All of this already
// existed on raidTargetTool; the card simply was not given it.
// One suggestion row. Compact on purpose: the full CP band, counters and
// movesets used to render inline here, which put a wall of raid detail inside a
// dropdown — "displaying raid information is hard to read". All of it already
// lives on the Raid Target page, which is built to display it, so the row links
// there instead of reproducing it badly in a smaller box. Weak-to chips stay
// because they are the one thing you want BEFORE deciding to tap.
function bossSuggestionRow(result, forms, rawQuery, target = null) {
  const weak = weaknessesOf(result.types).slice(0, 4);
  const weakChips = weak.map((row) => (
    `<span class="type-weak-badge${row.multiplier >= 2.56 ? " is-double" : ""}">${typeChip(row.type)}${row.multiplier >= 2.56 ? "4x" : "2x"}</span>`
  )).join("");
  // The hundo is the single number most searches are actually after, so it rides
  // along as one glanceable figure rather than a three-cell table.
  const hundo = target?.normal?.hundoCP
    ? `<span class="search-suggestion-figure">${target.normal.hundoCP} hundo</span>`
    : "";
  // The counters link answers "what beats it" (the reason someone searched a
  // boss); the dex link is a secondary escape to "what does the app know
  // about it" — two sibling <a>s, not one nested inside the other.
  return `<li class="search-result-card search-result-boss">
    <a class="safe-escape search-suggestion" href="./?boss=${encodeURIComponent(result.formId)}#raids">
      ${spriteHtml(result.formId, forms, result.name, forms?.[result.formId]?.primary_type)}
      <span class="search-suggestion-body">
        <strong>${highlightMatch(result.name, rawQuery)}</strong>
        <span class="search-suggestion-meta">Raid boss${hundo ? " · " : ""}${hundo}</span>
        ${weakChips ? `<span class="type-chip-list" aria-label="Weak to">${weakChips}</span>` : ""}
      </span>
    </a>
    <a class="safe-escape search-suggestion-dex-link" data-route="dex" href="./#dex/${encodeURIComponent(result.formId)}">Dex entry →</a>
  </li>`;
}


// "No local matches." answered 9 of 12 realistic queries and told the reader
// nothing about what else to type. The gym line is conditional on purpose: the
// anti-<type> band vocabulary lives in gyms.json, which Home deliberately does
// NOT preload (610.6 KB), so before a Gyms visit those queries genuinely have
// nothing to match and saying so beats a silent zero. Elite-TM acquisition
// content is not indexed at all, so nothing here promises it.
function searchEmptyState(rawQuery, raidData) {
  const query = String(rawQuery ?? "").trim();
  const bandLine = raidData?.gym
    ? `Gym defenders answer to <strong>anti fighting</strong> or <strong>what beats Blissey</strong>.`
    : `Gym defender searches (<strong>anti fighting</strong>, <strong>what beats Blissey</strong>) start working once you have opened <a class="safe-escape" href="./#gyms/defend" data-route="gyms" data-view="defend">Gyms</a> — that data isn't downloaded until then.`;
  const references = REFERENCE_PAGES.map((page) => (
    `<a class="safe-escape" href="./#${escapeHtml(page.route)}/${escapeHtml(page.view)}" data-route="${escapeHtml(page.route)}" data-view="${escapeHtml(page.view)}">${escapeHtml(page.title)}</a>`
  )).join(" · ");
  return `<p class="search-empty">No local matches for “${escapeHtml(query)}”.</p>
    <p class="search-empty">Species, types and moves are all indexed, and form names work in either order — <strong>shadow tyranitar</strong> or <strong>Tyranitar (Shadow)</strong>.</p>
    <p class="search-empty">${bandLine}</p>
    <p class="search-empty">Reference pages: ${references}</p>`;
}


// An autocomplete list, not a results page. Every row is one tappable line that
// says what the thing is and sends you to the surface that shows it properly.
// Ten dense cards inside a dropdown was the old shape, and a full raid CP band
// plus counters rendered in that box is what "hard to read" meant.
function renderSearchResults(results, forms, roster, rawQuery = "", raidData = {}) {
  if (!results.length) return searchEmptyState(rawQuery, raidData);
  const owned = new Set(roster?.ownedFormIds ?? []);
  const targetsByForm = new Map(
    (raidData.raidTargetTool?.targets ?? []).map((target) => [target.bossFormId, target]),
  );
  const rows = results.slice(0, 8).map((result) => {
    if (result.resultCategory === "tip") return tipSearchResultCard(result, rawQuery);
    if (result.resultCategory === "reference") {
      return `<li class="search-result-card search-result-reference">
        <a class="safe-escape search-suggestion" href="./#${escapeHtml(result.route)}${result.view ? `/${escapeHtml(result.view)}` : ""}" data-route="${escapeHtml(result.route)}" data-view="${escapeHtml(result.view ?? "")}">
          <span class="search-suggestion-body">
            <strong>${highlightMatch(result.name, rawQuery)}</strong>
            <span class="search-suggestion-meta">Reference — how it works</span>
          </span>
        </a>
      </li>`;
    }
    if (result.resultCategory === "raid-boss") {
      return bossSuggestionRow(result, forms, rawQuery, targetsByForm.get(result.formId) ?? null);
    }
    // A species that is also a raid target keeps its counters destination
    // (the "what beats it" intent) plus a secondary dex link. One that is
    // not a raid target used to dead-end in a plain, untappable <span> — the
    // Drifblim scenario docs/dex-route-spec.md was written to fix — so it now
    // links straight to its dex entry instead.
    const target = targetsByForm.get(result.formId) ?? null;
    const isOwned = owned.has(result.formId);
    const label = `${spriteHtml(result.formId, forms, result.name, forms?.[result.formId]?.primary_type)}<span class="search-suggestion-body"><strong>${highlightMatch(result.name, rawQuery)}</strong><span class="search-suggestion-meta">Pokémon${target ? " · raid target" : ""}</span></span>`;
    const dexHref = `./#dex/${encodeURIComponent(result.formId)}`;
    return `<li class="search-result-card${isOwned ? " is-owned" : ""}">${target
      ? `<a class="safe-escape search-suggestion" href="./?boss=${encodeURIComponent(result.formId)}#raids">${label}</a><a class="safe-escape search-suggestion-dex-link" data-route="dex" href="${dexHref}">Dex entry →</a>`
      : `<a class="safe-escape search-suggestion" data-route="dex" href="${dexHref}">${label}</a>`}${ownedStarButton({ formId: result.formId, name: result.name, owned: isOwned, route: "search" })}</li>`;
  }).join("");
  const more = results.length > 8
    ? `<li class="search-more">${results.length - 8} more — keep typing to narrow it down</li>`
    : "";
  // Plain list, NOT role="listbox". It carried listbox/option roles with no
  // combobox on the input — an orphaned pattern where ArrowDown did nothing and
  // Tab walked into the rows. A row is not a listbox option: it holds up to
  // three separate targets (counters link, "Dex entry →", the owned star), and
  // ARIA forbids focusable descendants inside role="option". A list of links is
  // what this actually is, and Tab through it already works.
  return `<ul class="search-suggestions" aria-label="Search suggestions">${rows}${more}</ul>`;
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


// Top counters for a boss, from the ranked attacker lists the app already
// ships: the types that hit it super-effectively, best-ranked first. Cheap
// because it only runs for raid-boss hits, of which there are a handful.
function countersForBoss(result, raidData) {
  const rows = raidData.raids?.regular ?? [];
  if (!rows.length) return [];
  const superEffective = new Set(weaknessesOf(result.types ?? []).map((row) => row.type));
  return rows
    .filter((row) => row.status === "ranked" && superEffective.has(row.attackingType))
    .sort((left, right) => left.rank - right.rank)
    .filter((row, position, all) => all.findIndex((other) => other.formId === row.formId) === position)
    .slice(0, 3);
}


export function bindSearch(documentObject, index, forms, roster, storage = null, raidData = {}) {
  const form = documentObject.querySelector("[data-global-search]");
  const input = form?.querySelector("input[type='search']");
  const output = form?.querySelector("[data-search-results]");
  if (!input || !output) return () => {};
  const recentsContainer = form?.querySelector("[data-search-recents]");
  // The results container is authored as aria-live="polite" (views/home.js,
  // views/dex.js), which re-read all 531 characters of the list on every
  // keystroke. Dropped at bind time — an innerHTML swap doesn't restore an
  // attribute on the container itself — in favour of the short count announced
  // in render() below. The markup should lose the attribute too; it belongs to
  // the views lane.
  output.removeAttribute?.("aria-live");
  const renderRecents = () => {
    if (!recentsContainer) return;
    recentsContainer.innerHTML = recentSearchesHtml(loadRecentSearches(storage));
  };
  const render = () => {
    const query = input.value.trim();
    const results = query ? search(index, input.value) : [];
    output.innerHTML = query
      ? renderSearchResults(results, forms, roster, input.value, raidData)
      : "";
    if (query) announce(documentObject, `${results.length} ${results.length === 1 ? "match" : "matches"} for ${query}`);
    // Recents stay up when a query found nothing: hiding them was the other
    // half of the dead-end empty state.
    if (recentsContainer) recentsContainer.hidden = Boolean(query) && results.length > 0;
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
  // "updating" means a newer release is staging over the top of the current
  // one, so the data on screen is no longer the freshest available — the LED
  // said otherwise while releaseLabel() right beside it already read
  // "Downloading and verifying data". Brief on a fast connection, but the whole
  // release is 4.6MB, so on a phone it is exactly when the reader is deciding
  // whether to trust what they are looking at.
  // Only "updating" is checked: the sibling "caching" state occurs solely when
  // currentReleaseId is null, which the Boolean() below already excludes.
  const dataFresh = !updateReady && releaseState.status !== "updating"
    && releaseState.status !== "failed" && Boolean(releaseState.currentReleaseId);
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
const STALENESS_BANNER_ROUTES = new Set(["more", "home", "pvp", "triage"]);

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


// Disposable UI-flag writes (dismiss banners, collapse cards, snooze,
// today-task check-offs) — never allowed to throw, same swallow-on-failure
// contract as journal.js's persist(): a quota/storage-disabled failure here
// must not bubble through the click dispatcher's delegate wrapper into
// handleFailure and turn a routine dismiss tap into a persistent error
// screen. value === null removes the key; anything else sets it.
function setStorageFlag(storage, key, value) {
  try {
    if (value === null) storage?.removeItem?.(key);
    else storage?.setItem?.(key, value);
  } catch {
    // Disposable UI flag — a failed write here is silent by design.
  }
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
      defenderRows: defenderPoolFromRanking(state.gym),
      forms: state.core.forms,
      weights: state.placement.weights,
    });
  } catch {
    return undefined;
  }
}


// One collator, reused. `localeCompare(value, undefined, options)` constructs a
// fresh Intl.Collator per comparison: measured 15.88ms for the ~14,000
// comparisons this sort makes over 1,402 forms, ×6 calls on #gyms/defend ≈ 94ms.
// The same options through a hoisted collator measured 0.61ms, byte-identical
// ordering. Bare localeCompare() without options is a different (and much
// cheaper) call and is left alone.
const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// Memoized on the `forms` object identity: a cold load re-bootstraps 4-5 times
// as chunks land, and `state.core` (hence `state.core.forms`) is the same object
// every time, so every rebuild after the first was ~25ms of identical work.
const gymEligibleDefenderCache = new WeakMap();

export function gymEligibleDefenderForms(forms = {}) {
  const cached = gymEligibleDefenderCache.get(forms);
  if (cached) return cached;
  const eligible = Object.values(forms).filter((form) => {
    const tags = new Set(form?.tags ?? []);
    const formName = String(form?.form ?? "").toUpperCase();
    const mythicalGymException = form?.dex === 808 || form?.dex === 809;
    // Masterfile gap-fill forms exist so the dex can NAME new species — they
    // carry no ranking/move data and must never enter battle computations.
    if (form?.source === "masterfile-gap") return false;
    return form?.released === true
      && Number(form?.base_defense) > 0
      && Number(form?.base_stamina) > 0
      && !tags.has("mega")
      && !tags.has("legendary")
      && (!tags.has("mythical") || mythicalGymException)
      && !tags.has("ultrabeast")
      && !formName.startsWith("MEGA")
      && formName !== "PRIMAL";
  }).sort((left, right) => NAME_COLLATOR.compare(left.name, right.name)
    || left.form_id.localeCompare(right.form_id));
  gymEligibleDefenderCache.set(forms, eligible);
  return eligible;
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
const RAID_LANES = new Set(["regular", "buildable", "shadow", "owned"]);

const RAID_LEVELS = new Set(["normal", "weatherBoosted"]);
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
    .sort((left, right) => NAME_COLLATOR.compare(left.boss, right.boss)
      || left.bossFormId.localeCompare(right.bossFormId));
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
    lineupShape: filters.lineupShape === "breaker" ? "breaker" : "clean",
    ownedOnly: Boolean(filters.ownedOnly),
  };
}


function blankInstanceDraft() {
  return {
    editingId: null, cp: "", ivs: { atk: "", def: "", sta: "" }, fastMove: "", chargedMoves: [],
    nickname: "", isShiny: false, isLucky: false, caughtYear: "",
  };
}


// I2 dex-entry inline quick-add: populate the flat draft shape
// views/dex.js owns (blankQuickAddDraft(), imported above) from a saved
// instance, for the edit flow. Not a reuse of blankInstanceDraft/
// draftFromInstance above — that's the separate, pre-existing instanceSheet
// modal (More > Roster / Triage's "view details" sheet), untouched here.
function quickAddDraftFromInstance(instance) {
  return {
    ...blankQuickAddDraft(),
    cp: String(instance.cp),
    ivs: { atk: instance.ivs.atk, def: instance.ivs.def, sta: instance.ivs.sta },
    fastMove: instance.fastMove ?? null,
    chargedMoves: [instance.chargedMoves?.[0] ?? null, instance.chargedMoves?.[1] ?? null],
    editingId: instance.id,
    // megaLevel (round 14) replaces megaUnlocked; same legacy-migration rule
    // as storage.js/instances.js — an old instance with only the binary flag
    // seeds the honest floor "base", never invents a higher tier.
    megaLevel: instance.megaLevel ?? (instance.megaUnlocked ? "base" : null),
    // Shiny/Lucky (feature 1): same edit-prefill treatment as megaLevel
    // above — round-trip the instance's own flags into the flat draft.
    isShiny: Boolean(instance.isShiny),
    isLucky: Boolean(instance.isLucky),
    // sizeClass/buddyLevel/heightM/weightKg/canDynamax/canGigantamax
    // (round 15): same edit-prefill treatment as megaLevel/isShiny above —
    // enum fields default null, heightM/weightKg round-trip to the raw typed
    // string the CP field above already uses.
    sizeClass: instance.sizeClass ?? null,
    buddyLevel: instance.buddyLevel ?? null,
    heightM: instance.heightM !== undefined ? String(instance.heightM) : "",
    weightKg: instance.weightKg !== undefined ? String(instance.weightKg) : "",
    canDynamax: Boolean(instance.canDynamax),
    canGigantamax: Boolean(instance.canGigantamax),
  };
}

// Mark-mode session tally at or above this many new catches offers the
// existing backup exporter on the next About visit (spec §7 default
// proposal; trigger condition only — backup.js's nudge machinery is
// unchanged).
const MARK_SESSION_BACKUP_NUDGE_THRESHOLD = 10;
// Long-press duration (ms) before mark mode opens the shiny/lucky mini-sheet
// for a card, same threshold the mockup verified feels intentional vs. a tap.
const MARK_LONG_PRESS_MS = 500;
// .i1-card.card-exit's own animation duration (app.css) — the cleanup timer
// below waits this long before actually dropping the exiting card, so the
// CSS animation gets to play before the DOM catches up.
const MARK_CARD_EXIT_MS = 280;
// I1 long-press mini-sheet: views/collection.js renders it inline (its own
// collectionSheet()), keyed off ui.collectionSheetFormId below — app.js only
// owns the open/close/mark dispatch, not the markup (unlike move/instance
// sheets, this one isn't a body-level overlay).


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
    // Fields the instanceSheet UI doesn't edit must still ride the draft —
    // save-instance rebuilds the row via buildInstance from this draft alone,
    // so anything missing here is silently DELETED on save (the megaUnlocked
    // data-loss incident pattern). buildInstance accepts all of these and
    // omits the absent ones.
    megaLevel: instance.megaLevel ?? (instance.megaUnlocked ? "base" : undefined),
    sizeClass: instance.sizeClass,
    heightM: instance.heightM,
    weightKg: instance.weightKg,
    buddyLevel: instance.buddyLevel,
    canDynamax: Boolean(instance.canDynamax),
    canGigantamax: Boolean(instance.canGigantamax),
    caughtYear: "", // not part of the persisted instance — re-entered per lucky-advice check, see instance-sheet.js
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
    gym: {
      ...gymState(
        savedTask?.route === "gyms" ? taskFilters : {},
        gymDefenderFormIds,
        gymDefenderSpeciesByFormId,
      ),
      // Coverage-band <details> open state (see gyms.js's coverageCell) —
      // ephemeral, session-only, like ui.swap/ui.triage below; kept off the
      // persisted taskFilters round trip since gymState()'s output also
      // seeds structuredClone(ui.gym) for lastTask persistence.
      openBands: new Set(),
    },
    pvp: createPvpState({
      preferences: roster.preferences ?? {},
      filters: savedTask?.route === "pvp" ? taskFilters : {},
    }),
    drill: createDrillState({ storage }),
    swap: createSwapState(),
    triage: createTriageViewState(),
    lastTask: savedTask ? { route: savedTask.route, view: typeof savedTask.view === "string" ? savedTask.view : "" } : null,
    installMessage: "",
    rosterMessage: "",
    rosterQuery: "",
    collectionQuery: "",
    collectionFilter: "all",
    // Two-panel dex index rail (docs/dex-two-panel-spec.md §3.2) — own
    // query/filter state, separate from collectionQuery/collectionFilter:
    // the rail and the Collection grid render on different routes and must
    // not fight over one shared filter.
    dexRailQuery: "",
    dexRailFilter: "all",
    interactionMessage: "",
    moveSheet: null,
    instanceSheet: null,
    // I1 grid mark mode (views/collection.js field names — data.collectionMarkMode
    // etc.): default off = taps navigate.
    collectionMarkMode: false,
    collectionMarkSessionFormIds: [],
    // Caught/Shiny/Lucky segmented control (views/collection.js's
    // [data-collection-marktype]) — which flag a mark-mode grid tap applies.
    // Default "caught" preserves pre-control tap behaviour untouched.
    collectionMarkType: "caught",
    collectionSuggestOpen: false,
    // I1 long-press mini-sheet: the formId it's open for, or null. Rendered
    // by views/collection.js's own collectionSheet(), not app.js.
    collectionSheetFormId: null,
    // I1 filter exit animation: formIds a mark just toggled out of the active
    // filter, rendered exiting for exactly one pass (see applyMarkState).
    collectionExitingFormIds: [],
    // I2 dex-entry inline quick-add — the flat draft shape views/dex.js owns
    // (blankQuickAddDraft()), normalized per-formId at render time (see the
    // dex() renderer). quickAddFormId is bookkeeping only (which entry the
    // draft belongs to) — it is never passed to the view.
    quickAdd: null,
    quickAddFormId: null,
    // I3 OCR bulk-intake — dex.js-owned state shape (blankOcrIntakeState()).
    // Global, not per-formId: a bulk scan can match rows to several different
    // species, unlike quickAdd which is scoped to whichever dex entry is
    // open.
    ocrIntake: blankOcrIntakeState(),
    rosterShareOpen: false,
    bulkRemove: { pattern: "", error: "", matches: null },
    compare: { formIdA: null, formIdB: null, queryA: "", queryB: "" },
    dexShinySprite: false,
    groupMemberName: "",
    groupMessage: "",
    diagnostics: { copyStatus: "", copyPayload: "", storageEstimate: undefined },
    textSize: loadTextSize(storage),
    theme: loadTheme(storage),
    trainerProfile: loadTrainerProfile(storage),
    friendCodeInput: loadMyFriendCode(storage),
    friendCodeError: "",
    friendCodesMessage: "",
    friends: loadFriendList(storage),
    friendDraft: { editingId: null, name: "", code: "", error: "" },
    tradeFriends: loadTradeFriends(storage),
    trade: {
      name: loadTrainerProfile(storage)?.name || "You",
      exportOpen: false,
      importText: "",
      message: "",
      selectedFriendId: null,
    },
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
    buddyPlan: loadBuddyPlan(storage),
    briefingShareMessage: "",
    gymLineupShareMessage: "",
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
  installPrompt = null,
  onRetryRouteChunks = null,
  onRosterExport = null,
  onClipboardCopy = null,
  cpBannerRetry: cpBannerRetryOption = cpBannerRetry,
  onRosterShareCopy = null,
  onTriageCopy = null,
  onDiagnosticsCopy = null,
  onConfirm = () => true,
  onFeedbackExport = null,
  onBackupExport = null,
  onShareCard = null,
  getTriageResult = () => ({ entries: [] }),
  getRaidPlanCardData = () => null,
  getRotationPackCardData = () => null,
  getCurrentBosses = () => null,
  getGymLineupCardData = () => null,
  onRosterChanged = () => {},
  searchRefresh = () => {},
  storage = null,
  rerenderCurrent = () => {},
  isCurrentRoute = () => true,
  currentView = () => "",
  rootElement = null,
  scrollToTop = () => {},
  // I3 OCR bulk-intake: injectable so tests can stub the engine without
  // loading wasm (see web/src/ocr-worker.js). onNavigateToDex is called by
  // the row-edit dispatch when the row's matched species differs from
  // whatever dex entry is currently open — a plain no-op default, since the
  // common case (editing a row for the page you're already on) needs no
  // navigation at all.
  createOcrEngine = createOcrEngineDefault,
  onNavigateToDex = () => {},
} = {}) {
  if (!ui || !roster) throw new TypeError("Interaction state and roster are required.");
  // The controller receives rootElement, never window/document globals —
  // three separate dispatch branches (rotation share r137, compare chip
  // r136, celebration burst r143) each independently reached for a
  // nonexistent window global and threw. One derived accessor, used
  // everywhere in this scope; a static test bans the bare identifiers.
  const controllerWindow = () => rootElement?.ownerDocument?.defaultView ?? globalThis.window;

  const clearTriageCopyStatus = (state = ui) => {
    if (state.triage) {
      state.triage.copyStatus = "";
      state.triage.searchCopyId = "";
      state.triage.searchCopyStatus = "";
      state.triage.renameCopyStatus = "";
    }
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

  // I1 long-press bookkeeping. Pointer-event timing state, not render state —
  // deliberately kept out of `ui` (nothing here is meant to survive/replay
  // across a render). markSuppressClick eats the synthetic click a long-press
  // leaves behind on touch devices; it must be cleared wherever the mini-
  // sheet closes, not just in the grid's own click handler — the sheet covers
  // the grid at pointerup, so that click never reaches the grid to clear it
  // itself (mockup bug, fixed there; ported here — see closeMarkSheet below).
  let markLongPressTimer = null;
  let markSuppressClick = false;
  let markLongPressCardEl = null;
  // dex-pvp "Copy IV code" (data-copy-nickname) one-shot label swap. dex.js
  // owns no render state for this button, so the "Copied"/failure text lives
  // directly on the button node and self-reverts — keyed by node (not ui
  // state) since a re-render swaps in a fresh node anyway.
  const copyIvCodeResetTimers = new WeakMap();
  // I2 IV drag-bar coalescing: a native range fires "input" on every drag
  // tick. The draft updates immediately below so the number stays honest,
  // but the full rerender (tick-bar gradient + solver text) is coalesced to
  // one per animation frame instead of one per tick — a raw per-tick
  // rerender replaces the dragged node's DOM out from under the pointer and
  // kills the gesture mid-drag.
  let ivRangeRerenderHandle = null;

  // Shared caught/shiny/lucky toggle for I1 (grid tap + mini-sheet), reusing
  // the exact roster-field shape the existing single-form quick-toggles use
  // (data-owned-form-id / data-shiny-toggle-form-id / data-lucky-toggle-form-id
  // below) — same flat ownedFormIds/shinyOwnedFormIds/luckyOwnedFormIds sets,
  // just driven by nextMarkState()'s three-way caught/shiny/lucky rule
  // (collection.js) instead of a single-flag flip. Tracks the mark-mode
  // session tally (net catches currently marked, mirroring the mockup's Set
  // semantics: grows on catch, shrinks on release) when mode is on, and stages
  // collectionExitingFormIds for the render that plays a card's exit
  // animation (.card-exit, app.css) before it disappears. That animation is
  // `forwards`, so the card stays in the DOM as an invisible ghost until
  // something clears the staged id and re-renders — a timer here does that
  // after the animation's real duration (immediately under reduced motion,
  // where the CSS animation is itself disabled).
  const applyMarkState = async (formId, mark, value) => {
    const ownedBefore = [...(roster.ownedFormIds ?? [])];
    if (!validFormIds.has(formId)) return null;
    const before = {
      caught: (roster.ownedFormIds ?? []).includes(formId),
      shiny: (roster.shinyOwnedFormIds ?? []).includes(formId),
      lucky: (roster.luckyOwnedFormIds ?? []).includes(formId),
    };
    const next = nextMarkState(before, mark, value);
    failureRoute = "more";
    await mutateRoster((current) => {
      const owned = new Set(current.ownedFormIds ?? []);
      const counts = { ...(current.ownedFormCounts ?? {}) };
      const shiny = new Set(current.shinyOwnedFormIds ?? []);
      const lucky = new Set(current.luckyOwnedFormIds ?? []);
      if (next.caught) {
        owned.add(formId);
        if (!Number.isInteger(counts[formId])) counts[formId] = 1;
      } else {
        owned.delete(formId);
        delete counts[formId];
      }
      if (next.shiny) shiny.add(formId); else shiny.delete(formId);
      if (next.lucky) lucky.add(formId); else lucky.delete(formId);
      return {
        ...current,
        schemaVersion: ROSTER_SCHEMA,
        ownedFormIds: [...owned].sort(),
        ownedFormCounts: Object.fromEntries(
          Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
        ),
        shinyOwnedFormIds: [...shiny].sort(),
        luckyOwnedFormIds: [...lucky].sort(),
      };
    });
    for (const gen of genJustCompleted(ownedBefore, roster.ownedFormIds ?? [], forms)) {
      logJournalEntry(storage, { kind: "gen-completed", at: new Date().toISOString(), detail: { gen } });
    }
    if (ui.collectionMarkMode) {
      // Tally tracks net adds of the mark this tap actually applied (caught/
      // shiny/lucky), not always caught — so a shiny-type tap that flips an
      // already-caught mon's shiny flag still counts, and a caught-type tap
      // still behaves exactly as before.
      const trackedField = mark === "shiny" || mark === "lucky" ? mark : "caught";
      if (next[trackedField] && !before[trackedField] && !ui.collectionMarkSessionFormIds.includes(formId)) {
        ui.collectionMarkSessionFormIds.push(formId);
      } else if (!next[trackedField] && before[trackedField]) {
        ui.collectionMarkSessionFormIds = ui.collectionMarkSessionFormIds.filter((id) => id !== formId);
      }
    }
    const changed = next.caught !== before.caught || next.shiny !== before.shiny || next.lucky !== before.lucky;
    ui.collectionExitingFormIds = changed ? [formId] : [];
    if (changed) {
      const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      setTimeout(() => {
        ui.collectionExitingFormIds = [];
        rerenderCurrent();
      }, reduceMotion ? 0 : MARK_CARD_EXIT_MS);
    }
    return { before, after: next };
  };
  const closeMarkSheet = () => {
    ui.collectionSheetFormId = null;
    markSuppressClick = false; // see the comment on markSuppressClick above
  };
  const persistTask = async (route, nextUi) => {
    failureRoute = route;
    const filters = taskFilters(route, nextUi);
    // The sub-view is a URL fact, so Continue resumes #raids/target, not just
    // #raids. A star tapped from Home persists the route with no view, which
    // is the route default — the honest answer, not a guess.
    const view = isCurrentRoute(route) ? currentView() : "";
    await mutateRoster((current) => {
      const preferences = {
        ...(current.preferences ?? {}),
        lastTask: { route, view, filters },
      };
      if (route === "pvp") preferences.pvp = structuredClone(nextUi.pvp);
      return { ...current, preferences };
    });
    nextUi.lastTask = { route, view };
    nextUi.interactionMessage = "";
    clearTriageCopyStatus(nextUi);
    replaceObject(ui, nextUi);
  };
  const rerender = (route) => renderRoute(route);

  // CP + max-HP jointly pin the IV spread and, when a form family is
  // ambiguous, usually identify the form too (a Hero-stat Zacian cannot
  // produce a Crowned-stat CP/HP pair). Runs after every scan parse and
  // after a manual form pick. Mutates the row in place; pure math on
  // numbers OCR already read — never a guess (empty solve changes nothing).
  const applyOcrIvSolve = (row) => {
    const parsed = row?.parsed;
    if (!parsed || !Number.isInteger(parsed.cp) || !Number.isInteger(parsed.hp)) return;
    if (!parsed.formId && parsed.candidates?.length) {
      const withSolutions = parsed.candidates.filter((candidate) => (
        ivCandidatesFromCpHp(forms[candidate.formId], parsed.cp, parsed.hp).length > 0
      ));
      // Auto-resolve ONLY within a form family (same species, different
      // form). "closest" candidates are edit-distance guesses for a
      // nicknamed mon — a wrong species can admit the same CP/HP pair by
      // coincidence, so those never auto-pick (operator question
      // 2026-08-13: nicknames must not fabricate a species).
      if (parsed.candidatesKind === "family" && withSolutions.length === 1) {
        parsed.formId = withSolutions[0].formId;
        parsed.name = withSolutions[0].name;
        parsed.candidates = [];
        row.issues = (row.issues ?? []).filter((issue) => !/pick (one|manually)/i.test(issue));
        if (parsed.issues) parsed.issues = parsed.issues.filter((issue) => !/pick (one|manually)/i.test(issue));
      } else if (withSolutions.length > 1) {
        parsed.candidates = withSolutions;
      }
    }
    if (!parsed.formId) return;
    // Mega screens: Mega Level 4 ("Super Max") is a +2 effective-level
    // offset — confirmed mechanism, not a stat change — so mega solves run
    // with the extended level-53 ceiling (SUPER_MEGA_MAX_LEVEL) and stay
    // exact. A solution above 51 is itself the tell that the screen was
    // Super Max'd (and/or Best Buddy'd) — annotated, never hidden.
    const isMegaForm = parsed.formId.includes("-mega");
    const solveOptions = isMegaForm ? { maxLevel: 53 } : undefined;
    // A low-confidence (banner-retry / junk-prefix) CP gets one free
    // validation: a real CP+HP pair ALWAYS admits at least one IV spread,
    // so zero solutions means the read was noise ("629" off a cropped 5629,
    // real device 2026-08-13) — drop it rather than poison the row.
    if (parsed.confidence?.cp === "low" && Number.isInteger(parsed.cp) && Number.isInteger(parsed.hp)
      && ivCandidatesFromCpHp(forms[parsed.formId], parsed.cp, parsed.hp, solveOptions).length === 0) {
      parsed.cp = null;
      delete parsed.confidence.cp;
      parsed.issues = [...(parsed.issues ?? []), "CP banner read rejected — it fits no IV spread for this Pokémon's HP."];
      row.issues = [...(row.issues ?? []), "CP banner read rejected — it fits no IV spread for this Pokémon's HP."];
      row.draft = { ...row.draft, cp: "" };
    }
    // Moves read from the same scan, matched against the resolved form's
    // legal move list (see extractMoves) — only ever set, never cleared.
    const moves = extractMoves(row.rawText ?? "", forms[parsed.formId]);
    if (moves.fastMove) row.draft = { ...row.draft, fastMove: moves.fastMove };
    if (moves.chargedMoves.length) row.draft = { ...row.draft, chargedMoves: [moves.chargedMoves[0], moves.chargedMoves[1] ?? null] };
    const combos = ivCandidatesFromCpHp(forms[parsed.formId], parsed.cp, parsed.hp, solveOptions);
    if (combos.length === 1) {
      row.draft = { ...row.draft, ivs: { ...combos[0].ivs } };
      row.solvedIvs = combos[0];
      row.ivCandidates = null;
      if (combos[0].level > 51) {
        const note = `Solved at effective level ${combos[0].level} — includes the Super Max +2 (and Best Buddy +1) boost.`;
        if (!row.issues?.includes(note)) row.issues = [...(row.issues ?? []), note];
      }
    } else if (combos.length >= 2 && combos.length <= 8) {
      row.ivCandidates = combos;
    }
  };

  // Appraisal-screen fallback (operator ask 2026-08-13): the team-leader's
  // spoken "Overall" verdict (ocr-intake.js's appraisalTierFromText) narrows
  // an already-ambiguous CP/HP solve (row.ivCandidates, 2-8 spreads) by
  // IV-sum band (instances.js's STAR_TIER_RANGES) — the same math the app's
  // own "I only know the star tier" widget uses. One survivor auto-fills
  // exactly like a chip tap; several survivors stay as narrowed chips; zero
  // survivors means the CP/HP solve and the appraisal disagree — keep the
  // original chips and say so, never silently drop evidence.
  const applyAppraisalNarrowing = (row, tier) => {
    const range = STAR_TIER_RANGES.find((entry) => entry.stars === tier);
    if (!range || !row.ivCandidates?.length) return;
    // OCR text can't tell a hundo from a plain 3-star (identical leader
    // phrase — see appraisalTierFromText), so tier 3 must include the
    // 45-sum band or a true hundo gets silently filtered out (review
    // catch: Metagross CP339/HP48 auto-filled 15/14/15 and dropped the
    // real 15/15/15).
    const bandMax = tier === 3 ? 45 : range.max;
    const narrowed = row.ivCandidates.filter((combo) => {
      const sum = combo.ivs.atk + combo.ivs.def + combo.ivs.sta;
      return sum >= range.min && sum <= bandMax;
    });
    if (narrowed.length === 1) {
      row.draft = { ...row.draft, ivs: { ...narrowed[0].ivs } };
      row.solvedIvs = narrowed[0];
      row.ivCandidates = null;
    } else if (narrowed.length > 1) {
      row.ivCandidates = narrowed;
    } else {
      const note = `Appraisal says ${tier}-star, but that doesn't match any CP/HP-solved IV spread — keeping all ${row.ivCandidates.length} options.`;
      row.issues = [...(row.issues ?? []), note];
    }
  };

  // A saved instance IS ownership evidence — every append path marks the
  // species caught (ownedFormIds/counts), or the collection grid keeps
  // showing it missing after a save (operator hit this scanning from the
  // grid, 2026-08-13). Never decrements; edits/deletes are untouched.
  // One-shot celebration overlay for a hundo/shiny save (fun-effects pass,
  // r143). Pure decoration: guarded by prefers-reduced-motion, removes
  // itself on animation end, and any failure is swallowed — a party trick
  // must never break a save.
  const celebrationBurst = (kind) => {
    try {
      // Derived accessor only — reaching for the startFieldGuide-scoped
      // globals here threw a ReferenceError this try/catch then swallowed
      // (the r137 scope lesson, relearned silently: the operator's first
      // hundo got no confetti and nothing logged why).
      const win = controllerWindow();
      const doc = win?.document ?? rootElement?.ownerDocument;
      if (!doc?.createElement) return;
      if (win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      const burst = doc.createElement("div");
      burst.className = `celebration-burst is-${kind}`;
      burst.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 12; i += 1) burst.appendChild(doc.createElement("span"));
      burst.addEventListener("animationend", () => burst.remove());
      // Backstop for browsers that drop the event (tab hidden mid-burst).
      win?.setTimeout?.(() => burst.remove(), 2000);
      doc.body?.appendChild(burst);
    } catch { /* decoration only */ }
  };

  // Journal logging is a bystander: outside every save's try block, its own
  // persist never throws, and a failure here can never unwind a save.
  const journalInstanceAdded = (built, form, via) => {
    const ivSum = (built.ivs?.atk ?? 0) + (built.ivs?.def ?? 0) + (built.ivs?.sta ?? 0);
    const isHundo = ivSum === 45;
    logJournalEntry(storage, {
      kind: "instance-added",
      at: new Date().toISOString(),
      detail: { formId: built.formId, name: form?.name ?? built.formId, isHundo, isShiny: Boolean(built.isShiny), via },
    });
    if (isHundo) celebrationBurst("hundo");
    else if (built.isShiny) celebrationBurst("shiny");
  };

  const withInstanceAdded = (current, built) => {
    const owned = new Set(current.ownedFormIds ?? []);
    const counts = { ...(current.ownedFormCounts ?? {}) };
    if (!owned.has(built.formId)) {
      owned.add(built.formId);
      counts[built.formId] = Math.max(1, counts[built.formId] ?? 0);
    }
    return {
      ...current,
      ownedFormIds: [...owned].sort(),
      ownedFormCounts: Object.fromEntries(
        Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
      ),
      instances: [...(current.instances ?? []), built],
    };
  };

  const api = {
    onRosterExport,
    cpBannerRetry: cpBannerRetryOption,
    onRosterShareCopy: onRosterShareCopy ?? onClipboardCopy,
    onTriageCopy: onTriageCopy ?? onClipboardCopy,
    onDiagnosticsCopy: onDiagnosticsCopy ?? onClipboardCopy,
    onClipboardCopy,
    onConfirm,
    onFeedbackExport,
    onBackupExport,
    onShareCard,
    getTriageResult,
    getRaidPlanCardData,
    getRotationPackCardData,
    getCurrentBosses,
    getGymLineupCardData,
    handleFailure(error) {
      ui.interactionMessage = `Could not save changes: ${error?.message ?? error}`;
      rerender(failureRoute);
    },
    // I1 long-press: pointerdown on a grid card while mark mode is on arms a
    // timer; pointerup/leave/cancel (below) disarm it if it hasn't fired yet.
    // Synchronous and outside the click/change queue on purpose — it only
    // touches local timer/ui state, never the roster.
    handleMarkPointerDown(event) {
      const cardEl = event?.target?.closest?.(".collection-card[data-form-id]");
      if (!ui.collectionMarkMode || !cardEl) return;
      if (markLongPressTimer) clearTimeout(markLongPressTimer);
      const formId = cardEl.dataset.formId;
      markLongPressCardEl = cardEl;
      markLongPressTimer = setTimeout(() => {
        markLongPressTimer = null;
        markLongPressCardEl = null;
        markSuppressClick = true;
        ui.collectionSheetFormId = formId;
        rerenderCurrent();
      }, MARK_LONG_PRESS_MS);
    },
    // bindInteractions registers pointerleave with capture:true (it doesn't
    // bubble) so this sees every descendant's pointerleave, not just the
    // root's own — the target check below scopes disarm to actually leaving
    // the pressed card (mockup scopes its listener to #grid) instead of
    // ignoring everything short of leaving the whole app root.
    handleMarkPointerCancel(event) {
      if (event?.type === "pointerleave" && event.target !== markLongPressCardEl) return;
      if (markLongPressTimer) {
        clearTimeout(markLongPressTimer);
        markLongPressTimer = null;
      }
      markLongPressCardEl = null;
    },
    handleInput(event) {
      const compareQuery = event?.target?.closest?.("[data-compare-query]");
      if (compareQuery) {
        const side = compareQuery.dataset.compareQuery === "b" ? "B" : "A";
        ui.compare[`query${side}`] = String(compareQuery.value ?? "").slice(0, 60);
        // Same caret-preserving rerender the swap opponent search uses —
        // innerHTML replacement would otherwise blur the input every keystroke.
        const caret = Math.min(
          Number.isInteger(compareQuery.selectionStart) ? compareQuery.selectionStart : ui.compare[`query${side}`].length,
          ui.compare[`query${side}`].length,
        );
        const sideAttr = compareQuery.dataset.compareQuery;
        const ownerDocument = compareQuery.ownerDocument;
        rerenderCurrent();
        const nextInput = ownerDocument?.querySelector?.(`[data-compare-query="${sideAttr}"]`);
        nextInput?.focus?.({ preventScroll: true });
        nextInput?.setSelectionRange?.(caret, caret);
        return;
      }
      const groupName = event?.target?.closest?.("[data-group-member-name]");
      if (groupName) {
        ui.groupMemberName = String(groupName.value ?? "").slice(0, 40);
        return;
      }
      const bulkPattern = event?.target?.closest?.("[data-bulk-remove-pattern]");
      if (bulkPattern) {
        ui.bulkRemove.pattern = String(bulkPattern.value ?? "").slice(0, 120);
        // Stale preview must not survive a changed pattern — the confirm
        // button's count would lie about what the pattern now matches.
        ui.bulkRemove.matches = null;
        ui.bulkRemove.error = "";
        return;
      }
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
        // I1 autocomplete: (re)open the suggestion dropdown while typing; a
        // suggestion select or outside interaction is the only way it closes.
        ui.collectionSuggestOpen = true;
        const caret = Math.min(
          Number.isInteger(collectionSearch.selectionStart) ? collectionSearch.selectionStart : ui.collectionQuery.length,
          ui.collectionQuery.length,
        );
        const ownerDocument = collectionSearch.ownerDocument;
        rerenderCurrent();
        const nextSearch = ownerDocument?.querySelector?.("[data-collection-search]");
        nextSearch?.focus?.({ preventScroll: true });
        nextSearch?.setSelectionRange?.(caret, caret);
        return;
      }
      // Two-panel dex index rail search — same refocus/caret-restore shape as
      // the Collection search field just above, own query (ui.dexRailQuery).
      const dexRailSearch = event?.target?.closest?.("[data-dex-rail-search]");
      if (dexRailSearch) {
        ui.dexRailQuery = String(dexRailSearch.value ?? "").slice(0, 80);
        const caret = Math.min(
          Number.isInteger(dexRailSearch.selectionStart) ? dexRailSearch.selectionStart : ui.dexRailQuery.length,
          ui.dexRailQuery.length,
        );
        const ownerDocument = dexRailSearch.ownerDocument;
        rerenderCurrent();
        const nextSearch = ownerDocument?.querySelector?.("[data-dex-rail-search]");
        nextSearch?.focus?.({ preventScroll: true });
        nextSearch?.setSelectionRange?.(caret, caret);
        return;
      }
      // I2 quick-add CP field: numpad-input text field, refocused post-render
      // the same way the search fields above are (rerender replaces the DOM).
      const quickAddCpInput = event?.target?.closest?.("[data-cp-input]");
      if (quickAddCpInput && ui.quickAdd) {
        ui.quickAdd.cp = String(quickAddCpInput.value ?? "");
        const caret = Math.min(
          Number.isInteger(quickAddCpInput.selectionStart) ? quickAddCpInput.selectionStart : ui.quickAdd.cp.length,
          ui.quickAdd.cp.length,
        );
        const ownerDocument = quickAddCpInput.ownerDocument;
        rerenderCurrent();
        const nextInput = ownerDocument?.querySelector?.("[data-cp-input]");
        nextInput?.focus?.({ preventScroll: true });
        nextInput?.setSelectionRange?.(caret, caret);
        return;
      }
      // I2 quick-add height/weight fields (dex.js's sizeMeasurementFieldHtml)
      // — same numpad-text-field, refocus-after-rerender shape as the CP
      // field just above.
      const quickAddHeightInput = event?.target?.closest?.("[data-height-input]");
      if (quickAddHeightInput && ui.quickAdd) {
        ui.quickAdd.heightM = String(quickAddHeightInput.value ?? "");
        const caret = Math.min(
          Number.isInteger(quickAddHeightInput.selectionStart) ? quickAddHeightInput.selectionStart : ui.quickAdd.heightM.length,
          ui.quickAdd.heightM.length,
        );
        const ownerDocument = quickAddHeightInput.ownerDocument;
        rerenderCurrent();
        const nextInput = ownerDocument?.querySelector?.("[data-height-input]");
        nextInput?.focus?.({ preventScroll: true });
        nextInput?.setSelectionRange?.(caret, caret);
        return;
      }
      const quickAddWeightInput = event?.target?.closest?.("[data-weight-input]");
      if (quickAddWeightInput && ui.quickAdd) {
        ui.quickAdd.weightKg = String(quickAddWeightInput.value ?? "");
        const caret = Math.min(
          Number.isInteger(quickAddWeightInput.selectionStart) ? quickAddWeightInput.selectionStart : ui.quickAdd.weightKg.length,
          ui.quickAdd.weightKg.length,
        );
        const ownerDocument = quickAddWeightInput.ownerDocument;
        rerenderCurrent();
        const nextInput = ownerDocument?.querySelector?.("[data-weight-input]");
        nextInput?.focus?.({ preventScroll: true });
        nextInput?.setSelectionRange?.(caret, caret);
        return;
      }
      // I2 pressable IV bar (dex.js's ivRangeHtml) — a native range fires
      // "input" continuously while dragging, unlike the <select> it sits next
      // to (which only fires "change" on commit). Same draft path as the
      // data-iv-select handler above, so the two controls stay in sync each
      // render; same refocus-after-rerender treatment too.
      const ivRange = event?.target?.closest?.("[data-iv-range]");
      if (ivRange && ui.quickAdd) {
        const stat = ivRange.dataset.stat;
        ui.quickAdd.ivs[stat] = Number(ivRange.value);
        const ownerDocument = ivRange.ownerDocument;
        const view = ownerDocument?.defaultView;
        const refocus = () => ownerDocument?.querySelector?.(`[data-iv-range][data-stat="${stat}"]`)?.focus?.({ preventScroll: true });
        if (typeof view?.requestAnimationFrame === "function") {
          // The range's own thumb tracks the pointer natively between
          // frames — only the gradient/solver text need the coalesced
          // rerender, so cancel any frame still pending from the last tick.
          if (ivRangeRerenderHandle !== null) view.cancelAnimationFrame?.(ivRangeRerenderHandle);
          ivRangeRerenderHandle = view.requestAnimationFrame(() => {
            ivRangeRerenderHandle = null;
            rerenderCurrent();
            refocus();
          });
        } else {
          rerenderCurrent();
          refocus();
        }
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
        rerender("pvp");
        const nextInput = ownerDocument?.querySelector?.("[data-swap-opponent-query]");
        nextInput?.focus?.({ preventScroll: true });
        nextInput?.setSelectionRange?.(caret, caret);
      }
    },
    async handleChange(event) {
      const target = event?.target;
      // I2 quick-add IV/move selects — native <select> (picker wheel), fires
      // "change" on commit, not "input".
      const quickAddIvSelect = target?.closest?.("[data-iv-select]");
      if (quickAddIvSelect && ui.quickAdd) {
        const stat = quickAddIvSelect.dataset.stat;
        ui.quickAdd.ivs[stat] = quickAddIvSelect.value === "" ? null : Number(quickAddIvSelect.value);
        const ownerDocument = quickAddIvSelect.ownerDocument;
        rerenderCurrent();
        // Refocus the same select post-render (mockup's comment: keeps
        // keyboard/arrow stepping working), same treatment as the CP input.
        ownerDocument?.querySelector?.(`[data-iv-select][data-stat="${stat}"]`)?.focus?.({ preventScroll: true });
        return;
      }
      const quickAddMoveSelect = target?.closest?.("[data-move-select]");
      if (quickAddMoveSelect && ui.quickAdd) {
        const slot = quickAddMoveSelect.dataset.moveSelect;
        const value = quickAddMoveSelect.value || null;
        if (slot === "fast") {
          ui.quickAdd.fastMove = value;
        } else if (slot === "charged1") {
          ui.quickAdd.chargedMoves[0] = value;
          // The game won't let a Pokémon carry the same charged move twice.
          if (value && ui.quickAdd.chargedMoves[1] === value) ui.quickAdd.chargedMoves[1] = null;
        } else if (slot === "charged2") {
          ui.quickAdd.chargedMoves[1] = value;
        }
        const ownerDocument = quickAddMoveSelect.ownerDocument;
        rerenderCurrent();
        ownerDocument?.querySelector?.(`[data-move-select="${slot}"]`)?.focus?.({ preventScroll: true });
        return;
      }
      // I2 quick-add mega level select (dex.js's megaLevelFieldHtml) —
      // round-trips through draft.megaLevel, then buildInstance/
      // buildImportedInstance on save (see the save-instance dispatch below).
      // Empty option value ("Not unlocked") means null, not the string "".
      const megaLevelField = target?.closest?.("[data-mega-level]");
      if (megaLevelField && ui.quickAdd) {
        ui.quickAdd.megaLevel = megaLevelField.value || null;
        rerenderCurrent();
        return;
      }
      // Shiny/Lucky quick-add checkboxes (dex.js's shinyLuckyFieldHtml) —
      // round-trip through draft.isShiny/isLucky, same "change" event +
      // rerenderCurrent() shape as the megaLevel select just above.
      const shinyField = target?.closest?.("[data-quickadd-shiny]");
      if (shinyField && ui.quickAdd) {
        ui.quickAdd.isShiny = Boolean(shinyField.checked);
        rerenderCurrent();
        return;
      }
      const luckyField = target?.closest?.("[data-quickadd-lucky]");
      if (luckyField && ui.quickAdd) {
        ui.quickAdd.isLucky = Boolean(luckyField.checked);
        rerenderCurrent();
        return;
      }
      // I2 quick-add size class / buddy level selects (dex.js's
      // sizeClassFieldHtml/buddyLevelFieldHtml) — same round-trip-through-
      // draft, empty-value-means-null shape as the mega level select above.
      const sizeClassField = target?.closest?.("[data-size-class]");
      if (sizeClassField && ui.quickAdd) {
        ui.quickAdd.sizeClass = sizeClassField.value || null;
        rerenderCurrent();
        return;
      }
      const buddyLevelField = target?.closest?.("[data-buddy-level]");
      if (buddyLevelField && ui.quickAdd) {
        ui.quickAdd.buddyLevel = buddyLevelField.value || null;
        rerenderCurrent();
        return;
      }
      // Dynamax/Gigantamax quick-add checkboxes (dex.js's dynamaxFieldHtml)
      // — same round-trip shape as the shiny/lucky checkboxes above.
      const dynamaxField = target?.closest?.("[data-quickadd-dynamax]");
      if (dynamaxField && ui.quickAdd) {
        ui.quickAdd.canDynamax = Boolean(dynamaxField.checked);
        rerenderCurrent();
        return;
      }
      const gigantamaxField = target?.closest?.("[data-quickadd-gigantamax]");
      if (gigantamaxField && ui.quickAdd) {
        ui.quickAdd.canGigantamax = Boolean(gigantamaxField.checked);
        rerenderCurrent();
        return;
      }
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
        rerender("leaderboard");
        return;
      }
      const defenseLogGym = target?.closest?.("[data-defense-log-gym]");
      if (defenseLogGym) {
        resetAutoPickedDefender(ui.defenseLogDraft);
        ui.defenseLogDraft.gymName = defenseLogGym.value;
        rerender("leaderboard");
        return;
      }
      const defenseLogStart = target?.closest?.("[data-defense-log-start]");
      if (defenseLogStart) {
        ui.defenseLogDraft.startedAt = defenseLogStart.value;
        rerender("leaderboard");
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
      const buddyPlanFormControl = target?.closest?.("[data-buddy-plan-form]");
      if (buddyPlanFormControl) {
        // Switching the buddy target resets hearts — hearts track one specific
        // Pokémon's progress, not the species, so carrying them over would lie.
        ui.buddyPlan = buddyPlanFormControl.value === ""
          ? clearBuddyPlan(storage)
          : saveBuddyPlan(storage, { formId: buddyPlanFormControl.value, instanceId: null, hearts: null });
        rerender("home");
        return;
      }
      const buddyPlanInstanceControl = target?.closest?.("[data-buddy-plan-instance]");
      if (buddyPlanInstanceControl && ui.buddyPlan?.formId) {
        ui.buddyPlan = saveBuddyPlan(storage, { ...ui.buddyPlan, instanceId: buddyPlanInstanceControl.value || null });
        rerender("home");
        return;
      }
      const buddyPlanHeartsControl = target?.closest?.("[data-buddy-plan-hearts]");
      if (buddyPlanHeartsControl && ui.buddyPlan?.formId) {
        ui.buddyPlan = saveBuddyPlan(storage, {
          ...ui.buddyPlan,
          hearts: buddyPlanHeartsControl.value === "" ? null : Number(buddyPlanHeartsControl.value),
        });
        rerender("home");
        return;
      }
      const myFriendCodeControl = target?.closest?.("[data-my-friend-code]");
      if (myFriendCodeControl) {
        const digits = normalizeFriendCode(myFriendCodeControl.value);
        if (digits !== "" && !isValidFriendCode(digits)) {
          // Keep showing what the trainer typed next to the error instead of
          // snapping back to the last saved code — nothing to save yet.
          ui.friendCodeInput = digits;
          ui.friendCodeError = "Friend code must be exactly 12 digits.";
        } else {
          ui.friendCodeInput = saveMyFriendCode(storage, digits);
          ui.friendCodeError = "";
        }
        rerender("more");
        return;
      }
      const friendDraftNameControl = target?.closest?.("[data-friend-draft-name]");
      if (friendDraftNameControl) {
        ui.friendDraft = { ...ui.friendDraft, name: friendDraftNameControl.value };
        rerender("more");
        return;
      }
      const friendDraftCodeControl = target?.closest?.("[data-friend-draft-code]");
      if (friendDraftCodeControl) {
        ui.friendDraft = { ...ui.friendDraft, code: normalizeFriendCode(friendDraftCodeControl.value) };
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
        rerender("leaderboard");
        return;
      }
      const defenseLogCompleteEnd = target?.closest?.("[data-defense-log-complete-end]");
      if (defenseLogCompleteEnd) {
        ui.defenseLogDraft.completeDraft.endedAt = defenseLogCompleteEnd.value;
        rerender("leaderboard");
        return;
      }
      const defenseLogCompleteCoins = target?.closest?.("[data-defense-log-complete-coins]");
      if (defenseLogCompleteCoins) {
        ui.defenseLogDraft.completeDraft.coins = defenseLogCompleteCoins.value;
        rerender("leaderboard");
        return;
      }
      const defenseLogImportText = target?.closest?.("[data-defense-log-import-text]");
      if (defenseLogImportText) {
        ui.defenseLogDraft.importText = defenseLogImportText.value;
        rerender("leaderboard");
        return;
      }
      const tradeNameControl = target?.closest?.("[data-trade-name]");
      if (tradeNameControl) {
        ui.trade = { ...ui.trade, name: tradeNameControl.value };
        rerender("more");
        return;
      }
      const tradeImportTextControl = target?.closest?.("[data-trade-import-text]");
      if (tradeImportTextControl) {
        ui.trade = { ...ui.trade, importText: tradeImportTextControl.value };
        rerender("more");
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
      const instanceCaughtYear = target?.closest?.("[data-instance-caught-year]");
      if (instanceCaughtYear && ui.instanceSheet) {
        ui.instanceSheet.draft.caughtYear = instanceCaughtYear.value;
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
            const importedAt = new Date().toISOString();
            for (const instance of parsed) {
              logJournalEntry(storage, {
                kind: "instance-added",
                at: importedAt,
                detail: {
                  via: "poke-genie-import",
                  formId: instance.formId,
                  name: forms[instance.formId]?.name ?? instance.formId,
                  isHundo: instance.ivs.atk + instance.ivs.def + instance.ivs.sta === 45,
                  isShiny: Boolean(instance.isShiny),
                },
              });
            }
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
      const groupPackInput = target?.closest?.("[data-group-pack-input]")
        ?? (target?.dataset && Object.hasOwn(target.dataset, "groupPackInput") ? target : null);
      if (groupPackInput?.files?.[0]) {
        try {
          const text = await groupPackInput.files[0].text();
          const member = parseGroupPack(text);
          saveGroupMember(storage, member);
          ui.groupMessage = `Imported ${member.memberName}'s pack (${member.roster.instances.length} Pokémon).`;
        } catch (error) {
          ui.groupMessage = `Group pack could not be read: ${error?.message ?? error}`;
        }
        rerenderCurrent();
        return;
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
      // I3 OCR bulk-intake — file picker change (dex.js's data-ocr-file-input,
      // paired with the data-action="ocr-scan-open" button in handleClick
      // below). Sequential, not parallel: the underlying Tesseract worker can
      // only run one Recognize at a time, and the queue UX (progress ticking
      // per image) wants sequential anyway. Single attempt per file — a row
      // that fails to parse degrades to the "couldn't read" copy (ocr-intake.js
      // + dex.js), it is never retried; an engine-level failure (offline first
      // use, wasm blocked, quota) aborts the whole batch into 'error' status,
      // same single-attempt-no-retry shape as boot-watchdog.js.
      const ocrFileInput = target?.closest?.("[data-ocr-file-input]")
        ?? (target?.dataset && Object.hasOwn(target.dataset, "ocrFileInput") ? target : null);
      if (ocrFileInput?.files?.length) {
        const files = Array.from(ocrFileInput.files);
        ocrFileInput.value = "";
        ui.ocrIntake = { status: "loading-engine", progress: null, rows: [], errorNote: null };
        rerenderCurrent();
        let engine = null;
        try {
          engine = await createOcrEngine();
          ui.ocrIntake = { status: "scanning", progress: { done: 0, total: files.length }, rows: [], errorNote: null };
          rerenderCurrent();
          const rows = [];
          for (const [index, file] of files.entries()) {
            // Detailed read: same text, plus per-word bboxes — the appraisal
            // bar reader anchors its scanlines on the Attack/Defense/HP
            // labels' real positions instead of guessed proportions.
            const detailed = await (engine.recognizeDetailed?.(file)
              ?? engine.recognize(file).then((plain) => ({ text: plain, words: [] })));
            const text = detailed.text;
            const ocrWords = detailed.words ?? [];
            const parsed = parseMonScreenText(text, { forms });
            // Version stamp: a pasted raw dump must say which shell parsed it
            // (three stale-device round-trips on 2026-08-12 without it).
            let rawText = `[shell ${APP_SHELL_REVISION}]\n${text}`;
            if (parsed.cp === null && parsed.hp !== null) {
              // Full-screen pass lost the CP banner — targeted crop retry
              // (see cpBannerRetry). Merged at low confidence; the "CP not
              // found." issue dies only when the retry actually delivers.
              // The retry's raw output is appended EITHER WAY, so evidence
              // distinguishes "retry ran and read garbage" from "never ran".
              const banner = await api.cpBannerRetry?.(engine, file);
              if (banner?.cp) {
                parsed.cp = banner.cp;
                parsed.confidence.cp = "low";
                parsed.issues = parsed.issues.filter((issue) => issue !== "CP not found.");
              }
              if (banner) {
                rawText += `\n--- banner retry (${banner.cp ? `read ${banner.cp}` : "no read"}) ---\n${banner.raw}`;
              } else {
                rawText += "\n--- banner retry unavailable on this device ---";
              }
            }
            const row = {
              id: crypto.randomUUID(),
              imageLabel: file.name || `Screenshot ${index + 1}`,
              // The verbatim engine output: the only way a parse-miss report
              // can carry the evidence (operator round-trips otherwise).
              rawText,
              parsed,
              // The narrow OCR-derivable subset only (draftFromParse() — see
              // ocr-intake.js). data-ocr-row-edit is the caller that merges
              // this into blankQuickAddDraft() (see handleClick below); ivs/
              // moves are never OCR-derivable so they stay out of row.draft
              // entirely rather than carrying blank placeholders around.
              draft: draftFromParse(parsed),
              issues: parsed.issues,
              accepted: false,
            };
            applyOcrIvSolve(row);
            // Two-part scans (operator, 2026-08-13): a moves-screen or
            // appraisal-screen photo has no CP and no HP — it is a FRAGMENT
            // of some other mon in this batch, not its own. Shuffled photo
            // order breaks plain previous-row adjacency (operator,
            // 2026-08-13), so a fragment first tries to name its own species
            // (speciesFromContext — the same candy-line/footer anchors used
            // for nicknames) and merges into the LAST row of that species
            // anywhere in the batch (never an already-accepted row); falls
            // back to previous-row adjacency; falls back to standing as its
            // own row.
            const isFragment = parsed.cp === null && parsed.hp === null;
            let mergeTarget = null;
            if (isFragment) {
              const contextSpecies = speciesFromContext(text, Object.values(forms));
              if (contextSpecies) {
                const lowerSpecies = contextSpecies.toLowerCase();
                mergeTarget = [...rows].reverse().find((candidate) => {
                  if (candidate.accepted) return false;
                  const form = candidate.parsed?.formId ? forms[candidate.parsed.formId] : null;
                  return form && baseSpeciesName(form).toLowerCase() === lowerSpecies;
                }) ?? null;
              }
              const prevRow = rows[rows.length - 1];
              if (!mergeTarget && prevRow && !prevRow.accepted) mergeTarget = prevRow;
            }
            const targetForm = mergeTarget?.parsed?.formId ? forms[mergeTarget.parsed.formId] : null;
            const fragmentMoves = isFragment && targetForm ? extractMoves(text, targetForm) : null;
            const appraisalTier = isFragment ? appraisalTierFromText(text) : null;
            const mergedParts = [];
            if (mergeTarget && fragmentMoves && (fragmentMoves.fastMove || fragmentMoves.chargedMoves.length)) {
              if (fragmentMoves.fastMove) mergeTarget.draft = { ...mergeTarget.draft, fastMove: fragmentMoves.fastMove };
              if (fragmentMoves.chargedMoves.length) {
                mergeTarget.draft = { ...mergeTarget.draft, chargedMoves: [fragmentMoves.chargedMoves[0], fragmentMoves.chargedMoves[1] ?? null] };
              }
              mergedParts.push("moves");
            }
            if (mergeTarget && isFragment && mergeTarget.ivCandidates?.length) {
              // Pixel-read the appraisal bars and cross-check against the
              // CP+HP candidate set — an exact candidate hit fully resolves
              // the row (a misread almost never lands on a valid spread).
              // Falls through to the coarser tier-phrase narrowing otherwise.
              let barsResolved = false;
              try {
                const bars = await readAppraisalBars(file, {
                  anchors: ocrWords, documentObject: controllerWindow()?.document,
                });
                if (bars?.evidence?.length) {
                  mergeTarget.rawText += `\n--- appraisal bars ---\n${bars.evidence.join("\n")}`;
                }
                const picked = bars?.ivs ? pickCandidateByBars(mergeTarget.ivCandidates, bars.ivs) : null;
                if (picked) {
                  mergeTarget.draft = { ...mergeTarget.draft, ivs: { ...picked.ivs } };
                  mergeTarget.solvedIvs = picked;
                  mergeTarget.ivCandidates = null;
                  mergedParts.push("appraisal bars (exact)");
                  barsResolved = true;
                }
              } catch { /* bar read is best-effort; tier narrowing still runs */ }
              if (!barsResolved && appraisalTier != null && mergeTarget.ivCandidates?.length) {
                applyAppraisalNarrowing(mergeTarget, appraisalTier);
                mergedParts.push("appraisal");
              }
            }
            if (mergedParts.length) {
              mergeTarget.rawText += `\n--- merged ${mergedParts.join(" + ")} from ${file.name || `Screenshot ${index + 1}`} ---\n${text}`;
            } else {
              rows.push(row);
            }
            ui.ocrIntake.progress = { done: index + 1, total: files.length };
            rerenderCurrent();
          }
          ui.ocrIntake = { status: "review", progress: null, rows, errorNote: null };
        } catch (error) {
          ui.ocrIntake = {
            status: "error",
            progress: null,
            rows: [],
            errorNote: error instanceof OcrEngineError ? error.message : "Scanning failed.",
          };
        } finally {
          engine?.terminate?.();
        }
        rerenderCurrent();
      }
    },
    async handleClick(event) {
      const target = event?.target;
      // I1 autocomplete outside-close (mockup: any pointerdown outside the
      // search wrap closes it, not just picking a suggestion). No forced
      // render here — every click that reaches this handler already
      // triggers one downstream (a matched action's own rerender, or a
      // route change), so the flag just needs to be correct by then.
      if (ui.collectionSuggestOpen && !target?.closest?.(".i1-search-wrap")) {
        ui.collectionSuggestOpen = false;
      }
      // I1 grid mark mode — spec-pinned seam: an early branch ahead of route
      // dispatch in this SAME delegated root click handler, not a per-card
      // listener and not a capture-phase one. Cards are anchors
      // (dexCard() in views/collection.js); default off = the anchor's own
      // click navigates normally (r97 behaviour), untouched below.
      const markCard = target?.closest?.(".collection-card[data-form-id]");
      if (ui.collectionMarkMode && markCard && !ui.collectionSheetFormId) {
        event.preventDefault?.();
        if (markSuppressClick) {
          markSuppressClick = false;
          return;
        }
        const formId = markCard.dataset.formId;
        const markType = ui.collectionMarkType === "shiny" || ui.collectionMarkType === "lucky"
          ? ui.collectionMarkType : "caught";
        const currentValue = markType === "shiny" ? (roster.shinyOwnedFormIds ?? []).includes(formId)
          : markType === "lucky" ? (roster.luckyOwnedFormIds ?? []).includes(formId)
          : (roster.ownedFormIds ?? []).includes(formId);
        await applyMarkState(formId, markType, !currentValue);
        rerenderCurrent();
        return;
      }
      const markTypeButton = target?.closest?.("[data-collection-marktype]");
      if (ui.collectionMarkMode && markTypeButton) {
        const type = markTypeButton.dataset.collectionMarktype;
        ui.collectionMarkType = type === "shiny" || type === "lucky" ? type : "caught";
        rerenderCurrent();
        return;
      }
      const modeToggle = target?.closest?.("[data-collection-mode-toggle]");
      if (modeToggle) {
        const turningOn = !ui.collectionMarkMode;
        ui.collectionMarkMode = turningOn;
        closeMarkSheet();
        if (markLongPressTimer) {
          clearTimeout(markLongPressTimer);
          markLongPressTimer = null;
        }
        if (turningOn) {
          ui.collectionMarkSessionFormIds = [];
        } else if (ui.collectionMarkSessionFormIds.length >= MARK_SESSION_BACKUP_NUDGE_THRESHOLD) {
          // Trigger condition only — reuses the existing backup nudge flag/
          // banner (backup.js), same as the shiny/lucky "forced" toggles
          // above reuse the existing quick-toggle fields.
          ui.backupNudge = true;
        }
        rerenderCurrent();
        return;
      }
      const collectionSuggestSelect = target?.closest?.("[data-collection-suggest-form-id]");
      if (collectionSuggestSelect) {
        const suggestedFormId = collectionSuggestSelect.dataset.collectionSuggestFormId;
        const suggestedName = forms[suggestedFormId]?.name;
        if (suggestedName) ui.collectionQuery = suggestedName.slice(0, 80);
        ui.collectionSuggestOpen = false;
        rerenderCurrent();
        return;
      }
      // I1 mini-sheet: outside/backdrop tap and the explicit Close button both
      // close it; mark buttons flip caught/shiny/lucky via the same
      // three-way rule the grid tap uses (nextMarkState, collection.js).
      // Markup is views/collection.js's own collectionSheet(), rendered
      // inline from ui.collectionSheetFormId — app.js only dispatches here.
      if (ui.collectionSheetFormId) {
        const backdrop = target?.closest?.("[data-collection-sheet-backdrop]");
        if (backdrop && target === backdrop) {
          closeMarkSheet();
          rerenderCurrent();
          return;
        }
        const sheetClose = target?.closest?.('[data-action="close-collection-sheet"]');
        if (sheetClose) {
          closeMarkSheet();
          rerenderCurrent();
          return;
        }
        const markButton = target?.closest?.("[data-collection-sheet-mark]");
        if (markButton) {
          const key = markButton.dataset.collectionSheetMark;
          const formId = ui.collectionSheetFormId;
          const currentValue = key === "shiny" ? (roster.shinyOwnedFormIds ?? []).includes(formId)
            : key === "lucky" ? (roster.luckyOwnedFormIds ?? []).includes(formId)
            : (roster.ownedFormIds ?? []).includes(formId);
          await applyMarkState(formId, key, !currentValue);
          rerenderCurrent();
          return;
        }
      }
      // I3 OCR bulk-intake — Scan button opens the paired hidden file input
      // (dex.js's .ocr-scan-entry wraps data-action="ocr-scan-open" and
      // data-ocr-file-input together; the actual scan/parse work is
      // handleChange's file-input handler above).
      const ocrScanOpen = target?.closest?.('[data-action="ocr-scan-open"]')
        ?? (target?.dataset?.action === "ocr-scan-open" ? target : null);
      if (ocrScanOpen) {
        ocrScanOpen.closest?.(".ocr-scan-entry")?.querySelector?.("[data-ocr-file-input]")?.click();
        return;
      }
      // I3 OCR row actions — dex.js's ocrIntakeRowHtml renders the two
      // buttons keyed by row.id; ui.ocrIntake.rows is app.js-owned state (see
      // handleChange above). Accept builds+saves via the same real
      // buildImportedInstance path the Poke Genie CSV import uses for
      // moveless rows (web/src/poke-genie-import.js) — pre-validated the same
      // way the quickAdd save-instance branch below validates, so an
      // incomplete row (ivs are never OCR-derivable — see ocr-intake.js)
      // silently doesn't save rather than throwing. Never auto-saved: this
      // only runs on an explicit tap.
      const groupRemove = target?.closest?.("[data-group-member-remove]");
      if (groupRemove) {
        if (api.onConfirm?.(`Remove ${groupRemove.dataset.groupMemberRemove} from your group?`)) {
          removeGroupMember(storage, groupRemove.dataset.groupMemberRemove);
          ui.groupMessage = "";
        }
        rerenderCurrent();
        return;
      }
      const ocrRowPick = target?.closest?.("[data-ocr-row-pick]");
      if (ocrRowPick) {
        const row = ui.ocrIntake?.rows?.find((candidate) => candidate.id === ocrRowPick.dataset.ocrRowPick);
        const pickedFormId = ocrRowPick.dataset.ocrPickFormId;
        const form = forms[pickedFormId];
        if (row?.parsed && form) {
          row.parsed.formId = pickedFormId;
          row.parsed.name = form.name;
          row.parsed.candidates = [];
          // The "pick one" issue is answered now — drop it, keep the rest.
          row.issues = (row.issues ?? []).filter((issue) => !/pick (one|manually)/i.test(issue));
          if (row.parsed.issues) row.parsed.issues = row.parsed.issues.filter((issue) => !/pick (one|manually)/i.test(issue));
          applyOcrIvSolve(row);
        }
        rerenderCurrent();
        return;
      }
      const ocrRowSetIvs = target?.closest?.("[data-ocr-row-set-ivs]");
      if (ocrRowSetIvs) {
        const row = ui.ocrIntake?.rows?.find((candidate) => candidate.id === ocrRowSetIvs.dataset.ocrRowSetIvs);
        const parts = String(ocrRowSetIvs.dataset.ocrIvs ?? "").split(",").map(Number);
        if (row && parts.length === 3 && parts.every((value) => Number.isInteger(value) && value >= 0 && value <= 15)) {
          const ivs = { atk: parts[0], def: parts[1], sta: parts[2] };
          row.draft = { ...row.draft, ivs };
          row.solvedIvs = row.ivCandidates?.find((combo) => combo.ivs.atk === ivs.atk && combo.ivs.def === ivs.def && combo.ivs.sta === ivs.sta) ?? { ivs, level: null };
          row.ivCandidates = null;
        }
        rerenderCurrent();
        return;
      }
      const ocrRowAccept = target?.closest?.("[data-ocr-row-accept]");
      if (ocrRowAccept) {
        const rowId = ocrRowAccept.dataset.ocrRowAccept;
        const row = ui.ocrIntake?.rows?.find((candidate) => candidate.id === rowId);
        if (row && !row.accepted) {
          const form = forms[row.parsed?.formId];
          const draft = row.draft ?? {};
          const cpNumber = Number(draft.cp);
          const ivs = draft.ivs ?? {};
          const ivsComplete = [ivs.atk, ivs.def, ivs.sta]
            .every((value) => Number.isInteger(value) && value >= 0 && value <= 15);
          if (form && Number.isInteger(cpNumber) && cpNumber > 0 && ivsComplete
            && solveLevel(form, ivs, cpNumber) !== null) {
            const heightNumber = Number(draft.heightM);
            const heightValid = Number.isFinite(heightNumber) && heightNumber > 0;
            const weightNumber = Number(draft.weightKg);
            const weightValid = Number.isFinite(weightNumber) && weightNumber > 0;
            failureRoute = "dex";
            // Moves read off the scan (extractMoves — legal-list matches
            // only) upgrade the save to the full buildInstance path; a scan
            // with no readable moves stays moveless exactly as before.
            const chosenCharged = Array.isArray(draft.chargedMoves) ? draft.chargedMoves.filter(Boolean) : [];
            const scanHasMoves = Boolean(draft.fastMove) && chosenCharged.length >= 1 && chosenCharged.length <= 2;
            const shared = {
              cp: cpNumber,
              ivs,
              nickname: typeof draft.nickname === "string" && draft.nickname.trim() ? draft.nickname : undefined,
              heightM: heightValid ? heightNumber : undefined,
              weightKg: weightValid ? weightNumber : undefined,
            };
            const built = scanHasMoves
              ? buildInstance(form, { ...shared, fastMove: draft.fastMove, chargedMoves: chosenCharged })
              : buildImportedInstance(form, shared);
            // Flip before the await: two fast taps both passing the
            // !row.accepted gate would save duplicate instances.
            row.accepted = true;
            try {
              await mutateRoster((current) => withInstanceAdded(current, built));
            } catch (error) {
              row.accepted = false;
              throw error;
            }
            journalInstanceAdded(built, form, "scan");
          }
        }
        rerenderCurrent();
        return;
      }
      // Edit merges the row's narrow draft (row.draft — see handleChange
      // above) into a fresh blankQuickAddDraft() and opens that formId's I2
      // sheet, seeded; saving from there goes through the existing
      // save-instance branch below, unchanged.
      const ocrRowEdit = target?.closest?.("[data-ocr-row-edit]");
      if (ocrRowEdit) {
        const rowId = ocrRowEdit.dataset.ocrRowEdit;
        const row = ui.ocrIntake?.rows?.find((candidate) => candidate.id === rowId);
        const formId = row?.parsed?.formId;
        if (row && formId) {
          ui.quickAdd = { ...blankQuickAddDraft(), ...row.draft };
          ui.quickAddFormId = formId;
          onNavigateToDex(formId);
        }
        rerenderCurrent();
        return;
      }
      // I2 dex-entry inline quick-add — draft shape and blankQuickAddDraft()
      // are owned by views/dex.js (imported above); this is the dispatch side
      // against it plus the real instances.js store. Scoped to .quickadd-card
      // so its own data-action="save-instance" etc. can't fall into the
      // differently-shaped instanceSheet modal's same-named branch further
      // down this function (that modal is a separate, pre-existing surface:
      // More > Roster / Triage's "view details" sheet, untouched here — its
      // own "Shiny, lucky, nickname & more" link still opens it from here).
      const editQuickAddInstance = target?.closest?.("[data-edit-instance]");
      if (editQuickAddInstance && ui.quickAdd) {
        const instanceId = editQuickAddInstance.dataset.editInstance;
        // Re-tap mid-edit is a no-op — it would otherwise silently discard
        // in-progress form changes back to the saved values.
        if (ui.quickAdd.editingId !== instanceId) {
          const instance = (roster.instances ?? []).find(
            (row) => row.id === instanceId && row.formId === ui.quickAddFormId,
          );
          if (instance) ui.quickAdd = quickAddDraftFromInstance(instance);
        }
        rerenderCurrent();
        return;
      }
      const quickAddCard = target?.closest?.(".quickadd-card");
      if (quickAddCard && ui.quickAdd) {
        const qa = ui.quickAdd;
        const candidateFill = target?.closest?.("[data-candidate-fill]");
        if (candidateFill) {
          const [atk, def, sta] = candidateFill.dataset.candidateFill.split(",").map(Number);
          qa.ivs = { atk, def, sta };
          rerenderCurrent();
          return;
        }
        // "Use optimal" ×2 (offense/defense): views/dex.js resolves the pair
        // via its own bestRaidRow()/gymVerdict() (private to that module) and
        // renders it onto the button as data-use-optimal-fast/
        // data-use-optimal-charged alongside data-use-optimal="offense|defense"
        // — this dispatch side only reads those two dataset names. Falls
        // through as a no-op if either attr is ever missing.
        const useOptimal = target?.closest?.("[data-use-optimal]");
        if (useOptimal) {
          const fastMove = useOptimal.dataset.useOptimalFast;
          const chargedMove = useOptimal.dataset.useOptimalCharged;
          if (fastMove && chargedMove) {
            qa.fastMove = fastMove;
            // Second slot rides along when the dex computed a suggestion
            // (coverage role or PvP pair — see secondChargeSuggestion).
            qa.chargedMoves = [chargedMove, useOptimal.dataset.useOptimalCharged2 ?? null];
          }
          rerenderCurrent();
          return;
        }
        const qaAction = target?.closest?.("[data-action]")?.dataset?.action;
        if (qaAction === "cancel-edit") {
          ui.quickAdd = blankQuickAddDraft();
          rerenderCurrent();
          return;
        }
        if (qaAction === "remove-instance") {
          if (qa.editingId) qa.removeConfirmPending = true;
          rerenderCurrent();
          return;
        }
        if (qaAction === "cancel-remove") {
          qa.removeConfirmPending = false;
          rerenderCurrent();
          return;
        }
        if (qaAction === "confirm-remove") {
          if (qa.editingId) {
            const removedId = qa.editingId;
            failureRoute = "dex";
            await mutateRoster((current) => ({
              ...current,
              instances: (current.instances ?? []).filter((row) => row.id !== removedId),
            }));
            ui.quickAdd = blankQuickAddDraft();
          }
          rerenderCurrent();
          return;
        }
        if (qaAction === "save-instance") {
          const form = forms[ui.quickAddFormId];
          const cpNumber = Number(qa.cp);
          const ivsComplete = [qa.ivs.atk, qa.ivs.def, qa.ivs.sta]
            .every((value) => Number.isInteger(value) && value >= 0 && value <= 15);
          if (!form || !Number.isInteger(cpNumber) || cpNumber <= 0 || !ivsComplete
            || solveLevel(form, qa.ivs, cpNumber) === null) {
            // Honest inline rejection already rendered from this same draft
            // (views/dex.js) — nothing valid to save yet.
            rerenderCurrent();
            return;
          }
          const chosenCharged = qa.chargedMoves.filter(Boolean);
          const hasMoves = Boolean(qa.fastMove) && chosenCharged.length >= 1 && chosenCharged.length <= 2;
          // heightM/weightKg (round 15): optional, unlike cp — a blank or
          // non-positive typed value just omits the field (storage.js's
          // normalizeInstance rejects a present-but-invalid heightM/weightKg
          // outright, so an unparsed draft value must never reach it).
          const heightNumber = Number(qa.heightM);
          const heightValid = Number.isFinite(heightNumber) && heightNumber > 0;
          const weightNumber = Number(qa.weightKg);
          const weightValid = Number.isFinite(weightNumber) && weightNumber > 0;
          failureRoute = "dex";
          let savedId = null;
          if (qa.editingId) {
            const editingId = qa.editingId;
            savedId = editingId;
            await mutateRoster((current) => {
              const original = (current.instances ?? []).find((row) => row.id === editingId);
              if (!original) return current;
              const updated = {
                ...original,
                cp: cpNumber,
                ivs: { atk: qa.ivs.atk, def: qa.ivs.def, sta: qa.ivs.sta },
                fastMove: hasMoves ? qa.fastMove : null,
                chargedMoves: hasMoves ? chosenCharged : [],
                updatedAt: new Date().toISOString(),
              };
              // Same convention buildInstance uses below: only carry the
              // field when set, so clearing it in the edit draft actually
              // clears it instead of the ...original spread leaving a stale
              // value. megaUnlocked is never re-emitted here even if the
              // original (pre-migration) instance still carried it.
              if (qa.megaLevel) updated.megaLevel = qa.megaLevel;
              else delete updated.megaLevel;
              delete updated.megaUnlocked;
              // Same omit-when-falsy convention as megaLevel above (and as
              // buildInstance/buildImportedInstance themselves) — a cleared
              // checkbox actually clears the flag rather than leaving a
              // stale true from the ...original spread.
              if (qa.isShiny) updated.isShiny = true;
              else delete updated.isShiny;
              if (qa.isLucky) updated.isLucky = true;
              else delete updated.isLucky;
              // sizeClass/heightM/weightKg/buddyLevel/canDynamax/
              // canGigantamax (round 15): same omit-when-falsy convention as
              // megaLevel/isShiny/isLucky above.
              if (qa.sizeClass) updated.sizeClass = qa.sizeClass;
              else delete updated.sizeClass;
              if (heightValid) updated.heightM = heightNumber;
              else delete updated.heightM;
              if (weightValid) updated.weightKg = weightNumber;
              else delete updated.weightKg;
              if (qa.buddyLevel) updated.buddyLevel = qa.buddyLevel;
              else delete updated.buddyLevel;
              if (qa.canDynamax) updated.canDynamax = true;
              else delete updated.canDynamax;
              if (qa.canGigantamax) updated.canGigantamax = true;
              else delete updated.canGigantamax;
              return {
                ...current,
                // Update in place (spec §2 I2) — views/dex.js renders
                // formInstances in array order with no sort, so a
                // filter+push would visibly bump the edited row to the end.
                instances: (current.instances ?? []).map((row) => (row.id === editingId ? updated : row)),
              };
            });
          } else {
            // sizeClass/heightM/weightKg/buddyLevel/canDynamax/canGigantamax
            // (round 15) ride both the moves and moveless save paths, same
            // as megaLevel/isShiny/isLucky above — buildInstance/
            // buildImportedInstance themselves own the omit-when-absent
            // convention (see instances.js).
            const built = hasMoves
              ? buildInstance(form, {
                cp: cpNumber, ivs: qa.ivs, fastMove: qa.fastMove, chargedMoves: chosenCharged, megaLevel: qa.megaLevel,
                isShiny: qa.isShiny, isLucky: qa.isLucky,
                sizeClass: qa.sizeClass, heightM: heightValid ? heightNumber : undefined,
                weightKg: weightValid ? weightNumber : undefined, buddyLevel: qa.buddyLevel,
                canDynamax: qa.canDynamax, canGigantamax: qa.canGigantamax,
              })
              : buildImportedInstance(form, {
                // megaLevel rides the moveless path too — the select is
                // interactive whether or not moves are set, and dropping it
                // here was the last leg of the sweep's data-loss finding.
                // isShiny/isLucky ride the same moveless path for the same
                // reason.
                cp: cpNumber, ivs: qa.ivs, megaLevel: qa.megaLevel, isShiny: qa.isShiny, isLucky: qa.isLucky,
                sizeClass: qa.sizeClass, heightM: heightValid ? heightNumber : undefined,
                weightKg: weightValid ? weightNumber : undefined, buddyLevel: qa.buddyLevel,
                canDynamax: qa.canDynamax, canGigantamax: qa.canGigantamax,
              });
            savedId = built.id;
            await mutateRoster((current) => withInstanceAdded(current, built));
            journalInstanceAdded(built, form, "quick-add");
          }
          ui.quickAdd = {
            ...blankQuickAddDraft(),
            // Transient stamp text (never written onto the persisted
            // instance — see blankQuickAddDraft()'s own comment).
            stamp: { instanceId: savedId, text: qa.editingId ? "Updated" : "Saved" },
          };
          rerenderCurrent();
          return;
        }
      }
      // I2/dex-pvp "Copy IV code" (views/dex.js's pvpInstanceRankHtml, the
      // "Yours" line under each league card — data-copy-nickname carries
      // formatIvCode()'s compact "A-D-S L<level>" string). One-shot on-
      // button "Copied" stamp on success; an honest inline failure otherwise
      // (navigator.clipboard.writeText can reject even in a secure context)
      // — never alert().
      const copyIvCode = target?.closest?.("[data-copy-nickname]");
      if (copyIvCode) {
        const payload = copyIvCode.dataset.copyNickname;
        const copied = Boolean(payload) && await (api.onRosterShareCopy ?? onRosterShareCopy)?.(payload);
        if (!("copyNicknameLabel" in copyIvCode.dataset)) {
          copyIvCode.dataset.copyNicknameLabel = copyIvCode.textContent ?? "";
        }
        clearTimeout(copyIvCodeResetTimers.get(copyIvCode));
        copyIvCode.textContent = copied ? "Copied" : "Couldn't copy — copy manually";
        copyIvCodeResetTimers.set(copyIvCode, setTimeout(() => {
          copyIvCode.textContent = copyIvCode.dataset.copyNicknameLabel;
        }, copied ? 1500 : 2500));
        return;
      }
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
            renameCopy: null,
            starTier: null,
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
            starTier: null,
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
      const copyInstanceRename = target?.closest?.("[data-copy-instance-rename-id]");
      if (copyInstanceRename && ui.instanceSheet) {
        const payload = copyInstanceRename.dataset.copyInstanceRenamePayload;
        const copied = Boolean(payload) && await (api.onRosterShareCopy ?? onRosterShareCopy)?.(payload);
        ui.instanceSheet.renameCopy = {
          instanceId: copyInstanceRename.dataset.copyInstanceRenameId,
          status: copied ? "success" : "failure",
        };
        rerenderCurrent();
        return;
      }
      const deleteInstance = target?.closest?.("[data-delete-instance-id]");
      if (deleteInstance) {
        const instanceId = deleteInstance.dataset.deleteInstanceId;
        // One tap now deletes from list rows too (dex quick-add, 2026-08-12
        // transferred-mon cleanup ask), so a real confirm guards every path.
        if (!api.onConfirm?.("Remove this Pokémon from your roster? This can't be undone.")) {
          return;
        }
        const fromSheet = Boolean(ui.instanceSheet);
        const returnRoute = ui.instanceSheet?.returnRoute ?? "more";
        // Without a sheet the tap came from a dex quick-add row — the only
        // non-sheet surface carrying data-delete-instance-id.
        failureRoute = fromSheet ? returnRoute : "dex";
        await mutateRoster((current) => ({
          ...current,
          instances: (current.instances ?? []).filter((row) => row.id !== instanceId),
        }));
        if (ui.instanceSheet?.draft?.editingId === instanceId) {
          if (returnRoute === "triage") ui.instanceSheet = null;
          else ui.instanceSheet.draft = blankInstanceDraft();
        }
        if (ui.quickAdd?.editingId === instanceId) ui.quickAdd = blankQuickAddDraft();
        if (fromSheet) rerender(returnRoute);
        else rerenderCurrent();
        return;
      }
      const ivBarPip = target?.closest?.("[data-instance-iv-bar-stat]");
      if (ivBarPip && ui.instanceSheet) {
        ui.instanceSheet.draft.ivs[ivBarPip.dataset.instanceIvBarStat] = Number(ivBarPip.dataset.instanceIvBarValue);
        ui.instanceSheet.error = "";
        rerenderCurrent();
        return;
      }
      const starTierChip = target?.closest?.("[data-instance-star-tier]");
      if (starTierChip && ui.instanceSheet) {
        const tier = Number(starTierChip.dataset.instanceStarTier);
        ui.instanceSheet.starTier = ui.instanceSheet.starTier === tier ? null : tier;
        rerenderCurrent();
        return;
      }
      const candidateIvsChip = target?.closest?.("[data-instance-candidate-ivs]");
      if (candidateIvsChip && ui.instanceSheet) {
        const [atk, def, sta] = candidateIvsChip.dataset.instanceCandidateIvs.split(",").map(Number);
        ui.instanceSheet.draft.ivs = { atk, def, sta };
        ui.instanceSheet.error = "";
        rerenderCurrent();
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
        rerenderCurrent();
        return;
      }
      // Two-panel dex index rail filter chip — same shape as the Collection
      // filter chip above, own state (ui.dexRailFilter).
      const dexRailFilterControl = target?.closest?.("[data-dex-rail-filter]");
      if (dexRailFilterControl) {
        ui.dexRailFilter = dexRailFilterControl.dataset.dexRailFilter;
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
        requestPushPermission({ flagEnabled: isPushFlagEnabled(storage), notification: controllerWindow()?.Notification })
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
        const ownedRoute = ownedControl.dataset.ownedRoute;
        // Only raids/gyms stamp a lastTask and navigate there — that's their
        // own surface's star, meant to jump you to the task you starred it
        // for. Every other surface (dex, and anything future) is a plain
        // roster toggle in place, same as search's branch above: it must
        // never fall through to a navigation it didn't ask for (the bug this
        // fixes sent every dex-entry star to Raids).
        if (ownedRoute !== "raids" && ownedRoute !== "gyms") {
          await mutateRoster((current) => ({ ...current, schemaVersion: ROSTER_SCHEMA, ...toggleOwnedFields(current) }));
          rerenderCurrent();
          return;
        }
        const route = ownedRoute;
        failureRoute = route;
        const nextUi = structuredClone(ui);
        const filters = taskFilters(route, nextUi);
        const view = isCurrentRoute(route) ? currentView() : "";
        await mutateRoster((current) => ({
          ...current,
          schemaVersion: ROSTER_SCHEMA,
          ...toggleOwnedFields(current),
          preferences: {
            ...(current.preferences ?? {}),
            lastTask: { route, view, filters },
          },
        }));
        nextUi.lastTask = { route, view };
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
      const shapeToggle = target?.closest?.("[data-lineup-shape]")
        ?? (target?.dataset?.lineupShape ? target : null);
      if (shapeToggle) {
        // Which lineup strategy to show. Persisted with the rest of the gym
        // task state so it survives a route change, like the lane indexes.
        const nextUi = structuredClone(ui);
        nextUi.gym.lineupShape = shapeToggle.dataset.lineupShape === "breaker" ? "breaker" : "clean";
        await persistTask("gyms", nextUi);
        rerender("gyms");
        return;
      }
      const gymOwnedOnly = target?.closest?.("[data-gym-owned-only]");
      if (gymOwnedOnly) {
        // Same disposable per-task-filter shape as the raid show-all toggle:
        // persisted with the rest of the gym task state so it survives a
        // route change, but a plain boolean flip, not a re-derive.
        const nextUi = structuredClone(ui);
        nextUi.gym.ownedOnly = !nextUi.gym.ownedOnly;
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
      const swapLeague = target?.closest?.("[data-swap-league]");
      if (swapLeague) {
        ui.swap = setSwapLeague(ui.swap, swapLeague.dataset.swapLeague);
        rerender("pvp");
        return;
      }
      const swapManualPick = target?.closest?.("[data-swap-manual-form-id]");
      if (swapManualPick) {
        ui.swap = toggleSwapManualPick(ui.swap, swapManualPick.dataset.swapManualFormId);
        rerender("pvp");
        return;
      }
      const swapOpponentPick = target?.closest?.("[data-swap-opponent-form-id]");
      if (swapOpponentPick) {
        ui.swap = selectSwapOpponent(ui.swap, swapOpponentPick.dataset.swapOpponentFormId);
        rerender("pvp");
        return;
      }
      // More's sub-views are routes now (#more/<view>), so the scroll reset,
      // Back behaviour and dex wipe come from router.render() — the hand-rolled
      // ui.moreList/navigateMore/scrollToTop patch that shadowed the URL (and
      // the F-03 mid-list landing it was patching) is gone with it.
      const drillChoice = target?.closest?.("[data-drill-choice]");
      if (drillChoice) {
        const nextUi = structuredClone(ui);
        nextUi.drill = answerDrillQuestion(nextUi.drill, drillChoice.dataset.drillChoice, storage);
        replaceObject(ui, nextUi);
        rerender("basics");
        return;
      }
      const drillNext = target?.closest?.("[data-drill-next]");
      if (drillNext) {
        const nextUi = structuredClone(ui);
        nextUi.drill = advanceDrillQuestion(nextUi.drill);
        replaceObject(ui, nextUi);
        rerender("basics");
        return;
      }
      const drillRestart = target?.closest?.("[data-drill-restart]");
      if (drillRestart) {
        const nextUi = structuredClone(ui);
        nextUi.drill = restartDrillRound(nextUi.drill, { movePool: moveCountPool });
        replaceObject(ui, nextUi);
        rerender("basics");
        return;
      }
      const drillMode = target?.closest?.("[data-drill-mode]");
      if (drillMode) {
        const nextUi = structuredClone(ui);
        nextUi.drill = setDrillMode(nextUi.drill, drillMode.dataset.drillMode, { movePool: moveCountPool });
        replaceObject(ui, nextUi);
        rerender("basics");
        return;
      }
      const editFriend = target?.closest?.("[data-edit-friend-id]");
      if (editFriend) {
        const friend = ui.friends.find((entry) => entry.id === editFriend.dataset.editFriendId);
        if (friend) ui.friendDraft = { editingId: friend.id, name: friend.name, code: friend.code, error: "" };
        rerender("more");
        return;
      }
      const deleteFriend = target?.closest?.("[data-delete-friend-id]");
      if (deleteFriend) {
        const friendId = deleteFriend.dataset.deleteFriendId;
        ui.friends = removeFriend(storage, friendId);
        if (ui.friendDraft.editingId === friendId) ui.friendDraft = { editingId: null, name: "", code: "", error: "" };
        rerender("more");
        return;
      }
      const copyFriendCode = target?.closest?.("[data-copy-friend-code-id]");
      if (copyFriendCode) {
        const friend = ui.friends.find((entry) => entry.id === copyFriendCode.dataset.copyFriendCodeId);
        const copied = friend && await (api.onRosterShareCopy ?? onRosterShareCopy)?.(friend.code);
        ui.friendCodesMessage = copied
          ? `Copied ${friend.name}'s code to the clipboard.`
          : "Could not copy automatically — select and copy the code above.";
        rerender("more");
        return;
      }
      const actionEl = target?.closest?.("[data-action]");
      const action = actionEl?.dataset?.action;
      if (action === "dismiss-whats-new") {
        const releaseId = actionEl.dataset.releaseId;
        if (releaseId) setStorageFlag(storage, whatsNewDismissedKey(releaseId), "1");
        rerender("home");
      } else if (action === "dismiss-release-diff") {
        const releaseId = actionEl.dataset.releaseId;
        if (releaseId) setStorageFlag(storage, releaseDiffDismissedKey(releaseId), "1");
        rerender("home");
      } else if (action === "dismiss-triage-guide") {
        setStorageFlag(storage, TRIAGE_GUIDE_DISMISSED_KEY, "1");
        rerender("triage");
      } else if (action === "open-triage-explainer") {
        ui.triage.explainerOpen = true;
        rerender("triage");
      } else if (action === "copy-triage-candy") {
        const payload = candyTransferText(api.getTriageResult?.());
        const copied = Boolean(payload) && await api.onTriageCopy?.(payload);
        ui.triage.copyStatus = copied ? "success" : "failure";
        rerender("triage");
      } else if (action === "copy-triage-search-chunk") {
        const payload = actionEl.dataset.searchChunkPayload;
        const copied = Boolean(payload) && await api.onTriageCopy?.(payload);
        ui.triage.searchCopyId = actionEl.dataset.searchChunkId ?? "";
        ui.triage.searchCopyStatus = copied ? "success" : "failure";
        rerender("triage");
      } else if (action === "copy-triage-rename-plan") {
        const payload = renamePlanText(api.getTriageResult?.(), ui.triage.filter);
        const copied = Boolean(payload) && await api.onTriageCopy?.(payload);
        ui.triage.renameCopyStatus = copied ? "success" : "failure";
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
        rerender("leaderboard");
      } else if (action === "share-raid-plan-card") {
        const cardData = (api.getRaidPlanCardData ?? getRaidPlanCardData)?.() ?? null;
        const outcome = cardData ? await (api.onShareCard ?? onShareCard)?.("raidPlan", cardData) : "no-data";
        ui.briefingShareMessage = outcome === "shared" ? "Shared tonight's plan."
          : outcome === "downloaded" ? "Downloaded tonight's plan."
          : outcome === "cancelled" ? ""
          : "Could not share or download the card on this device.";
        rerender("home");
      } else if (action === "share-trophy-card") {
        const cardData = trophyCardData({ roster, forms }) ?? null;
        const outcome = cardData ? await (api.onShareCard ?? onShareCard)?.("trophyCard", cardData) : "no-data";
        ui.trophyShareMessage = outcome === "shared" ? "Shared your trophy case."
          : outcome === "downloaded" ? "Downloaded your trophy case."
          : outcome === "cancelled" ? ""
          : "Could not share or download the card on this device.";
        rerenderCurrent();
      } else if (action === "share-rotation-pack") {
        const cardData = (api.getRotationPackCardData ?? getRotationPackCardData)?.() ?? null;
        const outcome = cardData ? await (api.onShareCard ?? onShareCard)?.("rotationPack", cardData) : "no-data";
        ui.briefingShareMessage = outcome === "shared" ? "Shared the rotation pack."
          : outcome === "downloaded" ? "Downloaded the rotation pack."
          : outcome === "cancelled" ? ""
          : "Could not share or download the card on this device.";
        rerender("home");
      } else if (action === "share-gym-lineup-card") {
        const cardData = (api.getGymLineupCardData ?? getGymLineupCardData)?.() ?? null;
        const outcome = cardData ? await (api.onShareCard ?? onShareCard)?.("gymLineup", cardData) : "no-data";
        ui.gymLineupShareMessage = outcome === "shared" ? "Shared your gym lineup."
          : outcome === "downloaded" ? "Downloaded your gym lineup."
          : outcome === "cancelled" ? ""
          : "Could not share or download the card on this device.";
        rerender("gyms");
      } else if (action === "clear-buddy-plan") {
        ui.buddyPlan = clearBuddyPlan(storage);
        rerender("home");
      } else if (action === "dismiss-guide") {
        const route = actionEl.dataset.guideRoute;
        if (route) dismissGuide(route, storage);
        rerenderCurrent();
      } else if (action === "show-guide") {
        const route = actionEl.dataset.guideRoute;
        if (route) showGuide(route, storage);
        rerenderCurrent();
      } else if (action === "quest-toggle") {
        const questId = actionEl.dataset.questId;
        if (questId) {
          const dateKey = todayDateISO(new Date());
          const nextState = toggleQuest(storage, dateKey, questId);
          // Log only a completion (unchecked -> checked), never an un-check;
          // label from the same deterministic quest list the user tapped.
          if (nextState[questId]) {
            const { entries, bestStreak } = loadJournal(storage);
            const quest = generateQuests({
              dateKey, roster, forms,
              currentBosses: (api.getCurrentBosses ?? getCurrentBosses)?.() ?? null,
              journal: { entries, streak: streakInfo(entries, new Date(), bestStreak) },
            }).find((row) => row.id === questId);
            if (quest) {
              logJournalEntry(storage, {
                kind: "quest-completed",
                at: new Date().toISOString(),
                detail: { questId: quest.id, label: quest.label },
              });
            }
          }
        }
        rerenderCurrent();
      } else if (action === "compare-from-dex") {
        // Dex entry point: prefill side A with this entry, then open Compare.
        ui.compare.formIdA = actionEl.dataset.compareFormId || null;
        ui.compare.queryA = "";
        const win = controllerWindow();
        if (win) win.location.hash = "#more/compare";
      } else if (action === "compare-pick") {
        const side = actionEl.dataset.compareSide === "b" ? "B" : "A";
        const formId = actionEl.dataset.compareFormId ?? "";
        ui.compare[`formId${side}`] = formId || null;
        if (!formId) ui.compare[`query${side}`] = "";
        rerenderCurrent();
      } else if (action === "toggle-today-task") {
        const taskId = actionEl.dataset.todayTaskId;
        if (taskId) toggleTodayTask(taskId, storage);
        rerenderCurrent();
      } else if (action === "today-task-done") {
        // Today strip check-off (views/home.js renderTodayStrip) — a
        // different feature from toggle-today-task above (views/today.js's
        // own Today section): same set/remove flip as toggle-briefing-card,
        // keyed per (day, task id) so a day rollover doesn't inherit
        // yesterday's checks.
        const taskId = actionEl.dataset.todayTaskId;
        if (taskId) {
          const storageKey = todayTaskKey(todayDateISO(new Date()), taskId);
          if (storage?.getItem?.(storageKey) === "1") setStorageFlag(storage, storageKey, null);
          else setStorageFlag(storage, storageKey, "1");
        }
        rerenderCurrent();
      } else if (action === "toggle-field-briefing") {
        // views/home.js reads storage.getItem(briefingCollapsedKey(fingerprint))
        // === "1" for collapsed; both the collapsed-line reopen button and the
        // Dismiss button share this one action, so flip whatever's there now
        // (dismissGuide/showGuide above use the identical set/remove pattern).
        const key = actionEl.dataset.briefingKey;
        if (key) {
          const storageKey = briefingCollapsedKey(key);
          if (storage?.getItem?.(storageKey) === "1") setStorageFlag(storage, storageKey, null);
          else setStorageFlag(storage, storageKey, "1");
        }
        rerenderCurrent();
      } else if (action === "ocr-copy-raw") {
        const row = ui.ocrIntake?.rows?.find((candidate) => candidate.id === actionEl.dataset.ocrRawRowId);
        if (row?.rawText) await api.onClipboardCopy?.(row.rawText);
      } else if (action === "journal-raid-log") {
        const bossFormId = actionEl.dataset.journalBoss;
        const outcome = actionEl.dataset.journalOutcome;
        if (bossFormId && (outcome === "won" || outcome === "lost")) {
          logJournalEntry(storage, {
            kind: "raid-logged",
            at: new Date().toISOString(),
            detail: { bossFormId, bossName: forms[bossFormId]?.name ?? bossFormId, outcome },
          });
        }
        rerenderCurrent();
      } else if (action === "ocr-scan-done") {
        // Review pass complete — back to idle so the Scan entry returns
        // (reviewer catch: idle-only entry point never reappeared).
        ui.ocrIntake = blankOcrIntakeState();
        rerenderCurrent();
      } else if (action === "toggle-shiny-sprite") {
        ui.dexShinySprite = !ui.dexShinySprite;
        rerenderCurrent();
      } else if (action === "toggle-briefing-card") {
        // Per-lane briefing card collapse — same set/remove flip as
        // toggle-field-briefing above, keyed per rotation + boss so a
        // dismissed Shadow card stays down without touching the Mega/Tier 5
        // cards or the whole-briefing collapse.
        const cardKey = actionEl.dataset.briefingCardKey;
        if (cardKey) {
          const storageKey = briefingCardCollapsedKey(cardKey);
          if (storage?.getItem?.(storageKey) === "1") setStorageFlag(storage, storageKey, null);
          else setStorageFlag(storage, storageKey, "1");
        }
        rerenderCurrent();
      } else if (action === "scroll-to") {
        // The Shadow lane starts ~9,000px down a ~19,800px view: 14 screens of
        // thumb before you reach it, with no way to skip. A plain #hash anchor
        // would round-trip through the router, which re-renders the route and
        rootElement?.querySelector?.(`#${CSS.escape(actionEl.dataset.scrollTarget ?? "")}`)
          ?.scrollIntoView?.({ block: "start" });
      } else if (action === "scroll-app-top") {
        scrollToTop();
      } else if (action === "dismiss-update-banner") {
        const releaseId = releaseManager?.state?.candidate?.releaseId;
        if (releaseId) setStorageFlag(storage, updateBannerDismissedKey(releaseId), "1");
        rerenderCurrent();
      } else if (action === "dismiss-staleness-banner") {
        const importedAt = roster?.preferences?.pokeGenieImport?.importedAt;
        if (importedAt) setStorageFlag(storage, stalenessSnoozeKey(importedAt), String(Date.now() + STALENESS_SNOOZE_MS));
        rerenderCurrent();
      } else if (action === "dismiss-backup-nudge") {
        snoozeBackupNudge(storage);
        ui.backupNudge = false;
        rerender("more");
      } else if (action === "apply-update") await releaseManager?.applyUpdate();
      else if (action === "rollback-release") await releaseManager?.rollback();
      else if (action === "check-update") await releaseManager?.initialize();
      else if (action === "retry-route-chunks") {
        // Same pattern as apply-update/rollback/check-update just above: on
        // success the loader's own onChunksLoaded fires a fresh rebootstrap()
        // (which replaces this whole controller), so no explicit rerender()
        // here — one would race a just-torn-down DOM. On a below-cap retry
        // failure the notice stays as-is, which is still accurate (still
        // hasn't loaded); the next natural rerender or another tap covers it.
        const route = actionEl.dataset.retryRoute;
        if (route) await onRetryRouteChunks?.(route);
      } else if (action === "install-app") {
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
      } else if (action === "copy-my-friend-code") {
        const copied = isValidFriendCode(ui.friendCodeInput)
          && await (api.onRosterShareCopy ?? onRosterShareCopy)?.(ui.friendCodeInput);
        ui.friendCodesMessage = copied
          ? "Copied your code to the clipboard."
          : "Could not copy automatically — select and copy the code above.";
        rerender("more");
      } else if (action === "save-friend-draft") {
        const digits = normalizeFriendCode(ui.friendDraft.code);
        if (!isValidFriendCode(digits)) {
          ui.friendDraft = { ...ui.friendDraft, error: "Friend code must be exactly 12 digits." };
        } else {
          try {
            ui.friends = ui.friendDraft.editingId
              ? updateFriend(storage, ui.friendDraft.editingId, { name: ui.friendDraft.name, code: digits })
              : addFriend(storage, { name: ui.friendDraft.name, code: digits });
            ui.friendDraft = { editingId: null, name: "", code: "", error: "" };
          } catch (error) {
            ui.friendDraft = { ...ui.friendDraft, error: error?.message ?? String(error) };
          }
        }
        rerender("more");
      } else if (action === "cancel-friend-draft") {
        ui.friendDraft = { editingId: null, name: "", code: "", error: "" };
        rerender("more");
      } else if (action === "feedback-export") {
        const payload = exportFeedback(storage);
        (api.onFeedbackExport ?? onFeedbackExport)?.(payload);
        rerender("more");
      } else if (action === "bulk-remove-preview") {
        const pattern = ui.bulkRemove.pattern ?? "";
        let matcher = null;
        try {
          matcher = new RegExp(pattern, "i");
        } catch (error) {
          ui.bulkRemove.error = `Invalid pattern: ${error?.message ?? error}`;
          ui.bulkRemove.matches = null;
          rerender("more");
          return;
        }
        if (!pattern.trim()) {
          ui.bulkRemove.error = "Enter a pattern first.";
          ui.bulkRemove.matches = null;
          rerender("more");
          return;
        }
        ui.bulkRemove.error = "";
        ui.bulkRemove.matches = (roster.instances ?? [])
          .filter((instance) => {
            const species = forms[instance.formId]?.name ?? instance.formId;
            return matcher.test(instance.nickname ?? "") || matcher.test(species);
          })
          .map((instance) => ({
            id: instance.id,
            label: `${instance.nickname || forms[instance.formId]?.name || instance.formId} — CP ${instance.cp}`,
          }));
        rerender("more");
      } else if (action === "bulk-remove-confirm") {
        const matches = ui.bulkRemove.matches ?? [];
        if (matches.length
          && api.onConfirm?.(`Remove ${matches.length} Pokémon matching /${ui.bulkRemove.pattern}/i from your roster? This can't be undone.`)) {
          const doomed = new Set(matches.map((match) => match.id));
          failureRoute = "more";
          await mutateRoster((current) => ({
            ...current,
            instances: (current.instances ?? []).filter((row) => !doomed.has(row.id)),
          }));
          ui.bulkRemove = { pattern: "", error: "", matches: null };
          rerender("more");
        }
      } else if (action === "purge-copy-chunk") {
        const payload = actionEl.dataset.purgeChunk;
        if (payload) await api.onClipboardCopy?.(payload);
      } else if (action === "clear-roster-data") {
        // Whole-roster wipe (2026-08-12 operator ask). Double confirm — this
        // is the one action in the app that destroys everything at once.
        if (api.onConfirm?.("Clear ALL roster data on this device — every owned mark, shiny/lucky flag, and saved Pokémon? This can't be undone.")
          && api.onConfirm?.("Last check: no backup will be made automatically. Really clear everything?")) {
          failureRoute = "more";
          await mutateRoster(() => blankRoster());
          ui.quickAdd = blankQuickAddDraft();
          ui.quickAddFormId = null;
          if (ui.instanceSheet) ui.instanceSheet = null;
          rerender("more");
        }
      } else if (action === "group-pack-export") {
        try {
          const pack = buildGroupPack({
            roster: structuredClone(roster),
            forms,
            memberName: ui.groupMemberName || ui.trainerProfile?.name || "",
          });
          (api.onBackupExport ?? onBackupExport)?.(JSON.stringify(pack, null, 2));
          ui.groupMessage = "Group pack downloaded — AirDrop it to the group.";
        } catch (error) {
          ui.groupMessage = `Could not export: ${error?.message ?? error}`;
        }
        rerenderCurrent();
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
            await mutateRoster((current) => (original
              ? {
                ...current,
                instances: [...(current.instances ?? []).filter((row) => row.id !== editingId), saved],
              }
              : withInstanceAdded(current, saved)));
            if (!original) journalInstanceAdded(saved, form, "instance-sheet");
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
        rerender("leaderboard");
      } else if (action === "defense-log-open-complete") {
        ui.defenseLogDraft.completingId = actionEl.dataset.defenseEntryId ?? null;
        ui.defenseLogDraft.completeDraft = { endedAt: "", coins: "" };
        ui.defenseLogDraft.message = "";
        rerender("leaderboard");
      } else if (action === "defense-log-cancel-complete") {
        ui.defenseLogDraft.completingId = null;
        rerender("leaderboard");
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
        rerender("leaderboard");
      } else if (action === "defense-log-delete") {
        const entryId = actionEl.dataset.defenseEntryId;
        ui.defenseLog = deleteDefenseEntry(ui.defenseLog, entryId);
        saveDefenseLog(storage, ui.defenseLog);
        if (ui.defenseLogDraft.completingId === entryId) ui.defenseLogDraft.completingId = null;
        rerender("leaderboard");
      } else if (action === "defense-log-toggle-share") {
        ui.defenseLogDraft.shareOpen = !ui.defenseLogDraft.shareOpen;
        rerender("leaderboard");
      } else if (action === "defense-log-copy-share") {
        const payload = exportPlayerLog(ui.defenseLog);
        const copied = await (api.onRosterShareCopy ?? onRosterShareCopy)?.(payload);
        ui.defenseLogDraft.message = copied
          ? "Copied your leaderboard text to clipboard."
          : "Could not copy automatically — select and copy the text above.";
        rerender("leaderboard");
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
        rerender("leaderboard");
      } else if (action === "trade-toggle-export") {
        ui.trade = { ...ui.trade, exportOpen: !ui.trade.exportOpen };
        rerender("more");
      } else if (action === "trade-copy-export") {
        let payload = "";
        try {
          payload = exportDexSummary(ui.trade.name, forms, roster);
        } catch (error) {
          ui.trade = { ...ui.trade, message: error?.message ?? String(error) };
          rerender("more");
          return;
        }
        const copied = await (api.onRosterShareCopy ?? onRosterShareCopy)?.(payload);
        ui.trade = {
          ...ui.trade,
          message: copied ? "Copied your dex summary to clipboard." : "Could not copy automatically — select and copy the text above.",
        };
        rerender("more");
      } else if (action === "trade-import") {
        try {
          const { friends, friend } = importFriendSummary(storage, ui.trade.importText);
          ui.tradeFriends = friends;
          ui.trade = { ...ui.trade, importText: "", message: `Imported ${friend.name}'s dex summary.`, selectedFriendId: friend.id };
        } catch (error) {
          ui.trade = { ...ui.trade, message: error?.message ?? String(error) };
        }
        rerender("more");
      } else if (action === "trade-remove-friend") {
        const friendId = target?.closest?.("[data-trade-friend-id]")?.dataset.tradeFriendId;
        ui.tradeFriends = removeTradeFriend(storage, friendId);
        if (ui.trade.selectedFriendId === friendId) ui.trade = { ...ui.trade, selectedFriendId: null };
        rerender("more");
      } else if (action === "trade-select-friend") {
        const friendId = target?.closest?.("[data-trade-friend-id]")?.dataset.tradeFriendId;
        ui.trade = { ...ui.trade, selectedFriendId: ui.trade.selectedFriendId === friendId ? null : friendId };
        rerender("more");
      } else if (action === "defense-log-use-location") {
        // Geolocation gym picker: request coords, find nearest cached gym within 150m
        if (!navigator.geolocation) {
          ui.defenseLogDraft.message = "Geolocation not available on this device.";
          rerender("leaderboard");
          return;
        }
        ui.defenseLogDraft.geoLoading = true;
        rerender("leaderboard");
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
            // Geolocation is async — only pull the user back to the leaderboard
            // if they're still there; otherwise just update the draft for next
            // time they visit.
            if (isCurrentRoute("leaderboard")) rerender("leaderboard");
          },
          (error) => {
            ui.defenseLogDraft.message = `Geolocation denied or unavailable — please type a gym name.`;
            ui.defenseLogDraft.geoLoading = false;
            if (isCurrentRoute("leaderboard")) rerender("leaderboard");
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
        rerender("leaderboard");
      } else if (action === "swap-continue-team") {
        ui.swap = advanceSwapToOpponent(ui.swap);
        rerender("pvp");
      } else if (action === "swap-back-team") {
        event.preventDefault?.();
        ui.swap = backToSwapTeam(ui.swap);
        rerender("pvp");
      } else if (action === "swap-back-opponent") {
        event.preventDefault?.();
        ui.swap = backToSwapOpponent(ui.swap);
        rerender("pvp");
      } else if (action === "swap-reset") {
        event.preventDefault?.();
        ui.swap = createSwapState();
        rerender("pvp");
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
} = {}, bossTypes = [], simTime = null) {
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
    ${simTime ? `<p class="raid-sim-line">${escapeHtml(simTime.label)}</p>` : ""}
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


// Beginner card: name, moveset and availability. The DPS breakdown still lives
// on the detailed view, but the moveset does not belong there — "bring Machamp"
// without "Counter + Dynamic Punch" is not something a reader can act on, and
// the moves are the thing they have to TM for.
function beginnerCounterCard(row, roster) {
  const owned = (roster.ownedFormIds ?? []).includes(row.formId);
  const ownedCount = owned
    ? (Number.isInteger(roster.ownedFormCounts?.[row.formId]) ? roster.ownedFormCounts[row.formId] : 1)
    : 0;
  return `<li class="raid-card${owned ? " is-owned" : ""}" data-form-id="${escapeHtml(row.formId)}">
    <p class="raid-rank">#${escapeHtml(row.typeRank ?? row.rank)}${row.weatherBoosted ? ` · <span class="weather-boosted-badge">Boosted today</span>` : ""}</p>
    <h4>${escapeHtml(row.pokemon)}</h4>
    <p class="raid-beginner-moves">${moveWithElite(row.optimalFastMove, row.optimalEliteFastTM, "Fast")} + ${moveWithElite(row.optimalChargedMove, row.optimalEliteChargedTM, "Charged")}</p>
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


// This label was hardcoded "10/10/10" until 2026-08-11, when the shadow-raid
// floor was corrected to 6/6/6 — leaving the label contradicting the CP printed
// immediately beside it on all 474 shadow rows. The band now carries its own
// floor; read it rather than restating a constant that is no longer constant.
// Falls back to 10 only for a release built before minimumIV shipped.
function ivFloorLabel(band) {
  const floor = Number.isFinite(band?.minimumIV) ? band.minimumIV : 10;
  return escapeHtml(`${floor}/${floor}/${floor}`);
}


function raidTargetSurface(state, ui, roster) {
  const allTargets = state.raidTargetTool?.targets ?? [];
  const category = allowed(ui.raid.targetCategory, RAID_TARGET_CATEGORY_SET, "all");
  const targets = raidTargetsForCategory(allTargets, state.core?.forms ?? state.forms ?? {}, category);
  // Honest-swap notice: same class of bug the ?boss= deep-link path already
  // guards against (app.js's bossNotFound) — a category change or a boss
  // rotating out of the live tier list must not silently swap the counters
  // out from under the reader with zero on-screen trace of what happened.
  let targetSwapNotice = "";
  if (!targets.some((row) => row.bossFormId === ui.raid.targetFormId)) {
    const droppedBoss = allTargets.find((row) => row.bossFormId === ui.raid.targetFormId)?.boss;
    ui.raid.targetFormId = targets[0]?.bossFormId ?? "";
    const nextBoss = targets[0]?.boss;
    const categoryLabel = RAID_TARGET_CATEGORIES.find(([value]) => value === category)?.[1] ?? category;
    if (droppedBoss && nextBoss) {
      targetSwapNotice = `<p class="raid-target-swap-notice" role="alert">${escapeHtml(droppedBoss)} isn't in the "${escapeHtml(categoryLabel)}" category — showing ${escapeHtml(nextBoss)} instead.</p>`;
    }
  }
  if (!ui.raid.targetFormId) return "<p>No raid targets are available in this release.</p>";
  const plan = buildRaidPlan({
    targetFormId: ui.raid.targetFormId,
    observedCp: ui.raid.observedCp,
    encounterLevel: ui.raid.encounterLevel,
    ownedFormIds: roster.ownedFormIds,
    weather: ui.weather,
    roster,
    trainerLevel: ui.trainerProfile.level,
  }, state);
  const lanes = {
    regular: ["Regular, Mega & Primal", plan.regularCounters, plan.beginnerRegularGroups],
    buildable: ["No Megas", plan.buildableCounters, plan.beginnerBuildableGroups],
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
  // Your battle party (big-swings wave 1): best six from the actual roster
  // vs THIS boss — composed estimates only, computed here where all inputs
  // already live.
  const partyResult = buildParty({
    targetFormId: ui.raid.targetFormId,
    roster,
    forms: state.core?.forms ?? {},
    raids: state.raids,
    data: state,
    trainerLevel: ui.trainerProfile.level,
    weather: ui.weather,
  });
  // Deterministic sim layer over the same six — only when the moveSettings
  // chunk has landed; failures degrade to the qualitative estimate, never
  // block the panel.
  let partySimResult = null;
  let counterTimes = null;
  let raidSoloVerdict = null;
  if (state.moveSettings && state.core?.forms?.[ui.raid.targetFormId]) {
    const bossTier = (state.currentBosses?.bosses ?? []).find((boss) => boss.formId === ui.raid.targetFormId)?.tier ?? null;
    const simBoss = { form: state.core.forms[ui.raid.targetFormId], tier: bossTier ?? "Tier 5", moveset: null };
    const simSettings = { moveSettings: state.moveSettings, weather: ui.weather };
    if (partyResult?.party?.length) {
      try {
        partySimResult = simulateParty(
          partyResult.party.map(({ instance, form }) => ({ ...instance, form })),
          simBoss,
          simSettings,
        );
      } catch {
        partySimResult = null;
      }
    }
    counterTimes = counterSimTimes({
      counters: rows, boss: simBoss, roster, forms: state.core.forms, settings: simSettings,
    });
    raidSoloVerdict = soloVerdict({ boss: simBoss, settings: simSettings, partyResult });
  }
  const partyPanelHtml = renderPartyPanel({
    targetFormId: ui.raid.targetFormId,
    roster,
    forms: state.core?.forms ?? {},
    partyResult,
    simResult: partySimResult,
  });
  return `<section class="raid-target-view" aria-labelledby="raid-target-title">
    <h2 id="raid-target-title">Raid Target</h2>
    ${targetSwapNotice}
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
      ${raidSoloVerdict ? `<p class="raid-solo-verdict" data-solo-verdict="${escapeHtml(raidSoloVerdict.verdict)}">${escapeHtml(raidSoloVerdict.line)}</p>` : ""}
    </div>
    ${partyPanelHtml}
    <div class="raid-cp-lines">
      <div class="raid-cp-set">
        <p><strong>Level 20 encounter:</strong></p>
        <p><strong>Min CP:</strong> ${ivFloorLabel(plan.target.normal)}: ${escapeHtml(plan.target.normal.minimumRaidIVCP)}</p>
        <p><strong>${jargonTerm("hundo", "Hundo CP")}:</strong> ${escapeHtml(plan.target.normal.hundoCP)}</p>
      </div>
      <div class="raid-cp-set">
        <p><strong>Level 25 weather-boosted encounter:</strong></p>
        <p><strong>Min CP:</strong> ${ivFloorLabel(plan.target.weatherBoosted)}: ${escapeHtml(plan.target.weatherBoosted.minimumRaidIVCP)}</p>
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
      ? `<ol class="raid-card-list">${rows.map((row, rowIndex) => raidCounterCard(row, roster, forms, cardOptions, bossTypes, counterTimes?.[rowIndex] ?? null)).join("")}</ol>`
      : beginnerCounterGroups(beginnerGroups, roster, bossTypes, forms, cardOptions)) : (ui.raid.counterLane === "owned"
      ? "<p>Star Pokémon you own and this fills in with your best raid team.</p>"
      : "<p>No owned qualifying counter is marked yet.</p>")}
    <p class="raid-method-note">${escapeHtml(plan.caveat)}</p>
  </section>`;
}


function renderRaidSurface(state, ui, roster, view) {
  const controls = `<div class="pvp-controls" aria-label="Raid tools">
    <label>Attacking type<select data-raid-type>${ATTACK_TYPES.map((type) => option(type, type, ui.raid.attackingType)).join("")}</select></label>
    <label>Current weather<select data-weather-choice>${WEATHERS.map((weather) => option(weather, weather, ui.weather)).join("")}</select></label>
  </div>`;
  return `<div class="raids-view">${controls}${view === "target"
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
  const view = ui.lastTask?.view ?? "";
  if (route === "raids") {
    const target = (state.raidTargetTool?.targets ?? [])
      .find((row) => row.bossFormId === ui.raid.targetFormId);
    return {
      route,
      view,
      label: view === "target" ? "Continue Raid Target" : "Continue Raid Rankings",
      detail: view === "target"
        ? `${target?.boss ?? "Saved raid target"} · ${ui.raid.counterLane} counters`
        : `${ui.raid.attackingType} attackers · ${ui.raid.counterLane} lane`,
    };
  }
  if (route === "gyms") {
    const count = ui.gym.lineupFormIds.length;
    return {
      route,
      view,
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
      view,
      label: "Continue PvP",
      detail: `${league} · ${ui.pvp.form} forms · ${view || "teams"}`,
    };
  }
  return null;
}


const DIALOG_FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Escape closes the open move-sheet/instance-sheet dialog (routed through
// the existing close-button click so there's one close path, not two); Tab
// is trapped inside it so keyboard focus can't silently wander into the
// route content sitting underneath the overlay.
export function onDialogKeydown(event, app) {
  const dialog = app.querySelector?.('.move-sheet[role="dialog"]')
    ?? app.ownerDocument?.getElementById?.("overlay-root")?.querySelector?.('.move-sheet[role="dialog"]');
  if (!dialog) return;
  if (event.key === "Escape") {
    dialog.querySelector('[data-action^="close-"]')?.click();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...dialog.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = dialog.ownerDocument?.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

// The Gyms#defend view ships closed <details data-lazy="..."> placeholders
// (see gyms.js's buildTierSectionBody/lazyGymPlaceholder) whose body is only
// built the first time they're opened — 'toggle' does not bubble, so this has
// to be a capturing listener on a root that contains them, same reasoning as
// handleSpriteError's 'error' listener just above it. getLazyContext is a
// thunk (not a plain object) so this always reads whatever gym/forms/roster
// state is current at click time, not whatever was in scope when bootstrap()
// ran.
// PvP joined Gyms here on 2026-08-11: its "Full rankings" <details> was 14,185
// of #pvp's 15,717 elements. It needs a different builder and different state,
// so the key now selects the builder rather than always meaning "a gym tier".
function onLazyToggle(event, getLazyContext) {
  const details = event.target;
  if (details?.tagName !== "DETAILS") return;
  // Coverage-band open/close bookkeeping (gyms.js's data-band-type) runs
  // regardless of the data-lazy/open guards below: a forceOpen band (already
  // hydrated, no data-lazy attribute) still needs its close tracked, and this
  // must persist independently of whether there's a lazy body left to build.
  const bandType = details.dataset?.bandType;
  if (bandType) {
    const openBands = getLazyContext().gymOpenBands;
    if (openBands) {
      if (details.open) openBands.add(bandType);
      else openBands.delete(bandType);
    }
  }
  if (!details.open || !details.hasAttribute?.("data-lazy")) return;
  const body = details.querySelector?.(":scope > .gym-lazy-body, :scope > .lazy-body");
  if (!body) return;
  const key = details.getAttribute("data-lazy");
  const context = getLazyContext();
  body.innerHTML = key === "pvp-full-rankings"
    ? buildPvpFullRankings(context)
    : buildLazyGymBody(key, context);
  details.removeAttribute("data-lazy");
}

function bindInteractions(app, controller, extraClickTargets = [], fullTargets = [], getLazyContext = null) {
  if (typeof app?.addEventListener !== "function") return () => {};
  const delegate = (operation) => {
    void Promise.resolve().then(operation).catch((error) => controller.handleFailure(error));
  };
  const onClick = (event) => delegate(() => controller.handleClick(event));
  const onChange = (event) => delegate(() => controller.handleChange(event));
  const onInput = (event) => controller.handleInput(event);
  const onKeydown = (event) => onDialogKeydown(event, app);
  const onToggle = getLazyContext ? (event) => onLazyToggle(event, getLazyContext) : null;
  // #app plus any full-delegation roots (the body-level overlay root that
  // hosts the move/instance sheets outside the clipped bezel) get the whole
  // event set, so sheet inputs, sprite-error fallbacks, and dialog keydown
  // work identically wherever the markup is mounted.
  const fullRoots = [app, ...fullTargets.filter(Boolean)];
  for (const root of fullRoots) {
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", onKeydown);
    // "error" does not bubble, so this must be a capturing listener; it swaps
    // any broken sprite <img> for its fallback circle without inline JS.
    root.addEventListener("error", handleSpriteError, true);
    if (onToggle) root.addEventListener("toggle", onToggle, true);
    // I1 long-press (mark mode only): arms on pointerdown, disarms on any of
    // the ways a press can end without completing. pointerleave doesn't
    // bubble, so it's registered on the capture phase (same trick as the
    // "error"/"toggle" listeners just above) — handleMarkPointerCancel scopes
    // it to actually leaving the pressed card, not just leaving the root.
    root.addEventListener("pointerdown", (event) => controller.handleMarkPointerDown(event));
    for (const type of ["pointerup", "pointercancel"]) {
      root.addEventListener(type, (event) => controller.handleMarkPointerCancel(event));
    }
    root.addEventListener("pointerleave", (event) => controller.handleMarkPointerCancel(event), true);
  }
  // The update banner lives in the persistent chrome outside #app (it must
  // survive route innerHTML swaps), so it needs its own click hookup into
  // the same [data-action] dispatch.
  for (const target of extraClickTargets) target?.addEventListener?.("click", onClick);
  return () => {
    for (const root of fullRoots) {
      root.removeEventListener?.("click", onClick);
      root.removeEventListener?.("change", onChange);
      root.removeEventListener?.("input", onInput);
      root.removeEventListener?.("keydown", onKeydown);
      root.removeEventListener?.("error", handleSpriteError, true);
      if (onToggle) root.removeEventListener?.("toggle", onToggle, true);
    }
    for (const target of extraClickTargets) target?.removeEventListener?.("click", onClick);
  };
}


// `gym` is a top-level chunk field (gyms.json), never part of `state.core`, and
// leaving it out made the whole shipped anti-<type> band vocabulary unreachable:
// "anti fighting", "counter machamp" and "what beats Blissey" all returned zero.
// It only fills in after a Gyms/leaderboard/triage visit — gyms.json is 610.6 KB
// and deliberately not in ROUTE_CHUNKS.home — which is why searchEmptyState says
// so out loud instead of showing an unexplained "no matches".
//
// Memoized on a COMPOSITE identity, not on `state.core` alone: a cold load
// re-bootstraps 4-5 times as chunks land (81.3ms per rebuild on home) and core
// is the same object each time, so keying on core alone would freeze the index
// at its pre-raid 1,754 entries and permanently drop the 1,595 raid-boss rows.
let searchIndexCache = null;

function memoizedSearchIndex(state) {
  const key = { core: state.core, raidTargetTool: state.raidTargetTool, gym: state.gym };
  if (searchIndexCache
    && searchIndexCache.core === key.core
    && searchIndexCache.raidTargetTool === key.raidTargetTool
    && searchIndexCache.gym === key.gym) return searchIndexCache.index;
  const index = buildSearchIndex({ ...state.core, raidTargetTool: key.raidTargetTool, gym: key.gym });
  searchIndexCache = { ...key, index };
  return index;
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
  // Chunks that exhausted their auto-retries — drives the error+retry
  // fallback below instead of the indefinite loading one.
  failedChunkPaths = new Set(),
  // Fired (fire-and-forget) whenever a route renders, so the caller can lazy
  // -fetch that route's missing chunks and re-bootstrap once they land.
  onRouteVisit = null,
  // Wired to the error notice's "Try again" button.
  onRetryRoute = null,
} = {}) {
  const app = documentObject?.getElementById?.("app");
  const overlayRoot = documentObject?.getElementById?.("overlay-root") ?? null;
  if (!app || !windowObject || !usableState(state)) {
    return { status: "fallback", router: null };
  }

  const index = memoizedSearchIndex(state);
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
  const pvpMoveCatalog = state.core.methodology?.pvpMoveCatalog ?? {};
  const moveIndex = buildMoveIndex(state.raids, state.pvp);
  const moveCountPool = buildMoveCountPool(state.pvp, pvpMoveCatalog);
  let controller;
  let searchRefresh = () => {};
  let currentRoute = "home";
  let currentView = "";
  let triageResult = null;
  const basePath = basePathFrom(windowObject.location);
  // "" whenever the asked-for route isn't the one in the URL — a rerender of
  // some other route can't inherit this route's sub-view.
  const viewForRoute = (route) => {
    const resolved = resolveRoute(windowObject.location.href, basePath);
    return resolved.route === route ? resolved.view : "";
  };
  // Focus management for the move-sheet/instance-sheet dialogs: remembers
  // whether a dialog was open on the previous render and what had focus
  // before it opened, so opening moves focus in and closing returns it —
  // WCAG 2.4.3 focus order for the app's only modal overlays.
  let sheetWasOpen = false;
  let sheetReturnFocus = null;
  const getTriageResult = () => {
    if (!triageResult) triageResult = triageRoster({ data: state, roster, trainerLevel: ui.trainerProfile.level });
    return triageResult;
  };
  // Re-derives the exact featured/plan/boss pick renderFieldBriefing already
  // drew the "Share tonight's plan" button from — the interaction controller
  // itself only has `forms` in scope, not the whole release `state`.
  const getRaidPlanCardData = () => currentRaidPlanCardData({
    currentBosses: state.currentBosses, forms: state.core.forms, roster, data: state, trainerLevel: ui.trainerProfile.level,
  });
  const getGymLineupCardData = () => gymLineupCardData(state.gym?.lineupLeads, ui.trainerProfile.team, state.core.forms);
  const getRotationPackCardData = () => rotationPackCardData({
    currentBosses: state.currentBosses, forms: state.core.forms, data: state,
  });
  const getCurrentBosses = () => state.currentBosses;
  // Roster gap coverage (round 15, gap-analyzer.js) needs raids.json's
  // ranked rows — gap-analyzer.js iterates both raids.regular and
  // raids.shadow, so this is gated on BOTH split files actually being loaded
  // (independent of which route triggered that load) so Home/Today never
  // claim a gap from data that simply hasn't fully landed yet.
  const getGapByFormId = () => (loadedChunkPaths.has("raids-regular.json") && loadedChunkPaths.has("raids-shadow.json")
    ? buildGapByFormId({
      coverage: typeCoverage({ raids: state.raids, roster }),
      currentBosses: state.currentBosses,
      currentEvents: state.currentEvents,
      forms: state.core.forms,
    })
    : null);
  // #basics/<view> — the Learn hub's sub-views. Static copy, no chunk data.
  const LEARN_VIEWS = {
    types: () => renderTypes(),
    glossary: () => renderGlossary(),
    drill: () => renderDrill(ui.drill),
    tricks: () => renderTricks(),
    max: () => renderMaxBasics(),
    items: () => renderEvolutionItems({ acquisitionGuide: state.acquisitionGuide, forms: state.core.forms }),
  };
  const deltaView = () => renderDelta({
    diff: loadCachedReleaseDiff(storage, releaseState.manifest?.releaseId ?? null),
    roster,
  });
  const tradesView = () => {
    const selectedFriend = ui.tradeFriends.find((friend) => friend.id === ui.trade.selectedFriendId) ?? null;
    return renderTrades({
      trade: ui.trade,
      friends: ui.tradeFriends,
      exportText: (() => {
        try {
          return exportDexSummary(ui.trade.name, state.core.forms, roster);
        } catch {
          return "";
        }
      })(),
      comparison: selectedFriend ? tradeComparison(state.core.forms, roster, selectedFriend) : null,
    });
  };
  // Chosen at render time (not at fetch-failure time) so it always reflects
  // the device's current connectivity — a chunk that failed while offline
  // reads as "reconnect and try again" as soon as the network's actually
  // back, not stuck on stale offline copy.
  const chunkNotice = (route, label) => (routeChunkFailed(route, failedChunkPaths)
    ? chunkErrorNotice(route, label, windowObject.navigator?.onLine === false)
    : chunkLoadingNotice(label));
  // Shared by renderers.more(view) and renderers.dex(view)'s no-formId
  // fallback (bare #dex is now the living-dex grid's home — router.js's
  // more/collection -> dex redirect). Factored out rather than called via
  // renderers.more directly: by the time dex(view) runs, the route-wrapping
  // loop below has already replaced renderers.more with a version that
  // stamps currentRoute = "more", which would desync rerenderCurrent() and
  // the staleness banner from the actual #dex URL still in the address bar.
  const renderMoreRoute = (view) => {
    if (view === "delta") {
      app.innerHTML = deltaView();
      return;
    }
    if (view === "trades") {
      app.innerHTML = interactionNotice(ui) + tradesView();
      return;
    }
    // Storage estimate is async and only needs fetching once per session;
    // cache it on ui.diagnostics and rerender More when it resolves. Only
    // #more/about renders it, so only that view pays for the call.
    if (view === "about" && ui.diagnostics.storageEstimate === undefined) {
      ui.diagnostics.storageEstimate = null;
      windowObject.navigator?.storage?.estimate?.()
        .then((estimate) => {
          ui.diagnostics.storageEstimate = estimate ?? false;
          if (currentRoute === "more") renderers.more(currentView);
        })
        .catch(() => { ui.diagnostics.storageEstimate = false; });
    }
    // Only the library lists read extras.json. The menu, roster, settings
    // and about views are pure local state, so they must not sit behind a
    // chunk fetch — More is the nav destination. The collection grid is the
    // same: forms + roster only (verified in docs/dex-two-panel-spec.md §2.1),
    // and it now ALSO renders on bare #dex, where extras.json never loads —
    // gating it stranded cold #dex on a loading state forever (caught by the
    // publish e2e, 2026-08-12, after three green unit suites missed it).
    const needsChunks = Boolean(MORE_LISTS[view]) && view !== "collection";
    app.innerHTML = (!needsChunks || routeChunksReady("more", loadedChunkPaths)
      ? renderMore({
        ...state.core,
        budgets: state.budgets,
        megasPrimals: state.megasPrimals,
        futureProof: state.futureProof,
        coveragePlanner: state.coveragePlanner,
        view,
        roster,
        storageObject: storage,
        groupMessage: ui.groupMessage,
        groupMemberName: ui.groupMemberName,
        rosterQuery: ui.rosterQuery,
        collectionQuery: ui.collectionQuery,
        collectionFilter: ui.collectionFilter,
        collectionMarkMode: ui.collectionMarkMode,
        collectionMarkTally: ui.collectionMarkSessionFormIds.length,
        collectionMarkType: ui.collectionMarkType,
        collectionSuggestOpen: ui.collectionSuggestOpen,
        collectionSheetFormId: ui.collectionSheetFormId,
        collectionExitingFormIds: ui.collectionExitingFormIds,
        ocrIntake: ui.ocrIntake,
        rosterShareOpen: ui.rosterShareOpen,
        bulkRemove: ui.bulkRemove,
        raids: state.raids,
        pvp: state.pvp,
        gym: state.gym,
        compareSelection: ui.compare,
        currentBosses: state.currentBosses ?? state.core?.currentBosses,
        textSize: ui.textSize,
        theme: ui.theme,
        trainerProfile: ui.trainerProfile,
        friendCodeInput: ui.friendCodeInput,
        friendCodeError: ui.friendCodeError,
        friendCodesMessage: ui.friendCodesMessage,
        friends: ui.friends,
        friendDraft: ui.friendDraft,
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
        journal: (() => {
          const { entries, warnings, bestStreak } = loadJournal(storage);
          return {
            entries,
            warnings,
            streak: streakInfo(entries, new Date(), bestStreak),
            recap: weeklyRecap(entries, roster),
          };
        })(),
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
      : chunkNotice("more", "More")) + interactionNotice(ui);
  };
  const renderers = {
    home() {
      // Home is the "what should I do now" surface: today's checklist, where
      // to spend resources, the buddy plan, then reference below. Deliberately
      // not gated on routeChunksReady like the verdict pages are — it's the
      // cold-boot landing route, and every section here renders its own empty
      // state from whatever has actually landed, then re-renders when the
      // rest of the chunks do.
      // Daily quests + boss countdowns — both never-throw, both render ""
      // when their data hasn't landed; Home stays a cold-boot-safe route.
      const questDateKey = todayDateISO(new Date());
      const questJournal = (() => {
        const { entries, bestStreak } = loadJournal(storage);
        return { entries, streak: streakInfo(entries, new Date(), bestStreak) };
      })();
      const questsCardHtml = renderDailyQuestsCard({
        quests: generateQuests({
          dateKey: questDateKey, roster, forms: state.core.forms,
          currentBosses: state.currentBosses, journal: questJournal,
        }),
        state: loadQuestState(storage, questDateKey),
      });
      const countdownChipsHtml = renderCountdownChips({
        rows: bossCountdowns({
          currentBosses: state.currentBosses, roster, forms: state.core.forms,
          raidRows: state.raids, now: new Date(),
        }),
        forms: state.core.forms,
      });
      const evolutionHoldsCardHtml = renderEvolutionHoldsCard({
        holds: evolutionHolds({
          currentEvents: state.currentEvents, forms: state.core.forms, roster, now: new Date(),
        }),
        forms: state.core.forms,
      });
      const eventEvolveCardHtml = renderEventEvolveCard({
        advice: eventEvolveAdvice({
          eventEvolveMoves: state.eventEvolveMoves, forms: state.core.forms,
          roster, raids: state.raids, pvp: state.pvp, gym: state.gym, now: new Date(),
        }),
        forms: state.core.forms,
      });
      app.innerHTML = interactionNotice(ui) + renderHome({
        questsCardHtml,
        countdownChipsHtml,
        evolutionHoldsCardHtml,
        eventEvolveCardHtml,
        streakChipHtml: streakChipHtml(questJournal.streak),
        cutoff: state.core.meta?.asOf,
        offlineStatus: state.offlineStatus ?? offlineLabel(releaseState),
        updateStatus: state.updateStatus ?? releaseLabel(releaseState),
        continueTask: continueTaskFor(state, ui),
        currentBosses: state.currentBosses,
        currentEvents: state.currentEvents,
        raidTargetTool: state.raidTargetTool,
        forms: state.core.forms,
        whatsNew: whatsNewCard(releaseState, storage),
        releaseDiff: loadCachedReleaseDiff(storage, releaseState.manifest?.releaseId ?? null),
        roster,
        storage,
        gapByFormId: getGapByFormId(),
        data: state,
        defenseLog: ui.defenseLog,
        futureProof: state.futureProof,
        buddyPlan: ui.buddyPlan,
        trainerLevel: ui.trainerProfile.level,
        briefingShareMessage: ui.briefingShareMessage,
        investRows: nextActions({
          data: state,
          roster,
          stardust: ui.stardust,
          candyInventory: ui.candyInventory,
          weather: ui.weather,
        }),
      });
      searchRefresh = bindSearch(documentObject, index, state.core.forms, roster, storage, {
        raidTargetTool: state.raidTargetTool,
        raids: state.raids,
        // Only so the empty state can say whether band search is live yet.
        gym: state.gym,
      });
    },
    basics(view) {
      app.innerHTML = (LEARN_VIEWS[view] ?? renderBasics)();
    },
    eggs() {
      app.innerHTML = interactionNotice(ui) + (state.currentEggs
        ? renderEggs({ currentEggs: state.currentEggs, forms: state.core.forms, acquisitionGuide: state.acquisitionGuide, shinyOdds: state.shinyOdds })
        : chunkNotice("eggs", "Egg Pool"));
    },
    rocket() {
      app.innerHTML = interactionNotice(ui) + (state.currentBosses && state.currentEvents
        ? renderRocket({
          currentBosses: state.currentBosses,
          currentEvents: state.currentEvents,
          raidTargetTool: state.raidTargetTool,
          forms: state.core.forms,
          // Deliberately not part of the gate above: a release published
          // before this chunk existed carries no rocketLineups, and the
          // lineup section renders its own honest empty state rather than
          // blanking the whole page.
          rocketLineups: state.rocketLineups,
        })
        : chunkNotice("rocket", "Team GO Rocket"));
    },
    // formId rides in as `view` — the router's dex carve-out (router.js) is
    // the only route with a dynamic (non-enumerable) view segment. Sections
    // render off whatever chunk data has landed so far (Home-style, not a
    // whole-page gate — see docs/dex-route-spec.md §7): core.forms is always
    // eager, so identity/stats/moves/evolution render on a cold deep-link
    // immediately, and gym/pvp/boss/acquisition/eggs fill in as ROUTE_CHUNKS.dex
    // lands. Also wires the global search box, a no-op unless the formId is
    // unknown (renderDex's fallback shell embeds one — see dex.js).
    dex(view) {
      // Bare #dex (no formId) is the living-dex grid's home now (router.js's
      // more/collection -> dex redirect) — render the same collection view
      // #more/collection used to, rather than renderDex's "unknown form"
      // fallback shell.
      if (!view) {
        renderMoreRoute("collection");
        return;
      }
      // I2 quick-add draft is normalized here, per-formId, on every dex
      // render: navigating to a different entry (or the first visit) resets
      // it to a blank add-mode draft rather than carrying a stale one over.
      if (ui.quickAddFormId !== view) {
        ui.quickAddFormId = view;
        ui.quickAdd = blankQuickAddDraft();
      }
      // Two-panel dex (docs/dex-two-panel-spec.md): a plain matchMedia read,
      // same one-shot pattern this file already uses for prefers-reduced-
      // motion — no resize listener, so rotating/resizing mid-view doesn't
      // flip panels until the next dex render (same ceiling that pattern
      // already accepts). ?? false covers matchMedia-less test harnesses.
      const twoPanel = windowObject.matchMedia?.("(min-width: 48rem)")?.matches ?? false;
      // The rail owns its own scroll region (spec §3.3: selecting an entry
      // must not lose rail scroll), but app.innerHTML below destroys and
      // rebuilds the whole subtree on every render — a plain re-render would
      // silently reset it to the top. Capture/restore around the swap
      // instead of a DOM diff. Optional chaining makes this a no-op in the
      // string-based test harness (no real querySelector there).
      const previousRail = app?.querySelector?.(".dex-rail");
      const railScrollTop = previousRail ? previousRail.scrollTop : null;
      const dexHolds = evolutionHolds({
        currentEvents: state.currentEvents, forms: state.core.forms, roster, now: new Date(),
      });
      app.innerHTML = interactionNotice(ui) + renderDex({
        formId: view,
        evolutionHold: holdForFormId(dexHolds, view),
        evolveChecklistData: evolveChecklist({
          formId: view, forms: state.core.forms, roster, holds: dexHolds,
          raidRows: state.raids, pvpRows: state.pvp,
        }),
        forms: state.core.forms,
        gym: state.gym,
        pvp: state.pvp,
        raidTargetTool: state.raidTargetTool,
        raids: state.raids,
        raidsLoaded: loadedChunkPaths.has("raids-regular.json") && loadedChunkPaths.has("raids-shadow.json"),
        acquisitionGuide: state.acquisitionGuide,
        currentEggs: state.currentEggs,
        roster,
        quickAdd: ui.quickAdd,
        ocrIntake: ui.ocrIntake,
        twoPanel,
        dexRailQuery: ui.dexRailQuery,
        dexRailFilter: ui.dexRailFilter,
        shinySprite: ui.dexShinySprite,
      });
      if (railScrollTop !== null) {
        const rail = app?.querySelector?.(".dex-rail");
        if (rail) rail.scrollTop = railScrollTop;
      }
      searchRefresh = bindSearch(documentObject, index, state.core.forms, roster, storage, {
        raidTargetTool: state.raidTargetTool,
        raids: state.raids,
        // Only so the empty state can say whether band search is live yet.
        gym: state.gym,
      });
    },
    raids(view) {
      // ?boss=<formId> is a deep link into the target view. Move the hash with
      // it so the strip, Back and a re-share of the URL all agree, and consume
      // the param once so later re-renders (picking a different target) aren't
      // silently overridden back to it.
      let activeView = view;
      const bossParam = new URLSearchParams(windowObject.location?.search ?? "").get("boss");
      // An explicitly-requested boss that fails validFormIds must not fall
      // through to whatever ui.raid.targetFormId already held (raidState's
      // own Mewtwo default) — that would silently show a different Pokemon's
      // counters for a request that named a specific one. Only render the
      // honest "no data" notice for a real request; a plain #raids/target
      // visit with no ?boss= at all keeps rendering its existing target.
      let bossNotFound = false;
      if (activeView !== "hundo" && bossParam) {
        if (validFormIds.has(bossParam)) {
          ui.raid.targetFormId = bossParam;
          activeView = "target";
          const url = new URL(windowObject.location.href);
          url.searchParams.delete("boss");
          url.hash = "#raids/target";
          windowObject.history.replaceState({}, "", url.href);
        } else {
          bossNotFound = true;
          activeView = "target";
        }
      }
      // The strip is rendered here, not inside renderRaidSurface: Hundo is a
      // sibling view from another module, and a tab strip you cannot use to
      // leave the tab is the dead end #more used to be.
      const tabs = viewSegments("Raid view", "raids", [
        ["", "Top 15 by type"],
        ["target", "Raid Target"],
        ["hundo", "Hundo Priority"],
      ], activeView);
      // Budget Attackers lives under #more/budget and is a good page nobody could
      // find — reported as a missing section when it had shipped long before.
      // Point at it from the route where you would go looking.
      const budgetPointer = `<p class="raid-budget-pointer"><a class="safe-escape" href="./#more/budget" data-route="more" data-view="budget">Building on a budget? See Budget Attackers →</a></p>`;
      if (activeView === "hundo") {
        // Same honesty gate as Triage: a chase/don't-chase verdict built
        // from partial raid+PvP data would be wrong, not just incomplete.
        // weakLaneTypes (round 15 seam): the roster's uncovered attacking
        // types from the same gap analyzer Roster Gaps reads, so a hundo
        // that's also a ranked attacker of a weak lane can cross-link there.
        app.innerHTML = interactionNotice(ui) + tabs + (routeChunksReady("raids", loadedChunkPaths)
          ? renderHundo({
            data: state,
            weakLaneTypes: new Set(weakLanes(typeCoverage({ raids: state.raids, roster })).map((lane) => lane.attackingType)),
          })
          : chunkNotice("raids", "Hundo Priority"));
        return;
      }
      if (bossNotFound) {
        app.innerHTML = interactionNotice(ui) + tabs
          + `<div class="raids-view"><aside class="fallback-section" role="alert">No current data for that boss.</aside></div>`;
        return;
      }
      app.innerHTML = interactionNotice(ui) + tabs + budgetPointer + (state.raids && state.raidTargetTool
        ? renderRaidSurface(state, ui, roster, activeView)
        : chunkNotice("raids", "Raids"));
    },
    gyms(view) {
      const placementState = { ...state, lineupFormIds: ui.gym.lineupFormIds };
      const placementResult = placementFor(placementState, roster);
      app.innerHTML = interactionNotice(ui) + (state.gym
        // The lineup builder is Defending content and was rendering on both
        // tabs, above the tab strip itself — so the Attacking tab opened on a
        // defender-placement control, the exact confusion the split was meant
        // to remove. Hand it to renderGyms so it sits inside the tab body.
        ? `${renderGyms({
          lineupControls: view === "defend" ? gymLineupControls(state, ui) : "",
          lineupShape: ui.gym.lineupShape,
          ownedOnly: ui.gym.ownedOnly,
          gym: state.gym,
          forms: state.core.forms,
          placementResult,
          ownedFormIds: roster.ownedFormIds,
          ownedIndex: ui.gym.ownedIndex,
          overallIndex: ui.gym.overallIndex,
          openBands: [...ui.gym.openBands],
          defenseLog: ui.defenseLog,
          rosterInstances: roster.instances,
          trainerTeam: ui.trainerProfile.team,
          lineupShareMessage: ui.gymLineupShareMessage,
          view,
          lazy: true,
        })}`
        : chunkNotice("gyms", "Gyms"));
    },
    leaderboard() {
      // Smart default: prefill a blank drop-form Pokémon field with the top
      // owned suggestion (same Placement Coach ranking) that isn't already
      // deployed elsewhere. Only applies while the field is genuinely blank,
      // so it never clobbers what the user is actively typing.
      const placementState = { ...state, lineupFormIds: ui.gym.lineupFormIds };
      const placementResult = placementFor(placementState, roster);
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
      app.innerHTML = interactionNotice(ui) + renderLeaderboard({
        log: ui.defenseLog,
        draft: ui.defenseLogDraft,
        trainerTeam: ui.trainerProfile.team,
      });
    },
    pvp(view) {
      // Swap lives in its own module, so the strip is built here and shared by
      // both branches rather than inside renderPvp.
      const tabs = viewSegments("PvP view", "pvp", [
        ["", "Teams"],
        ["rankings", "Rankings"],
        ["antimeta", "Anti-Meta"],
        ["swap", "Battle Swap"],
      ], view);
      if (view === "swap") {
        app.innerHTML = interactionNotice(ui) + tabs + (state.pvp
          ? renderSwap({
            pvp: state.pvp, pvpTeams: state.pvpTeams, forms: state.core.forms,
            roster, state: ui.swap, moveCatalog, pvpMoveCatalog,
          })
          : chunkNotice("pvp", "Swap"));
        return;
      }
      app.innerHTML = interactionNotice(ui) + tabs + (state.pvp
        ? renderPvp({
          pvp: state.pvp, pvpTeams: state.pvpTeams,
          pvpAlternatives: state.pvpAlternatives, forms: state.core.forms,
          roster, state: ui.pvp, view, trainerLevel: ui.trainerProfile.level, pvpMoveCatalog,
        })
        : chunkNotice("pvp", "PvP"));
    },
    triage(view) {
      // Every view here is a verdict about the roster, and one computed from
      // partially-loaded raids/pvp/gym/boss data would be wrong, not just
      // incomplete — so all three wait for the route's chunks.
      const ready = routeChunksReady("triage", loadedChunkPaths);
      // Same strip as Raids/Gyms/PvP. Without it #triage/gaps and #triage/candy
      // are dead ends — neither sub-view module carries a ./#triage escape, and
      // Candy Planner is otherwise only reachable from the More menu.
      const tabs = viewSegments("My Box view", "triage", [
        ["", "Triage"],
        ["gaps", "Roster Gaps"],
        ["candy", "Candy Planner"],
      ], view);
      if (view === "candy") {
        // Trade seam: dex numbers any saved trade friend lacks (from the same
        // tradeComparison the Trades view renders) — flags "keep for trading"
        // rows against "evolve to fill YOUR dex" ones.
        const friendGapDex = new Set();
        for (const friend of ui.tradeFriends) {
          for (const row of tradeComparison(state.core.forms, roster, friend).youHaveTheyLack) {
            friendGapDex.add(row.dex);
          }
        }
        app.innerHTML = interactionNotice(ui) + tabs + (ready
          ? renderCandyPlan({
            forms: state.core.forms,
            roster,
            candyInventory: ui.candyInventory,
            raids: state.raids,
            pvp: state.pvp,
            gym: state.gym,
            friendGapDex,
          })
          : chunkNotice("triage", "Candy Planner"));
        return;
      }
      if (view === "gaps") {
        app.innerHTML = interactionNotice(ui) + tabs + (ready
          ? renderBuildNext({
            forms: state.core.forms,
            roster,
            raids: state.raids,
            candyInventory: ui.candyInventory,
            triageResult: getTriageResult(),
            trainerLevel: ui.trainerProfile.level,
            currentBosses: state.currentBosses,
            currentEvents: state.currentEvents,
          })
          : chunkNotice("triage", "Roster Gaps"));
        return;
      }
      app.innerHTML = interactionNotice(ui) + tabs + (ready
        ? renderTriage({
          result: getTriageResult(),
          forms: state.core.forms,
          state: ui.triage,
          showGuide: showTriageGuide(storage),
          weakLaneCount: weakLanes(typeCoverage({ raids: state.raids, roster })).length,
        })
        : chunkNotice("triage", "Triage"));
    },
    more(view) {
      renderMoreRoute(view);
    },
  };
  for (const route of Object.keys(renderers)) {
    const base = renderers[route];
    // The sub-view comes from the URL, not from an argument: a rerender
    // triggered by an in-view interaction (a checkbox, a filter chip) must
    // land on the same view the user is looking at without every one of the
    // ~200 rerender() call sites having to know which that is.
    renderers[route] = (view = viewForRoute(route)) => {
      currentRoute = route;
      currentView = view;
      // Handle URL quick-log params for the leaderboard: ?log=1&gym=<name>&mon=<formId>#leaderboard
      // searchParams.get() returns already-decoded values, so don't decodeURIComponent again
      if (route === "leaderboard") {
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
      base(view);
      // Route-driven chunk loading: kick off (fire-and-forget) any release
      // chunk this route needs but hasn't loaded yet, AFTER base() has
      // rendered off the current loadedChunkPaths — ensureRouteChunks claims
      // missing paths synchronously (before its first await), so calling it
      // first would make routeChunksReady lie to base() about data that
      // hasn't landed yet. onRouteVisit re-bootstraps once the fetch lands
      // so the loading notice/fallback above swaps for the real view.
      const chunkVisit = onRouteVisit?.(route);
      // Home's roster-gap teaser (and the dex entry's raid-attacker section)
      // need raids.json but it's deliberately not in ROUTE_CHUNKS.home/dex
      // (see those comments) — chain its fetch to start only once the
      // route's own chunk visit has settled (immediately, on a cached visit),
      // so its ~1MB parse never competes with the chunks the route's actual
      // first-quality render depends on. Promise.resolve tolerates
      // onRouteVisit being undefined or a test stub that returns nothing.
      if (route === "home" || route === "dex") {
        Promise.resolve(chunkVisit).then(() => onRouteVisit?.(HOME_DEFERRED_CHUNK_KEY));
      }
      // Prepend into #app so the guide scrolls with the view instead of
      // sitting in fixed chrome above the bezel. insertAdjacentHTML (not a
      // second innerHTML assignment) only parses the new fragment, so it
      // doesn't tear down nodes base() already bound live listeners to
      // (e.g. home's search input via bindSearch).
      app.insertAdjacentHTML("afterbegin", renderGuide(route, storage));
      // Sheets render into the body-level overlay root, NOT #app: #app sits
      // inside .bezelwrap whose chamfer clip-path clips fixed descendants, so
      // a sheet mounted in #app has its lower-left corner cut on real WebKit
      // (2026-07-23 device QA; headless renders clip-path differently). One
      // assignment per render also clears a just-closed sheet.
      let overlayHtml = "";
      if (ui.moveSheet) {
        overlayHtml += renderMoveSheet({
          moveSettings: state.moveSettings,
          moveId: ui.moveSheet,
          catalog: moveCatalog,
          moveIndex,
          roster,
          forms: state.core.forms,
        });
      }
      if (ui.instanceSheet) {
        const renameByInstanceId = new Map(getTriageResult().entries
          .filter((entry) => entry.instance)
          .map((entry) => [entry.instance.id, renameStringForEntry(entry)]));
        overlayHtml += renderInstanceSheet({
          form: state.core.forms[ui.instanceSheet.formId],
          forms: state.core.forms,
          instances: roster.instances ?? [],
          draft: ui.instanceSheet.draft,
          error: ui.instanceSheet.error,
          focusInstanceId: ui.instanceSheet.focusInstanceId,
          quickCp: ui.instanceSheet.quickCp,
          shareMessage: ui.instanceSheet.shareMessage,
          pvp: state.pvp,
          renameByInstanceId,
          renameCopy: ui.instanceSheet.renameCopy,
          starTier: ui.instanceSheet.starTier ?? null,
        });
      }
      // I1's mini-sheet is NOT spliced here — views/collection.js renders it
      // inline (collectionSheet(), keyed off collectionSheetFormId in the
      // "more" payload above), unlike move/instance sheets above.
      if (overlayRoot) overlayRoot.innerHTML = overlayHtml;
      updateLeds(documentObject, releaseState, roster);
      updateBanner(documentObject, releaseState, storage);
      updateStalenessBanner(documentObject, roster, storage, currentRoute);
      const sheetOpenNow = Boolean(ui.moveSheet || ui.instanceSheet);
      if (sheetOpenNow && !sheetWasOpen) {
        sheetReturnFocus = documentObject.activeElement ?? null;
        (overlayRoot ?? app).querySelector?.('.move-sheet [data-action^="close-"]')?.focus();
      } else if (!sheetOpenNow && sheetWasOpen) {
        sheetReturnFocus?.focus?.();
        sheetReturnFocus = null;
      }
      sheetWasOpen = sheetOpenNow;
    };
  }
  const router = createRouter({
    basePath,
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
    onRetryRouteChunks: onRetryRoute,
    renderRoute(route) {
      renderers[route]?.();
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
    // I3 OCR row-edit: navigate to a different formId's dex entry (the row's
    // matched species may not be whatever page the scan was opened from —
    // bulk intake spans several species at once). A no-op when it's already
    // the current page, since setting location.hash to its current value
    // fires no hashchange — rerenderCurrent() (called right after by the
    // dispatch) covers that case instead.
    onNavigateToDex(formId) {
      windowObject.location.hash = `dex/${formId}`;
    },
    getTriageResult,
    getRaidPlanCardData,
    getRotationPackCardData,
    getCurrentBosses,
    getGymLineupCardData,
    onRosterChanged() { triageResult = null; },
    searchRefresh: () => searchRefresh(),
    rerenderCurrent: () => renderers[currentRoute]?.(),
    isCurrentRoute: (route) => currentRoute === route,
    currentView: () => currentView,
    rootElement: documentObject.documentElement,
    scrollToTop: () => app.scrollTo?.(0, 0),
    storage,
  });
  router.start();
  const stopInteractions = bindInteractions(app, controller, [
    documentObject.getElementById?.("update-banner"),
    documentObject.getElementById?.("staleness-banner"),
  ], [overlayRoot], () => ({
    gym: state.gym,
    forms: state.core.forms,
    ownedFormIds: roster.ownedFormIds,
    ownedOnly: ui.gym.ownedOnly,
    gymOpenBands: ui.gym.openBands,
    // Added for #pvp's deferred Full rankings body. Read at open time, like
    // everything else here: the league filter can change between the render
    // that shipped the closed <details> and the tap that opens it.
    pvp: state.pvp,
    pvpState: ui.pvp,
    trainerLevel: ui.trainerProfile.level,
    pvpMoveCatalog: state.core.methodology?.pvpMoveCatalog ?? {},
  }));
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
  // Streak tracks "opened the app today" — logJournalEntry's own visit
  // dedup makes this one-per-local-day, and persist never throws.
  logJournalEntry(windowObject?.localStorage ?? null, {
    kind: "visit",
    at: new Date().toISOString(),
    detail: {},
  });
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
      failedChunkPaths: chunkLoader.failedChunkPaths,
      onRouteVisit: chunkLoader.ensureRouteChunks,
      onRetryRoute: chunkLoader.retryRoute,
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
    // "What changed" diff: computed once per landed release (cached, keyed
    // to that release id — see release-diff.js), not held in memory here.
    // Fire-and-forget; a second rebootstrap once it lands is what lets the
    // Home card and #more/delta view pick it up without the operator navigating.
    // Skip that second rebootstrap on a cache hit — the rebootstrap just
    // above already rendered with this same cached diff via
    // loadCachedReleaseDiff, so re-running it would be a wasted full re-render.
    const storage = windowObject?.localStorage ?? null;
    const alreadyCached = Boolean(loadCachedReleaseDiff(storage, releaseState.manifest?.releaseId ?? null));
    void refreshReleaseDiff({ releaseManager, storage })
      .then(() => {
        if (!alreadyCached) rebootstrap();
      })
      .catch(() => {});
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


// The `raids` key is split across raids-regular.json and raids-shadow.json
// (pwa.py's SPLIT_KEY_OWNERS). Its halves must JOIN, never overwrite: `regular`
// and `shadow` appear in only one file each, but sibling lists appear in both.
export function mergeRaidsHalves(left = {}, right = {}) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const existing = merged[key];
    merged[key] = Array.isArray(existing) && Array.isArray(value)
      ? [...existing, ...value]
      : value;  // ponytail: concat is enough; nothing under `raids` needs dedupe today
  }
  return merged;
}
