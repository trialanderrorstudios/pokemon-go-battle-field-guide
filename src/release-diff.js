// "What changed" — a structural diff between the previous and current
// release's PvP rankings, raid boss rotation, and species list. Computed
// once per release update (see refreshReleaseDiff) and cached as a summary
// object in storage, NOT by holding both releases' full data in memory —
// the previous release's chunk files are fetched fresh (over the network,
// hash-verified via ReleaseManager.loadReleaseFiles) at diff time, then
// discarded once the diff summary is built.
import { validateReleaseManifest } from "./release-manager.js";

const RELEASE_DIFF_STORAGE_KEY = "pogo-release-diff";
const LEAGUES = Object.freeze(["great", "ultra", "master"]);

function movesetChanged(before, entry) {
  if (!before) return false; // "new" already covers a first appearance.
  if (before.fastMove !== entry.fastMove) return true;
  const beforeSet = new Set(before.chargedMoves ?? []);
  const currentSet = new Set(entry.chargedMoves ?? []);
  if (beforeSet.size !== currentSet.size) return true;
  for (const move of currentSet) if (!beforeSet.has(move)) return true;
  return false;
}

function diffPvpLeague(league, previousEntries = [], currentEntries = []) {
  const previousByFormId = new Map(previousEntries.map((entry) => [entry.formId, entry]));
  const changes = [];
  for (const entry of currentEntries) {
    const before = previousByFormId.get(entry.formId);
    const isNew = !before;
    const rank = (isNew || before.rank !== entry.rank)
      ? { previous: before?.rank ?? null, current: entry.rank }
      : null;
    const moveset = movesetChanged(before, entry)
      ? {
        previous: { fastMove: before.fastMove, chargedMoves: before.chargedMoves },
        current: { fastMove: entry.fastMove, chargedMoves: entry.chargedMoves },
      }
      : null;
    if (isNew || rank || moveset) {
      changes.push({ league, formId: entry.formId, pokemon: entry.pokemon, isNew, rank, moveset });
    }
  }
  return changes;
}

function diffBossRotation(previousBosses = [], currentBosses = [], forms = {}) {
  const previousIds = new Set(previousBosses.map((boss) => boss.formId));
  const currentIds = new Set(currentBosses.map((boss) => boss.formId));
  const withName = (boss) => ({ ...boss, name: forms?.[boss.formId]?.name ?? boss.formId });
  return {
    added: currentBosses.filter((boss) => !previousIds.has(boss.formId)).map(withName),
    removed: previousBosses.filter((boss) => !currentIds.has(boss.formId)).map(withName),
  };
}

function diffNewSpecies(previousForms = {}, currentForms = {}) {
  return Object.entries(currentForms)
    .filter(([formId]) => !Object.hasOwn(previousForms, formId))
    .map(([formId, form]) => ({ formId, dex: form?.dex ?? null, name: form?.name ?? formId }));
}

function emptyDiff(currentReleaseId, previousReleaseId, reason) {
  return {
    schemaVersion: 1,
    previousReleaseId,
    currentReleaseId,
    available: false,
    reason,
    pvpChanges: [],
    bossRotation: { added: [], removed: [] },
    newSpecies: [],
    computedAt: new Date().toISOString(),
  };
}

// Pure: previous/current are already-loaded release chunk data (the `pvp`,
// `currentBosses`, and `forms` fields — see pwa.py's VIEW_KEYS), not the
// release manager or any I/O.
export function computeReleaseDiff({ previousReleaseId, currentReleaseId, previous = {}, current = {} }) {
  const pvpChanges = LEAGUES.flatMap((league) => diffPvpLeague(
    league, previous?.pvp?.[league], current?.pvp?.[league],
  ));
  const forms = { ...previous?.forms, ...current?.forms };
  const bossRotation = diffBossRotation(previous?.currentBosses?.bosses, current?.currentBosses?.bosses, forms);
  const newSpecies = diffNewSpecies(previous?.forms, current?.forms);
  return {
    schemaVersion: 1,
    previousReleaseId,
    currentReleaseId,
    available: true,
    reason: null,
    pvpChanges,
    bossRotation,
    newSpecies,
    computedAt: new Date().toISOString(),
  };
}

