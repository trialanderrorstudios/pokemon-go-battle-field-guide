import { APP_SHELL_REVISION, APP_VERSION, validateReleaseManifest } from "./src/release-manager.js";
import { SPRITE_VARIANT_IDS } from "./src/sprites.js";

export const SHELL_CACHE = `pogo-shell-v${APP_VERSION}-${APP_SHELL_REVISION}`;
export const RELEASE_CACHE_PREFIX = "pogo-release-";
export const METADATA_CACHE = "pogo-release-metadata";

const METADATA_PATH = "__field-guide-release-metadata__.json";
const COMPLETE_PATH = "__verified-release__.json";
const MANIFEST_PATH = "release-manifest.json";
// Sprites are dex/variant-keyed static assets fetched once at build time by
// scripts/fetch-sprites.mjs (web/sprites/1.png .. 1025.png, plus one file per
// SPRITE_VARIANT_IDS entry) — they belong in the app shell like the other
// icons, not the versioned data-release cache.
const SPRITE_DEX_COUNT = 1025;
export const SHELL_FILES = Object.freeze([
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/app.css",
  "./icons/field-guide.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/share-qr.svg",
  "./src/app.js",
  "./src/coach.js",
  "./src/effectiveness.js",
  "./src/glossary.js",
  "./src/placement.js",
  "./src/pvp-team.js",
  "./src/raid-target.js",
  "./src/release-manager.js",
  "./src/router.js",
  "./src/drill.js",
  "./src/feedback.js",
  "./src/instances.js",
  "./src/moves.js",
  "./src/poke-genie-import.js",
  "./src/search.js",
  "./src/sprites.js",
  "./src/swap.js",
  "./src/text-size.js",
  "./src/theme.js",
  "./src/storage.js",
  "./src/triage.js",
  "./src/type-chart.js",
  "./src/views/basics.js",
  "./src/views/coach.js",
  "./src/views/glossary.js",
  "./src/views/drill.js",
  "./src/views/gyms.js",
  "./src/views/home.js",
  "./src/views/instance-sheet.js",
  "./src/views/maxbasics.js",
  "./src/views/more.js",
  "./src/views/move-sheet.js",
  "./src/views/pvp.js",
  "./src/views/raids.js",
  "./src/views/swap.js",
  "./src/views/triage.js",
  "./src/views/types.js",
  ...Array.from({ length: SPRITE_DEX_COUNT }, (_, index) => `./sprites/${index + 1}.png`),
  ...Object.values(SPRITE_VARIANT_IDS).map((id) => `./sprites/${id}.png`),
]);


function runtime(env = {}) {
  const scope = env.scope ?? globalThis.registration?.scope;
  if (!scope) throw new Error("Service worker scope is unavailable.");
  return {
    appVersion: env.appVersion ?? APP_VERSION,
    caches: env.caches ?? globalThis.caches,
    crypto: env.crypto ?? globalThis.crypto,
    fetch: env.fetch ?? globalThis.fetch.bind(globalThis),
    scope: new URL(scope).href,
  };
}


function scopedUrl(scope, path) {
  const base = new URL(scope);
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new TypeError("Release path must stay inside the same-origin service-worker scope.");
  }
  return url.href;
}


function releaseUrl(env, releaseId, path) {
  return scopedUrl(env.scope, `releases/${releaseId}/${path}`);
}


function metadataUrl(env) {
  return scopedUrl(env.scope, METADATA_PATH);
}


function emptyMetadata() {
  return {
    schemaVersion: 1,
    generation: 0,
    currentReleaseId: null,
    previousReleaseId: null,
    stagedReleaseId: null,
    currentManifest: null,
    previousManifest: null,
    stagedManifest: null,
  };
}


