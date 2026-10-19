// Release and service-worker lifecycle: the single owner of what version of
// the data and the shell this device is running.
//
// Fetches releases/current.json, validates a release manifest (hashes, schema,
// required chunk paths), asks the service worker to stage a release's chunks
// into a cache keyed by its release id, then promotes it atomically. Also owns
// APP_SHELL_REVISION, which keys the shell cache — bumping it requires a
// shell-changelog.js entry in the same change (enforced by
// tests/web/pvp-more.test.mjs).
//
// This is the most load-bearing file in the app and the least forgiving to
// get wrong: a mistake here is a white screen or a permanently stale cache for
// every installed user, and the WebKit failure modes it works around (see the
// note on time-bounding every worker round trip, below) do not reproduce in
// Chromium dev. Every service-worker message is time-bounded rather than
// try/caught, because registration RESOLVES under WebKit with workers blocked
// and the hang lands later on serviceWorker.ready.
export const APP_VERSION = 1;
export const APP_SHELL_REVISION = "r206";
export const MANIFEST_SCHEMA_VERSION = 1;
export const DATA_SCHEMA_VERSION = 1;
export const RELEASE_STATES = Object.freeze([
  "uninitialized",
  "caching",
  "ready",
  "update_available",
  "updating",
  "failed",
  "offline",
]);

// Fable final review (wave-s-speed, HIGH): first-install fallback no longer
// gates on "was this a timeout" (promote()'s STAGE_RELEASE/ACTIVATE_RELEASE
// can fail plenty of other honest ways that still deserve the same
// network-render fallback — see isIntegrityFailure below, right where the
// decision is actually made). Nothing checks an error's TYPE for this
// anymore, so the typed ServiceWorkerTimeoutError class this comment used
// to justify was removed with it; #handshake/defaultSendMessage's timeouts
// are plain Errors again.

const RELEASE_ID = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{12}$/;
const FILE_PATH = /^[a-z0-9][a-z0-9.-]*\.json$/;
const SHA256 = /^[0-9a-f]{64}$/;


function plainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}


function compatibleInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`Unsupported ${name}.`);
}


export function validateReleaseManifest(manifest, { appVersion = APP_VERSION } = {}) {
  if (!plainObject(manifest)) throw new TypeError("Unsupported release manifest object.");
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new TypeError("Unsupported manifest schemaVersion; no compatible reader is available.");
  }
  if (manifest.dataSchemaVersion !== DATA_SCHEMA_VERSION) {
    throw new TypeError("Unsupported dataSchemaVersion; no compatible reader is available.");
  }
  compatibleInteger(manifest.appVersion, "manifest appVersion");
  compatibleInteger(manifest.minimumAppVersion, "minimumAppVersion");
  if (manifest.minimumAppVersion > appVersion) {
    throw new TypeError("Release requires an incompatible app version.");
  }
  if (typeof manifest.releaseId !== "string" || !RELEASE_ID.test(manifest.releaseId)) {
    throw new TypeError("Unsupported releaseId.");
  }
  if (typeof manifest.dataCutoff !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.dataCutoff)) {
    throw new TypeError("Unsupported data cutoff.");
  }
  const parsedCutoff = new Date(`${manifest.dataCutoff}T00:00:00Z`);
  if (Number.isNaN(parsedCutoff.valueOf())
    || parsedCutoff.toISOString().slice(0, 10) !== manifest.dataCutoff) {
    throw new TypeError("Unsupported data cutoff calendar date.");
  }
  if (!manifest.releaseId.startsWith(`${manifest.dataCutoff}-`)) {
    throw new TypeError("Release ID and data cutoff are inconsistent.");
  }
  if (!plainObject(manifest.methodologyVersions)
    || Object.keys(manifest.methodologyVersions).length === 0
    || Object.entries(manifest.methodologyVersions).some(([name, version]) => (
      typeof name !== "string" || !name.trim()
      || typeof version !== "string" || !version.trim()
    ))) {
    throw new TypeError("Unsupported methodology versions.");
  }
  if (!Array.isArray(manifest.releaseNotes) || manifest.releaseNotes.some((note) => typeof note !== "string")) {
    throw new TypeError("Unsupported release notes.");
  }
  if (manifest.notes !== undefined && (typeof manifest.notes !== "string" || !manifest.notes.trim())) {
    throw new TypeError("Unsupported release notes summary.");
  }
  for (const field of ["doClaim", "doNotClaim"]) {
    if (typeof manifest[field] !== "string" || !manifest[field].trim()) {
      throw new TypeError(`Unsupported ${field} release claim.`);
    }
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new TypeError("Release manifest files must be a nonempty array.");
  }
  const seen = new Set();
  for (const file of manifest.files) {
    if (!plainObject(file) || typeof file.path !== "string" || !FILE_PATH.test(file.path)
      || file.path.includes("..") || file.path.includes("%") || file.path.includes("\\")) {
      throw new TypeError("Release file path must be a same-origin relative JSON filename.");
    }
    if (seen.has(file.path)) throw new TypeError(`Duplicate release file path: ${file.path}.`);
    seen.add(file.path);
    if (!Number.isInteger(file.bytes) || file.bytes < 1) throw new TypeError(`Unsupported bytes for ${file.path}.`);
    if (typeof file.sha256 !== "string" || !SHA256.test(file.sha256)) {
      throw new TypeError(`Unsupported SHA-256 for ${file.path}.`);
    }
  }
  // raids.json split into raids-regular.json + raids-shadow.json (pwa.py's
  // SPLIT_KEY_OWNERS). This list must track pwa.py's chunk names: a manifest
  // missing any of these fails validation and the release never installs —
  // the app then boots to the static shell (2026-08-09 review caught exactly
  // that: the split landed in pwa.py but not here).
  for (const required of ["core.json", "extras.json", "gyms.json", "pvp.json", "raid-targets.json", "raids-regular.json", "raids-shadow.json"]) {
    if (!seen.has(required)) throw new TypeError(`Release is missing required file path ${required}.`);
  }
  return structuredClone(manifest);
}


