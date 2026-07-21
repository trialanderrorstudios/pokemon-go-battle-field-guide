import { APP_VERSION, validateReleaseManifest } from "./src/release-manager.js";

export const SHELL_CACHE = `pogo-shell-v${APP_VERSION}-r4`;
export const RELEASE_CACHE_PREFIX = "pogo-release-";
export const METADATA_CACHE = "pogo-release-metadata";

const METADATA_PATH = "__field-guide-release-metadata__.json";
const COMPLETE_PATH = "__verified-release__.json";
const MANIFEST_PATH = "release-manifest.json";
const SHELL_FILES = Object.freeze([
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/app.css",
  "./icons/field-guide.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./src/app.js",
  "./src/placement.js",
  "./src/raid-target.js",
  "./src/release-manager.js",
  "./src/router.js",
  "./src/search.js",
  "./src/storage.js",
  "./src/views/gyms.js",
  "./src/views/home.js",
  "./src/views/more.js",
  "./src/views/pvp.js",
  "./src/views/raids.js",
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
    return { ...emptyMetadata(), ...value };
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
  for (const file of validated.files) {
    if (!await cache.match(releaseUrl(env, releaseId, file.path))) return false;
  }
  return Boolean(await cache.match(releaseUrl(env, releaseId, MANIFEST_PATH)));
}


export async function stageRelease(manifest, environment = {}) {
  const env = runtime(environment);
  const validated = validateReleaseManifest(manifest, { appVersion: env.appVersion });
  const metadata = await readMetadata(env);
  if (validated.releaseId === metadata.currentReleaseId) {
    if (!await cacheIsComplete(env, validated.releaseId, validated)) {
      throw new Error("Active release cache is incomplete; refusing destructive restage.");
    }
    return { ...metadata, offlineReady: true };
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
    const staged = {
      ...metadata,
      stagedReleaseId: validated.releaseId,
      stagedManifest: validated,
    };
    await writeMetadata(env, staged);
    return { ...staged, offlineReady: Boolean(metadata.currentReleaseId) };
  } catch (error) {
    await env.caches.delete(cacheName);
    throw error;
  }
}


export async function activateRelease(releaseId, environment = {}) {
  const env = runtime(environment);
  const metadata = await readMetadata(env);
  if (metadata.stagedReleaseId !== releaseId || !metadata.stagedManifest) {
    throw new Error("Release is not fully staged and cannot be activated.");
  }
  if (!await cacheIsComplete(env, releaseId, metadata.stagedManifest)) {
    throw new Error("Staged release cache is incomplete and cannot be activated.");
  }
  const promoted = {
    ...metadata,
    currentReleaseId: releaseId,
    currentManifest: metadata.stagedManifest,
    previousReleaseId: metadata.currentReleaseId,
    previousManifest: metadata.currentManifest,
    stagedReleaseId: null,
    stagedManifest: null,
  };
  await writeMetadata(env, promoted);
  await retireReleaseCaches(env, [promoted.currentReleaseId, promoted.previousReleaseId]);
  return releaseStatus(env);
}


export async function rollbackRelease(environment = {}) {
  const env = runtime(environment);
  const metadata = await readMetadata(env);
  if (!metadata.previousReleaseId || !metadata.previousManifest) {
    throw new Error("No previous validated release is available for rollback.");
  }
  if (!await cacheIsComplete(env, metadata.previousReleaseId, metadata.previousManifest)) {
    throw new Error("Previous release cache is incomplete; rollback was not applied.");
  }
  const rolledBack = {
    ...metadata,
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
  };
}


export async function dispatchReleaseCommand(message, environment = {}) {
  if (!message || typeof message.type !== "string") throw new TypeError("Invalid service-worker command.");
  if (message.type === "STAGE_RELEASE") return stageRelease(message.manifest, environment);
  if (message.type === "ACTIVATE_RELEASE") return activateRelease(message.releaseId, environment);
  if (message.type === "ROLLBACK_RELEASE") return rollbackRelease(environment);
  if (message.type === "RELEASE_STATUS") return releaseStatus(environment);
  throw new TypeError(`Unsupported service-worker command ${message.type}.`);
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


async function fetchWithinWorker(request, environment = {}) {
  const env = runtime(environment);
  const url = new URL(request.url);
  const scope = new URL(env.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return env.fetch(request);
  if (url.pathname === `${scope.pathname}releases/current.json`) {
    return env.fetch(request, { cache: "no-store" });
  }
  if (request.mode === "navigate") {
    const shell = await env.caches.open(SHELL_CACHE);
    return await shell.match(scopedUrl(env.scope, "index.html")) ?? env.fetch(request);
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
  return await shell.match(request) ?? env.fetch(request);
}


const worker = typeof self !== "undefined" && "registration" in self ? self : null;
if (worker) {
  worker.addEventListener("install", (event) => {
    event.waitUntil(installShell().then(() => worker.skipWaiting()));
  });
  worker.addEventListener("activate", (event) => {
    event.waitUntil(cleanupObsoleteShellCaches().then(() => worker.clients.claim()));
  });
  worker.addEventListener("message", (event) => {
    const port = event.ports?.[0];
    event.waitUntil(dispatchReleaseCommand(event.data).then(
      (result) => port?.postMessage({ ok: true, result }),
      (error) => port?.postMessage({ ok: false, error: String(error?.message ?? error) }),
    ));
  });
  worker.addEventListener("fetch", (event) => {
    if (event.request.method === "GET") event.respondWith(fetchWithinWorker(event.request));
  });
}