async function readMetadata(env) {
  const cache = await env.caches.open(METADATA_CACHE);
  const response = await cache.match(metadataUrl(env));
  if (!response) return emptyMetadata();
  try {
    const value = await response.json();
    if (!value || value.schemaVersion !== 1) return emptyMetadata();
    const metadata = { ...emptyMetadata(), ...value };
    metadata.generation = Number.isInteger(value.generation) && value.generation >= 0
      ? value.generation
      : 0;
    return metadata;
  } catch {
    return emptyMetadata();
  }
}


async function writeMetadata(env, metadata) {
  const cache = await env.caches.open(METADATA_CACHE);
  const response = new Response(JSON.stringify(metadata), {
    headers: { "content-type": "application/json" },
  });
  await cache.put(metadataUrl(env), response);
}


async function retireReleaseCaches(env, keepReleaseIds) {
  const keep = new Set(
    [...keepReleaseIds]
      .filter(Boolean)
      .map((releaseId) => `${RELEASE_CACHE_PREFIX}${releaseId}`),
  );
  let cacheNames;
  try {
    cacheNames = await env.caches.keys();
  } catch {
    return;
  }
  for (const cacheName of cacheNames) {
    const releaseId = cacheName.startsWith(RELEASE_CACHE_PREFIX)
      ? cacheName.slice(RELEASE_CACHE_PREFIX.length)
      : "";
    if (/^\d{4}-\d{2}-\d{2}-[0-9a-f]{12}$/.test(releaseId) && !keep.has(cacheName)) {
      try {
        await env.caches.delete(cacheName);
      } catch {
        // Cache retirement is best-effort after the durable pointer is promoted.
      }
    }
  }
}