// Shared with sw.js: the SW uses this to verify bytes before staging into its
// cache; loadReleaseFiles below uses it to verify bytes actually received
// over the wire, since the SW only serves cache-only (already-verified)
// responses for the CURRENT release id — a request for any other release id
// (mid-update window, or a second tab that hasn't heard about an update yet)
// falls through the SW to a raw, unverified network fetch.
export async function hashBytes(bytes, crypto = globalThis.crypto) {
  if (!crypto?.subtle?.digest) throw new Error("SHA-256 verification is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}


function resolveBase(baseUrl) {
  const anchor = globalThis.location?.href;
  const url = anchor ? new URL(baseUrl, anchor) : new URL(baseUrl);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
  return url;
}


function releaseFileUrl(baseUrl, releaseId, path) {
  const base = resolveBase(baseUrl);
  const url = new URL(`releases/${releaseId}/${path}`, base);
  const expectedPrefix = `${base.pathname}releases/${releaseId}/`;
  if (url.origin !== base.origin || !url.pathname.startsWith(expectedPrefix)) {
    throw new TypeError("Release URL escaped its same-origin immutable path.");
  }
  return url.href;
}


// Long enough that a slow-but-working worker still wins the race on a cold
// device; short enough that a browser which will never activate one does not
// hold the whole app hostage.
// Exported so tests can drive fake timers by the real bound instead of a
// hand-copied magic number (tests/web/release-manager.test.mjs, P7).
export const SERVICE_WORKER_HANDSHAKE_MS = 5000;


async function defaultRegister() {
  if (!globalThis.navigator?.serviceWorker) throw new Error("Service workers are unavailable.");
  return globalThis.navigator.serviceWorker.register("./sw.js", { scope: "./", type: "module" });
}


// Fable re-review (wave-s-speed, P7 follow-up): these are two genuinely
// different failure modes and must not share one bound. navigator.
// serviceWorker.ready either resolves almost immediately or is truly dead
// (no controller ever coming) — that has to fail fast, mirroring
// SERVICE_WORKER_HANDSHAKE_MS. The RESPONSE to a specific message is not
// always fast: STAGE_RELEASE legitimately fetches+hashes an entire release
// (~650KB) over the network, which can take well over 15s on a slow
// connection — exactly what P1's watchdog grace extension exists to
// tolerate. An earlier version of this fix wrapped the WHOLE sendMessage()
// call (including this function's old, undifferentiated 15s response
// timer) in one external 5s #handshake, which cut STAGE_RELEASE off before
// a legitimately slow first install ever finished — the SW kept staging in
// the background, but ACTIVATE_RELEASE was never sent, so the next launch
// deleted the half-staged cache and started over: slow phones could never
// actually get offline, and P1's 30s grace ceiling never got a chance to
// matter. responseTimeoutMs lets a caller ask for a longer response
// allowance per message type without touching the ready bound.
const SW_READY_TIMEOUT_MS = SERVICE_WORKER_HANDSHAKE_MS;
const SW_RESPONSE_TIMEOUT_MS = 15000;
// Mirrors boot-watchdog.js's MAX_GRACE_MS: the longest a legitimately slow
// first-install stage (fetch+hash an entire release over a bad connection)
// should need before it's treated as truly dead rather than just busy.
// Exported for the same reason SERVICE_WORKER_HANDSHAKE_MS is: tests drive
// fake timers by the real bound (tests/web/release-manager.test.mjs, P7).
export const STAGE_RELEASE_TIMEOUT_MS = 30000;

async function defaultSendMessage(message, { responseTimeoutMs = SW_RESPONSE_TIMEOUT_MS } = {}) {
  if (!globalThis.navigator?.serviceWorker) throw new Error("Service workers are unavailable.");
  let readyTimer;
  let registration;
  try {
    registration = await Promise.race([
      globalThis.navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        readyTimer = setTimeout(
          () => reject(new Error("Service worker never activated a controller.")),
          SW_READY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(readyTimer);
  }
  const worker = globalThis.navigator.serviceWorker.controller ?? registration.active;
  if (!worker) throw new Error("No active service worker is available.");
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(
      () => reject(new Error("Service worker response timed out.")),
      responseTimeoutMs,
    );
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer);
      if (data?.ok) resolve(data.result);
      else reject(new Error(data?.error ?? "Service worker command failed."));
    };
    worker.postMessage(message, [channel.port2]);
  });
}


function stateFromStatus(status = {}) {
  return {
    currentReleaseId: status.currentReleaseId ?? null,
    previousReleaseId: status.previousReleaseId ?? null,
    offlineReady: status.offlineReady === true,
    generation: Number.isInteger(status.generation) && status.generation >= 0
      ? status.generation
      : 0,
  };
}


function candidateIsOlder(candidate, activeManifest, currentReleaseId) {
  const activeCutoff = activeManifest?.dataCutoff
    ?? (/^(\d{4}-\d{2}-\d{2})-/.exec(currentReleaseId ?? "")?.[1] ?? null);
  return activeCutoff !== null && candidate.dataCutoff < activeCutoff;
}

// Fable final review (wave-s-speed, HIGH): the one case where falling back
// to an unverified plain-fetch render is NOT safe — the bytes themselves
// don't match what the manifest promised (sha256) or how big they should be
// (byteLength). Everything else that can fail a first install (an SW
// message that never answers, ACTIVATE_RELEASE rejecting because the
// Cache API accepted every write but never actually persisted them — a
// real, reproduced WebKit-persistent-profile shape, same category as
// Safari private mode / quota exhaustion / storage disabled outright, a
// plain network error) means the DEVICE can't do the offline install, not
// that the DATA is suspect — those get the network fallback instead of a
// dead placeholder. Both phrases are SW-generated (stageRelease/
// loadReleaseFiles) and specific to the integrity-check code paths only —
// never something a status()/ROLLBACK_RELEASE reconciliation step would
// produce — so a plain substring check here carries none of the
// compound-message risk a "was this a timeout" check used to.
function isIntegrityFailure(message) {
  return typeof message === "string"
    && (message.includes("hash mismatch") || message.includes("Byte count mismatch"));
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Accessing the property itself can throw in some locked-down contexts.
    return null;
  }
}