export function hasReleaseDiffChanges(diff) {
  return Boolean(diff?.available) && (
    diff.pvpChanges.length > 0
    || diff.bossRotation.added.length > 0
    || diff.bossRotation.removed.length > 0
    || diff.newSpecies.length > 0
  );
}

// Pure: which of the diff's PvP changes touch a Pokémon the player owns.
export function intersectRosterChanges(diff, roster) {
  const owned = new Set(roster?.ownedFormIds ?? []);
  return (diff?.pvpChanges ?? []).filter((entry) => owned.has(entry.formId));
}

// ponytail: same disposable per-release localStorage flag as
// whats-new-dismissed in app.js — dismissing this release's card doesn't
// hide the next one.
export function releaseDiffDismissedKey(releaseId) {
  return `delta-dismissed:${releaseId}`;
}

// Cache is invalidated implicitly: a cached diff only counts if it was
// computed FOR the release that's current right now. Once another release
// lands, the stale previous->current pair no longer matches and this
// returns null so refreshReleaseDiff recomputes.
export function loadCachedReleaseDiff(storage, currentReleaseId) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(RELEASE_DIFF_STORAGE_KEY) ?? "null");
    if (!parsed || parsed.schemaVersion !== 1 || parsed.currentReleaseId !== currentReleaseId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedReleaseDiff(storage, diff) {
  storage?.setItem?.(RELEASE_DIFF_STORAGE_KEY, JSON.stringify(diff));
}

async function fetchReleaseManifestById(releaseManager, releaseId) {
  const anchor = globalThis.location?.href;
  const base = anchor ? new URL(releaseManager.baseUrl, anchor) : new URL(releaseManager.baseUrl);
  base.hash = "";
  base.search = "";
  if (!base.pathname.endsWith("/")) base.pathname = base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1);
  const url = new URL(`releases/${releaseId}/release-manifest.json`, base);
  const expectedPrefix = `${base.pathname}releases/${releaseId}/`;
  if (url.origin !== base.origin || !url.pathname.startsWith(expectedPrefix)) {
    throw new TypeError("Previous release manifest URL escaped its same-origin immutable path.");
  }
  const response = await releaseManager.fetch(url.href, { cache: "no-store", credentials: "same-origin" });
  if (!response?.ok) throw new Error(`Previous release manifest fetch failed (${response?.status ?? "unknown"}).`);
  return validateReleaseManifest(await response.json(), { appVersion: releaseManager.appVersion });
}

// Orchestration: called once per landed update (see app.js's release manager
// subscribe callback). Reuses ReleaseManager.loadReleaseFiles for both the
// previous release (its immutable directory remains fetchable after
// rotation off "current") and the current one — no new fetch/verify path.
// Gracefully degrades to an "unavailable" diff (still cached, so this isn't
// retried every render) when there's no previous release (first install) or
// its retained files are gone.
export async function refreshReleaseDiff({ releaseManager, storage }) {
  const currentManifest = releaseManager?.state?.manifest;
  if (!currentManifest?.releaseId) return null;
  const cached = loadCachedReleaseDiff(storage, currentManifest.releaseId);
  if (cached) return cached;

  const previousReleaseId = releaseManager.state.previousReleaseId ?? null;
  let diff;
  if (!previousReleaseId) {
    diff = emptyDiff(currentManifest.releaseId, null, "first-install");
  } else {
    try {
      const previousManifest = await fetchReleaseManifestById(releaseManager, previousReleaseId);
      const chunkPaths = ["pvp.json", "current-bosses.json", "core.json"];
      const [previousChunks, currentChunks] = await Promise.all([
        releaseManager.loadReleaseFiles(previousManifest, chunkPaths),
        releaseManager.loadReleaseFiles(currentManifest, chunkPaths),
      ]);
      diff = computeReleaseDiff({
        previousReleaseId,
        currentReleaseId: currentManifest.releaseId,
        previous: previousChunks,
        current: currentChunks,
      });
    } catch {
      diff = emptyDiff(currentManifest.releaseId, previousReleaseId, "previous-release-unavailable");
      // ponytail: don't cache — a transient fetch blip shouldn't permanently
      // no-op this feature for the whole release cycle; retry next call.
      return diff;
    }
  }
  saveCachedReleaseDiff(storage, diff);
  return diff;
}