async function hashBytes(bytes, crypto = globalThis.crypto) {
  if (!crypto?.subtle?.digest) throw new Error("SHA-256 verification is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}


async function cacheIsComplete(env, releaseId, manifest) {
  if (!releaseId || !manifest) return false;
  let validated;
  try {
    validated = validateReleaseManifest(manifest, { appVersion: env.appVersion });
  } catch {
    return false;
  }
  const cache = await env.caches.open(`${RELEASE_CACHE_PREFIX}${releaseId}`);
  const marker = await cache.match(releaseUrl(env, releaseId, COMPLETE_PATH));
  if (!marker) return false;
  const cachedManifestResponse = await cache.match(releaseUrl(env, releaseId, MANIFEST_PATH));
  if (!cachedManifestResponse) return false;
  try {
    const cachedManifest = validateReleaseManifest(await cachedManifestResponse.json(), {
      appVersion: env.appVersion,
    });
    if (JSON.stringify(cachedManifest) !== JSON.stringify(validated)) return false;
  } catch {
    return false;
  }
  for (const file of validated.files) {
    if (!await cache.match(releaseUrl(env, releaseId, file.path))) return false;
  }
  return true;
}


function assertStageExpectations(metadata, expectations) {
  for (const [field, actual] of [
    ["expectedCurrentReleaseId", metadata.currentReleaseId],
    ["expectedGeneration", metadata.generation],
  ]) {
    if (Object.hasOwn(expectations, field) && expectations[field] !== actual) {
      throw new Error(`Stage expectation failed for ${field}.`);
    }
  }
}


export async function stageRelease(manifest, environment = {}, expectations = {}) {
  const env = runtime(environment);
  const validated = validateReleaseManifest(manifest, { appVersion: env.appVersion });
  let metadata = await readMetadata(env);
  if (validated.releaseId === metadata.currentReleaseId) {
    if (!await cacheIsComplete(env, validated.releaseId, validated)) {
      throw new Error("Active release cache is incomplete; refusing destructive restage.");
    }
    return { ...metadata, offlineReady: true };
  }
  assertStageExpectations(metadata, expectations);
  metadata = await readMetadata(env);
  if (validated.releaseId === metadata.currentReleaseId) {
    if (!await cacheIsComplete(env, validated.releaseId, validated)) {
      throw new Error("Active release cache is incomplete; refusing destructive restage.");
    }
    return { ...metadata, offlineReady: true };
  }
  assertStageExpectations(metadata, expectations);
  if (validated.releaseId === metadata.previousReleaseId) {
    if (!await cacheIsComplete(env, validated.releaseId, validated)) {
      throw new Error("Previous release manifest differs; refusing destructive restage.");
    }
    const latest = await readMetadata(env);
    if (validated.releaseId === latest.currentReleaseId) {
      if (!await cacheIsComplete(env, validated.releaseId, validated)) {
        throw new Error("Active release cache is incomplete; refusing previous-cache reuse.");
      }
      return { ...latest, offlineReady: true };
    }
    assertStageExpectations(latest, expectations);
    if (validated.releaseId === latest.previousReleaseId
      && await cacheIsComplete(env, validated.releaseId, validated)) {
      const staged = {
        ...latest,
        generation: latest.generation + (
          latest.stagedReleaseId === validated.releaseId ? 0 : 1
        ),
        stagedReleaseId: validated.releaseId,
        stagedManifest: validated,
      };
      await writeMetadata(env, staged);
      return { ...staged, offlineReady: Boolean(latest.currentReleaseId) };
    }
  }
  const cacheName = `${RELEASE_CACHE_PREFIX}${validated.releaseId}`;
  await env.caches.delete(cacheName);
  const cache = await env.caches.open(cacheName);
  try {
    const manifestBytes = new TextEncoder().encode(JSON.stringify(validated));
    const manifestSha256 = await hashBytes(manifestBytes, env.crypto);
    await cache.put(
      releaseUrl(env, validated.releaseId, MANIFEST_PATH),
      new Response(manifestBytes, {
        headers: { "content-type": "application/json", "x-content-sha256": manifestSha256 },
      }),
    );
    for (const file of validated.files) {
      const url = releaseUrl(env, validated.releaseId, file.path);
      let response;
      try {
        response = await env.fetch(url, { cache: "no-store", credentials: "same-origin" });
      } catch (error) {
        throw new Error(`Network fetch failed for ${file.path}: ${error?.message ?? error}`);
      }
      if (!response?.ok) throw new Error(`Missing release file ${file.path} (${response?.status ?? "unknown"}).`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== file.bytes) throw new Error(`Byte count mismatch for ${file.path}.`);
      const actualHash = await hashBytes(bytes, env.crypto);
      if (actualHash !== file.sha256) throw new Error(`SHA-256 hash mismatch for ${file.path}.`);
      await cache.put(url, new Response(bytes, {
        headers: { "content-type": "application/json", "x-content-sha256": actualHash },
      }));
    }
    const marker = { releaseId: validated.releaseId, fileCount: validated.files.length, manifestSha256 };
    await cache.put(
      releaseUrl(env, validated.releaseId, COMPLETE_PATH),
      new Response(JSON.stringify(marker), { headers: { "content-type": "application/json" } }),
    );
    const latest = await readMetadata(env);
    if (validated.releaseId === latest.currentReleaseId) {
      if (!await cacheIsComplete(env, validated.releaseId, validated)) {
        throw new Error("Active release cache is incomplete after staging.");
      }
      return { ...latest, offlineReady: true };
    }
    assertStageExpectations(latest, expectations);
    const staged = {
      ...latest,
      generation: latest.generation + (
        latest.stagedReleaseId === validated.releaseId ? 0 : 1
      ),
      stagedReleaseId: validated.releaseId,
      stagedManifest: validated,
    };
    await writeMetadata(env, staged);
    return { ...staged, offlineReady: Boolean(latest.currentReleaseId) };
  } catch (error) {
    const latest = await readMetadata(env);
    if (latest.currentReleaseId !== validated.releaseId) {
      await env.caches.delete(cacheName);
    }
    throw error;
  }
}


export async function activateRelease(releaseId, environment = {}) {
  const env = runtime(environment);
  const metadata = await readMetadata(env);
  if (metadata.currentReleaseId === releaseId) {
    if (!metadata.currentManifest
      || !await cacheIsComplete(env, releaseId, metadata.currentManifest)) {
      throw new Error("Active release cache is incomplete; refusing idempotent activation.");
    }
    return { ...await releaseStatus(env), activationChanged: false };
  }
  if (metadata.stagedReleaseId !== releaseId || !metadata.stagedManifest) {
    throw new Error("Release is not fully staged and cannot be activated.");
  }
  if (!await cacheIsComplete(env, releaseId, metadata.stagedManifest)) {
    throw new Error("Staged release cache is incomplete and cannot be activated.");
  }
  const promoted = {
    ...metadata,
    generation: metadata.generation + 1,
    currentReleaseId: releaseId,
    currentManifest: metadata.stagedManifest,
    previousReleaseId: metadata.currentReleaseId,
    previousManifest: metadata.currentManifest,
    stagedReleaseId: null,
    stagedManifest: null,
  };
  await writeMetadata(env, promoted);
  await retireReleaseCaches(env, [promoted.currentReleaseId, promoted.previousReleaseId]);
  return { ...await releaseStatus(env), activationChanged: true };
}


export async function rollbackRelease(environment = {}, expectations = {}) {
  const env = runtime(environment);
  const metadata = await readMetadata(env);
  for (const [field, actual] of [
    ["expectedCurrentReleaseId", metadata.currentReleaseId],
    ["expectedPreviousReleaseId", metadata.previousReleaseId],
    ["expectedGeneration", metadata.generation],
  ]) {
    if (Object.hasOwn(expectations, field) && expectations[field] !== actual) {
      throw new Error(`Rollback expectation failed for ${field}.`);
    }
  }
  if (!metadata.previousReleaseId || !metadata.previousManifest) {
    throw new Error("No previous validated release is available for rollback.");
  }
  if (!await cacheIsComplete(env, metadata.previousReleaseId, metadata.previousManifest)) {
    throw new Error("Previous release cache is incomplete; rollback was not applied.");
  }
  const rolledBack = {
    ...metadata,
    generation: metadata.generation + 1,
    currentReleaseId: metadata.previousReleaseId,
    currentManifest: metadata.previousManifest,
    previousReleaseId: metadata.currentReleaseId,
    previousManifest: metadata.currentManifest,
    stagedReleaseId: null,
    stagedManifest: null,
  };
  await writeMetadata(env, rolledBack);
  return releaseStatus(env);
}


export async function releaseStatus(environment = {}) {
  const env = runtime(environment);
  const metadata = await readMetadata(env);
  const offlineReady = await cacheIsComplete(
    env, metadata.currentReleaseId, metadata.currentManifest,
  );
  return {
    currentReleaseId: metadata.currentReleaseId,
    previousReleaseId: metadata.previousReleaseId,
    stagedReleaseId: metadata.stagedReleaseId,
    manifest: metadata.currentManifest,
    offlineReady,
    generation: metadata.generation,
  };
}


export async function dispatchReleaseCommand(message, environment = {}) {
  if (!message || typeof message.type !== "string") throw new TypeError("Invalid service-worker command.");
  if (message.type === "STAGE_RELEASE") return stageRelease(message.manifest, environment, message);
  if (message.type === "ACTIVATE_RELEASE") return activateRelease(message.releaseId, environment);
  if (message.type === "ROLLBACK_RELEASE") return rollbackRelease(environment, message);
  if (message.type === "RELEASE_STATUS") return releaseStatus(environment);
  throw new TypeError(`Unsupported service-worker command ${message.type}.`);
}


export function createQueuedReleaseDispatcher(dispatch = dispatchReleaseCommand) {
  let pending = Promise.resolve();
  return (message, environment = {}) => {
    const result = pending.then(() => dispatch(message, environment));
    pending = result.catch(() => undefined);
    return result;
  };
}


async function installShell(environment = {}) {
  const env = runtime(environment);
  const cache = await env.caches.open(SHELL_CACHE);
  await cache.addAll(SHELL_FILES);
}


export async function cleanupObsoleteShellCaches(environment = {}) {
  const env = runtime(environment);
  let cacheNames;
  try {
    cacheNames = await env.caches.keys();
  } catch {
    return [];
  }
  const removed = [];
  for (const cacheName of cacheNames) {
    if (cacheName.startsWith("pogo-shell-") && cacheName !== SHELL_CACHE) {
      try {
        if (await env.caches.delete(cacheName)) removed.push(cacheName);
      } catch {
        // Best-effort cleanup must not strand the newly installed worker.
      }
    }
  }
  return removed;
}


export async function fetchWithinWorker(request, environment = {}) {
  const env = runtime(environment);
  const url = new URL(request.url);
  const scope = new URL(env.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return env.fetch(request);
  if (url.pathname === `${scope.pathname}releases/current.json`) {
    return env.fetch(request, { cache: "no-store" });
  }
  if (request.mode === "navigate") {
    const shell = await env.caches.open(SHELL_CACHE);
    try {
      const response = await env.fetch(request, { cache: "no-store" });
      if (response?.ok) return response;
    } catch {
      // Offline navigation falls back to the verified shell below.
    }
    return await shell.match(scopedUrl(env.scope, "index.html"))
      ?? new Response("Offline shell unavailable.", { status: 503 });
  }
  const status = await releaseStatus(env);
  if (status.currentReleaseId) {
    const prefix = `${scope.pathname}releases/${status.currentReleaseId}/`;
    if (url.pathname.startsWith(prefix)) {
      const release = await env.caches.open(`${RELEASE_CACHE_PREFIX}${status.currentReleaseId}`);
      return await release.match(request) ?? new Response("Active release file unavailable.", { status: 503 });
    }
  }
  const shell = await env.caches.open(SHELL_CACHE);
  const shellUrls = new Set(SHELL_FILES.map((path) => scopedUrl(env.scope, path)));
  if (!shellUrls.has(url.href)) return env.fetch(request);
  try {
    const response = await env.fetch(request, { cache: "no-store" });
    if (response?.ok) return response;
  } catch {
    // An installed shell remains available for offline use.
  }
  return await shell.match(request)
    ?? new Response("Offline shell asset unavailable.", { status: 503 });
}


export async function refreshWindowClients(environment = {}) {
  const scope = new URL(environment.scope ?? globalThis.registration?.scope).href;
  const clients = environment.clients ?? globalThis.clients;
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (typeof client?.url !== "string" || !client.url.startsWith(scope)) continue;
    if (typeof client.navigate === "function") await client.navigate(client.url);
  }
}


export async function activateShell(environment = {}) {
  const clients = environment.clients ?? globalThis.clients;
  const removed = await cleanupObsoleteShellCaches(environment);
  await clients.claim();
  if (removed.length) await refreshWindowClients({ ...environment, clients });
  return removed;
}


const worker = typeof self !== "undefined" && "registration" in self ? self : null;
if (worker) {
  const queuedReleaseCommand = createQueuedReleaseDispatcher();
  worker.addEventListener("install", (event) => {
    // No skipWaiting: an auto-activated worker purges the previous shell
    // caches out from under still-open pages (2026-07-22 stranded-client
    // incident). The new worker waits until the last old-shell page closes.
    event.waitUntil(installShell());
  });
  worker.addEventListener("activate", (event) => {
    event.waitUntil(activateShell());
  });
  worker.addEventListener("message", (event) => {
    const port = event.ports?.[0];
    event.waitUntil(queuedReleaseCommand(event.data).then(
      (result) => port?.postMessage({ ok: true, result }),
      (error) => port?.postMessage({ ok: false, error: String(error?.message ?? error) }),
    ));
  });
  worker.addEventListener("fetch", (event) => {
    if (event.request.method === "GET") event.respondWith(fetchWithinWorker(event.request));
  });
}