// Fable LOW polish: a first-install failure that fell back to a live
// network render (not an integrity problem — see isIntegrityFailure) means
// THIS device/browser can't do the offline install, which won't fix itself
// between one launch and the next. Exported so app.js's retry-boot button
// can clear it (an explicit retry must bypass the cooldown, not reload into
// the same skip).
export const OFFLINE_INSTALL_RETRY_GUARD_KEY = "pogo-offline-install-failed-at";
const OFFLINE_INSTALL_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function readGuardTimestamp(storage) {
  try {
    return Number(storage?.getItem?.(OFFLINE_INSTALL_RETRY_GUARD_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeGuardTimestamp(storage) {
  try {
    storage?.setItem?.(OFFLINE_INSTALL_RETRY_GUARD_KEY, String(Date.now()));
  } catch {
    // Private mode / storage disabled — nothing to memoize, every launch
    // just retries, same as before this fix.
  }
}

export class ReleaseManager {
  static STATES = RELEASE_STATES;

  constructor({
    appVersion = APP_VERSION,
    baseUrl = "./",
    fetchImpl = globalThis.fetch?.bind(globalThis),
    register = defaultRegister,
    sendMessage = defaultSendMessage,
    // Fable LOW polish: only ever used for the offline-install retry guard
    // below — a browser whose Cache API doesn't work isn't going to start
    // working again a few seconds later, so retrying the full STAGE_RELEASE
    // download every launch wastes bandwidth and time for no benefit.
    storage = defaultStorage(),
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.appVersion = appVersion;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.register = register;
    this.sendMessage = sendMessage;
    this.storage = storage;
    this.listeners = new Set();
    this._state = Object.freeze({
      status: "uninitialized", currentReleaseId: null, previousReleaseId: null,
      offlineReady: false, generation: 0, candidate: null, manifest: null, data: null, error: null,
    });
  }

  get state() { return this._state; }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Release listener must be a function.");
    this.listeners.add(listener);
    listener(this._state);
    return () => this.listeners.delete(listener);
  }

  transition(status, changes = {}) {
    if (!RELEASE_STATES.includes(status)) throw new TypeError(`Unknown release state ${status}.`);
    this._state = Object.freeze({ ...this._state, ...changes, status });
    for (const listener of this.listeners) listener(this._state);
    return this._state;
  }

  async fetchCurrentManifest() {
    const base = resolveBase(this.baseUrl);
    const url = new URL("releases/current.json", base);
    if (url.origin !== base.origin) throw new TypeError("Manifest URL must be same-origin.");
    const response = await this.fetch(url.href, { cache: "no-store", credentials: "same-origin" });
    if (!response?.ok) throw new Error(`Current release manifest fetch failed (${response?.status ?? "unknown"}).`);
    return validateReleaseManifest(await response.json(), { appVersion: this.appVersion });
  }

  // Loads only the given release file paths (already-verified by the SW's
  // atomic staging, so this is a plain cached fetch + parse) and merges their
  // top-level fields into one object. Lets a caller fetch core.json alone for
  // fast startup, then pull in raids/pvp/gyms/extras lazily per route.
  async loadReleaseFiles(manifest, paths) {
    const validated = validateReleaseManifest(manifest, { appVersion: this.appVersion });
    const wanted = new Set(paths);
    const files = [...validated.files]
      .filter((file) => wanted.has(file.path))
      .sort((left, right) => {
        if (left.path === "core.json") return -1;
        if (right.path === "core.json") return 1;
        return left.path.localeCompare(right.path);
      });
    const data = {};
    for (const file of files) {
      const response = await this.fetch(releaseFileUrl(this.baseUrl, validated.releaseId, file.path), {
        cache: "no-store", credentials: "same-origin",
      });
      if (!response?.ok) throw new Error(`Active release file ${file.path} is unavailable.`);
      const bytes = await response.arrayBuffer();
      // The SW only serves verified cache-only responses for the CURRENT
      // release id; any other release id (a stale request mid-update, or a
      // second tab that hasn't heard of an update) falls through to a raw
      // network fetch with no hash check. Verify here so unverified bytes
      // never merge into `data`, regardless of which path served them.
      const actualHash = await hashBytes(bytes);
      if (actualHash !== file.sha256) throw new Error(`SHA-256 hash mismatch for ${file.path}.`);
      const chunk = JSON.parse(new TextDecoder().decode(bytes));
      if (!plainObject(chunk)) throw new TypeError(`Active release file ${file.path} is not an object.`);
      Object.assign(data, chunk);
    }
    return data;
  }

  async loadRelease(manifest) {
    const validated = validateReleaseManifest(manifest, { appVersion: this.appVersion });
    return this.loadReleaseFiles(validated, validated.files.map((file) => file.path));
  }

  async status() {
    // Fable review (wave-s-speed, P7): bounded the same way register()/
    // status() already were at boot (#handshake, below) — status() is
    // called from many places (promote(), reconcilePromotionFailure(),
    // rollback()) and an unbounded one left those paths exposed to the
    // exact hang this fixes elsewhere: defaultSendMessage awaits
    // navigator.serviceWorker.ready before its own internal response timer
    // even starts, and that await can itself never resolve.
    return this.#handshake(this.sendMessage({ type: "RELEASE_STATUS" }), "status request");
  }

  async reconcilePromotionFailure(
    candidate,
    previousReleaseId,
    promotionError,
    {
      activationReceipt = null,
      fallbackStatus = "update_available",
      previousData = null,
      previousGeneration = 0,
      previousManifest = null,
    } = {},
  ) {
    const failedState = (durableStatus, reconciliationError = null) => {
      const reconciled = durableStatus ? stateFromStatus(durableStatus) : {
        currentReleaseId: null,
        previousReleaseId: null,
        offlineReady: false,
        generation: 0,
      };
      const manifest = durableStatus?.manifest
        ?? (reconciled.currentReleaseId === candidate.releaseId ? candidate : null);
      const detail = reconciliationError
        ? `; durable release reconciliation failed: ${reconciliationError}`
        : "";
      return this.transition("failed", {
        ...reconciled,
        manifest,
        data: null,
        candidate,
        error: `${promotionError}${detail}`,
      });
    };

    let reconciled;
    try {
      reconciled = await this.status();
    } catch (error) {
      return failedState(null, String(error?.message ?? error));
    }

    const immutableCurrentConfirmed = reconciled?.currentReleaseId === previousReleaseId
      && reconciled?.offlineReady === true
      && (
        reconciled?.generation === previousGeneration
        || (
          reconciled?.manifest?.releaseId === previousReleaseId
          && previousManifest?.releaseId === previousReleaseId
        )
      );
    if (immutableCurrentConfirmed) {
      return this.transition(fallbackStatus, {
        ...stateFromStatus(reconciled),
        manifest: previousManifest,
        data: previousData,
        candidate,
        error: promotionError,
      });
    }

    if (previousReleaseId === null
      || reconciled?.currentReleaseId !== candidate.releaseId
      || activationReceipt?.activationChanged !== true) {
      return failedState(reconciled);
    }

    try {
      await this.#handshake(this.sendMessage({
        type: "ROLLBACK_RELEASE",
        expectedCurrentReleaseId: candidate.releaseId,
        expectedPreviousReleaseId: activationReceipt.previousReleaseId,
        expectedGeneration: activationReceipt.generation,
      }), "ROLLBACK_RELEASE");
      const restored = await this.status();
      if (restored?.currentReleaseId === previousReleaseId
        && restored?.offlineReady === true) {
        return this.transition(fallbackStatus, {
          ...stateFromStatus(restored),
          manifest: previousManifest,
          data: previousData,
          candidate,
          error: promotionError,
        });
      }
      return failedState(restored, "conditional rollback restored an unexpected release");
    } catch (error) {
      const reconciliationError = String(error?.message ?? error);
      try {
        return failedState(await this.status(), reconciliationError);
      } catch (statusError) {
        return failedState(
          null,
          `${reconciliationError}; status read failed: ${String(statusError?.message ?? statusError)}`,
        );
      }
    }
  }

  async promote(candidate, { fallbackStatus = "update_available" } = {}) {
    const previousReleaseId = this._state.currentReleaseId;
    const previousGeneration = this._state.generation;
    const previousManifest = this._state.manifest;
    const previousData = this._state.data;
    let activationAttempted = false;
    let activationReceipt = null;
    try {
      // Fable review (wave-s-speed, P7): these two were the one pair of SW
      // round trips in the whole class without a bound — live WebKit
      // testing with a persistent profile found promote() hanging forever
      // on first install (release never reaches offlineReady, router never
      // starts, the static "Preparing your field guide" placeholder never
      // resolves). #handshake is the same bound register()/status() already
      // get at boot. STAGE_RELEASE specifically gets the much longer
      // STAGE_RELEASE_TIMEOUT_MS, not the short default — see
      // defaultSendMessage's responseTimeoutMs comment for why (fetching
      // and hashing an entire release is legitimately slow on bad networks,
      // and the earlier version of this fix cut that off too early).
      await this.#handshake(this.sendMessage({
        type: "STAGE_RELEASE",
        manifest: candidate,
        expectedCurrentReleaseId: previousReleaseId,
        expectedGeneration: previousGeneration,
      }, { responseTimeoutMs: STAGE_RELEASE_TIMEOUT_MS }), "STAGE_RELEASE", STAGE_RELEASE_TIMEOUT_MS);
      activationAttempted = true;
      activationReceipt = await this.#handshake(this.sendMessage({
        type: "ACTIVATE_RELEASE",
        releaseId: candidate.releaseId,
      }), "ACTIVATE_RELEASE");
      if (activationReceipt?.currentReleaseId !== candidate.releaseId
        || activationReceipt?.offlineReady !== true
        || !Number.isInteger(activationReceipt?.generation)
        || activationReceipt.generation < 0) {
        throw new Error("Candidate release was not durably active and offline-ready.");
      }
      // Only core.json (forms/meta/methodology) gates readiness; raids/pvp/
      // gyms/extras load lazily per route once the app is interactive — the
      // SW already staged and hash-verified every file atomically above, so
      // deferring their fetch+parse here changes nothing about offline
      // integrity, only when the JS side bothers to parse them.
      const data = await this.loadReleaseFiles(candidate, ["core.json"]);
      const finalStatus = await this.status();
      if (finalStatus?.currentReleaseId !== candidate.releaseId
        || finalStatus?.offlineReady !== true
        || finalStatus?.generation !== activationReceipt.generation) {
        throw new Error("Candidate release changed while its data was loading.");
      }
      return this.transition("ready", {
        ...stateFromStatus(finalStatus), manifest: candidate, data, candidate: null, error: null,
      });
    } catch (error) {
      const promotionError = String(error?.message ?? error);
      return this.reconcilePromotionFailure(candidate, previousReleaseId, promotionError, {
        activationReceipt: activationAttempted ? activationReceipt : null,
        fallbackStatus,
        previousData,
        previousGeneration,
        previousManifest,
      });
    }
  }

  // Every SW round trip has to be time-bounded, not just try/catch'd.
  // Registration RESOLVES even where workers never activate — measured under
  // WebKit with service workers blocked, register() came back in 0ms — and
  // the hang lands later, on navigator.serviceWorker.ready inside
  // defaultSendMessage, which awaits a controller that is never coming
  // BEFORE that function's own internal 15s response timer even starts. A
  // try/catch around register() therefore catches nothing and the boot
  // still stalls forever, which is exactly what it looked like in the wild:
  // no error, no failed request, just "Preparing your field guide" until
  // the user gives up. Originally wrapped only register()/status() at
  // boot; status() now wraps itself (below) and promote()/
  // reconcilePromotionFailure()/rollback() wrap each of their own SW
  // messages the same way — live WebKit persistent-profile testing found
  // promote()'s STAGE_RELEASE/ACTIVATE_RELEASE hanging forever with
  // exactly this shape (Fable review, wave-s-speed P7).
  // timeoutMs defaults to the short boot/status/activate/rollback bound.
  // promote()'s STAGE_RELEASE passes STAGE_RELEASE_TIMEOUT_MS instead — see
  // the comment on defaultSendMessage's responseTimeoutMs for why that one
  // call needs a much longer allowance.
  async #handshake(work, label = "handshake", timeoutMs = SERVICE_WORKER_HANDSHAKE_MS) {
    let timer;
    try {
      return await Promise.race([
        work,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Service worker ${label} timed out.`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Shared by the no-SW-at-all catch in initialize() and (Fable review,
  // wave-s-speed P7) the first-install SW-timeout fallback below: renders
  // the app from a plain, unverified network fetch instead of leaving the
  // reader on the static boot placeholder forever. `candidate`, if already
  // fetched by the caller, is reused instead of fetched again; `error`
  // becomes the honest, visible notice app.js's offlineLabel() surfaces.
  async #bootFromNetwork(candidate = null, { error = null } = {}) {
    try {
      const resolved = candidate ?? await this.fetchCurrentManifest();
      const data = await this.loadReleaseFiles(resolved, ["core.json"]);
      return this.transition("ready", {
        currentReleaseId: resolved.releaseId,
        previousReleaseId: null,
        offlineReady: false,
        generation: 0,
        manifest: resolved,
        data,
        candidate: null,
        error,
      });
    } catch (fetchError) {
      return this.transition("failed", {
        currentReleaseId: null,
        previousReleaseId: null,
        offlineReady: false,
        generation: 0,
        error: String(fetchError?.message ?? fetchError),
      });
    }
  }

  async initialize() {
    let stored;
    try {
      await this.#handshake(this.register("./sw.js", { scope: "./", type: "module" }));
      // status() bounds its own sendMessage now — no outer wrap needed.
      stored = await this.status();
    } catch {
      // No service worker (iOS Safari Private Browsing disables them
      // outright). Offline caching and the durable STAGE/ACTIVATE state
      // machine both live behind the SW, so neither is available — but a
      // plain fetch of the manifest + core chunk still boots the app.
      // Previously this branch didn't exist: registration failure threw out
      // of initialize(), startFieldGuide caught it, releaseState stayed
      // null, and the "Preparing your field guide" fallback never resolved
      // (reproduced with Playwright serviceWorkers:"block": 79 DOM nodes,
      // zero console errors, zero failed requests — a silent boot failure).
      return this.#bootFromNetwork();
    }
    // Hoisted above the try (not `const`/`let` scoped inside it) so the
    // catch below can still see whatever the SW already confirmed and
    // whatever this call already managed to load, instead of only seeing
    // `this._state` — which is still the constructor default on a normal
    // boot. See the 2026-08-11 wave-2a failure-ux finding (release-manager.js
    // catch, was line 545): a transient core.json re-fetch/re-verify glitch
    // here used to discard a fully valid, durable, offline-ready release and
    // drop straight to status:"failed" with currentReleaseId:null, even
    // though the SW's own cache was intact the whole time.
    let durable = null;
    let activeManifest = null;
    let activeData = null;
    try {
      durable = stateFromStatus(stored);
      activeManifest = stored?.manifest ?? null;
      if (activeManifest) {
        activeManifest = validateReleaseManifest(activeManifest, { appVersion: this.appVersion });
        // Core-only here too: this runs on every boot with a durable release,
        // not just first install, so it is the hot path for time-to-interactive.
        activeData = await this.loadReleaseFiles(activeManifest, ["core.json"]);
      }

      let candidate;
      try {
        candidate = await this.fetchCurrentManifest();
      } catch (error) {
        if (durable.currentReleaseId && durable.offlineReady) {
          return this.transition("offline", {
            ...durable, manifest: activeManifest, data: activeData, candidate: null,
            error: String(error?.message ?? error),
          });
        }
        return this.transition("failed", { ...durable, error: String(error?.message ?? error) });
      }

      if (!durable.currentReleaseId) {
        // Fable LOW polish: a previous launch already confirmed this
        // device/browser can't complete the offline install (the fallback
        // below fired and wrote this timestamp) — that isn't going to
        // change launch to launch, so skip straight back to the network
        // render instead of re-downloading and re-failing the same
        // STAGE_RELEASE every single visit. app.js's retry-boot button
        // clears this guard explicitly, so a reader who taps "Try again"
        // still gets a real retry, not another skip.
        const recentFailureAt = readGuardTimestamp(this.storage);
        if (recentFailureAt && Date.now() - recentFailureAt < OFFLINE_INSTALL_RETRY_COOLDOWN_MS) {
          return this.#bootFromNetwork(candidate, {
            error: "Offline install previously failed on this device — retrying automatically in 24h, or tap \"Try again\" to retry now.",
          });
        }
        this.transition("caching", { candidate, error: null });
        const promoted = await this.promote(candidate, { fallbackStatus: "failed" });
        // Fable final review (wave-s-speed, HIGH): a first install has
        // nothing durable to protect, so ANY promotion failure that isn't a
        // data-integrity problem (isIntegrityFailure — hash/byte-count
        // mismatch, the one case where the DATA itself is suspect) means
        // this device/browser cannot complete the offline install, not
        // that the release is bad. Render from the network instead of
        // leaving the reader on the static boot placeholder forever — the
        // live-reproduced case this is for: WebKit persistent profiles
        // where the Cache API accepts every write but never actually
        // persists them, so STAGE_RELEASE "succeeds" and ACTIVATE_RELEASE
        // then rejects with "Release is not fully staged" (sw.js) — no
        // timeout anywhere, just a cache that silently doesn't work. Real-
        // world analogs: Safari private mode, quota exhaustion, storage
        // disabled outright. An integrity failure still dead-ends at
        // "failed" with no data — startFieldGuide (app.js) now renders an
        // honest failure+retry UI for exactly that case instead of nothing.
        if (promoted.status === "failed" && !promoted.currentReleaseId && !isIntegrityFailure(promoted.error)) {
          writeGuardTimestamp(this.storage);
          return this.#bootFromNetwork(candidate, {
            error: `Offline install didn't finish (${promoted.error}) — offline mode may be unavailable on this device or browser.`,
          });
        }
        return promoted;
      }

      if (!activeManifest && candidate.releaseId === durable.currentReleaseId) {
        activeManifest = candidate;
        activeData = await this.loadReleaseFiles(candidate, ["core.json"]);
      }
      if (candidate.releaseId !== durable.currentReleaseId) {
        if (candidateIsOlder(candidate, activeManifest, durable.currentReleaseId)) {
          return this.transition("ready", {
            ...durable,
            manifest: activeManifest,
            data: activeData,
            candidate: null,
            error: null,
          });
        }
        this.transition("updating", {
          ...durable, manifest: activeManifest, data: activeData, candidate, error: null,
        });
        return this.promote(candidate);
      }
      return this.transition("ready", {
        ...durable, manifest: activeManifest ?? candidate, data: activeData,
        candidate: null, error: null,
      });
    } catch (error) {
      // Prefer the hoisted `durable`/`activeManifest`/`activeData` (what this
      // call itself already learned from the SW plus whatever it already
      // loaded) over `this._state`, which is only meaningfully different
      // from the constructor default once a transition() has already fired
      // earlier in this same try — mirrors the fetchCurrentManifest failure
      // branch a few lines up (durable, activeManifest, activeData).
      if (durable?.currentReleaseId && durable?.offlineReady) {
        return this.transition("offline", {
          ...durable, manifest: activeManifest, data: activeData, candidate: null,
          error: String(error?.message ?? error),
        });
      }
      const keepOffline = this._state.currentReleaseId && this._state.offlineReady;
      return this.transition(keepOffline ? "offline" : "failed", {
        error: String(error?.message ?? error),
      });
    }
  }

  async applyUpdate() {
    const candidate = this._state.candidate;
    if (!candidate) throw new Error("No compatible update is available.");
    this.transition("updating", { error: null });
    return this.promote(candidate);
  }

  async rollback() {
    if (!this._state.previousReleaseId) throw new Error("No previous release is available.");
    const prior = this._state;
    this.transition("updating", { error: null });
    let rollbackAttempted = false;
    try {
      rollbackAttempted = true;
      const rolledBack = await this.#handshake(this.sendMessage({
        type: "ROLLBACK_RELEASE",
        expectedCurrentReleaseId: prior.currentReleaseId,
        expectedPreviousReleaseId: prior.previousReleaseId,
        expectedGeneration: prior.generation,
      }), "ROLLBACK_RELEASE");
      const manifest = rolledBack?.manifest ?? null;
      if (!manifest) throw new Error("Rolled-back release manifest is unavailable.");
      const data = await this.loadRelease(manifest);
      const finalStatus = await this.status();
      if (finalStatus?.currentReleaseId !== rolledBack.currentReleaseId
        || finalStatus?.offlineReady !== true
        || finalStatus?.generation !== rolledBack.generation) {
        throw new Error("Rolled-back release changed while its data was loading.");
      }
      return this.transition("ready", {
        ...stateFromStatus(finalStatus), manifest, data, candidate: null, error: null,
      });
    } catch (error) {
      const message = String(error?.message ?? error);
      if (!rollbackAttempted) return this.transition("failed", { error: message });
      try {
        const durable = await this.status();
        const unchanged = durable?.currentReleaseId === prior.currentReleaseId
          && durable?.generation === prior.generation;
        return this.transition("failed", {
          ...stateFromStatus(durable),
          manifest: unchanged ? prior.manifest : (durable?.manifest ?? null),
          data: unchanged ? prior.data : null,
          candidate: unchanged ? prior.candidate : null,
          error: message,
        });
      } catch (statusError) {
        // Double failure: the ROLLBACK_RELEASE command failed AND the
        // follow-up status() probe meant to reconcile it also failed. That's
        // a communication glitch, not evidence the release itself is gone —
        // `prior` (the state going into this rollback attempt) is still
        // known-good, so fall back to it optimistically instead of nulling
        // every field (2026-08-11 wave-2a failure-ux finding, low severity).
        return this.transition("failed", {
          currentReleaseId: prior.currentReleaseId,
          previousReleaseId: prior.previousReleaseId,
          offlineReady: prior.offlineReady,
          generation: prior.generation,
          manifest: prior.manifest,
          data: prior.data,
          candidate: prior.candidate,
          error: `${message}; rollback reconciliation failed: ${String(statusError?.message ?? statusError)}`,
        });
      }
    }
  }
}
