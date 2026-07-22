export const APP_VERSION = 1;
export const APP_SHELL_REVISION = "r30";
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
  for (const required of ["core.json", "extras.json", "gyms.json", "pvp.json", "raid-targets.json", "raids.json"]) {
    if (!seen.has(required)) throw new TypeError(`Release is missing required file path ${required}.`);
  }
  return structuredClone(manifest);
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


async function defaultRegister() {
  if (!globalThis.navigator?.serviceWorker) throw new Error("Service workers are unavailable.");
  return globalThis.navigator.serviceWorker.register("./sw.js", { scope: "./", type: "module" });
}


async function defaultSendMessage(message) {
  if (!globalThis.navigator?.serviceWorker) throw new Error("Service workers are unavailable.");
  const registration = await globalThis.navigator.serviceWorker.ready;
  const worker = globalThis.navigator.serviceWorker.controller ?? registration.active;
  if (!worker) throw new Error("No active service worker is available.");
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error("Service worker response timed out.")), 15000);
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


export class ReleaseManager {
  static STATES = RELEASE_STATES;

  constructor({
    appVersion = APP_VERSION,
    baseUrl = "./",
    fetchImpl = globalThis.fetch?.bind(globalThis),
    register = defaultRegister,
    sendMessage = defaultSendMessage,
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.appVersion = appVersion;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.register = register;
    this.sendMessage = sendMessage;
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

  async loadRelease(manifest) {
    const validated = validateReleaseManifest(manifest, { appVersion: this.appVersion });
    const files = [...validated.files].sort((left, right) => {
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
      const chunk = await response.json();
      if (!plainObject(chunk)) throw new TypeError(`Active release file ${file.path} is not an object.`);
      Object.assign(data, chunk);
    }
    return data;
  }

  async status() {
    return this.sendMessage({ type: "RELEASE_STATUS" });
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
      await this.sendMessage({
        type: "ROLLBACK_RELEASE",
        expectedCurrentReleaseId: candidate.releaseId,
        expectedPreviousReleaseId: activationReceipt.previousReleaseId,
        expectedGeneration: activationReceipt.generation,
      });
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
      await this.sendMessage({
        type: "STAGE_RELEASE",
        manifest: candidate,
        expectedCurrentReleaseId: previousReleaseId,
        expectedGeneration: previousGeneration,
      });
      activationAttempted = true;
      activationReceipt = await this.sendMessage({
        type: "ACTIVATE_RELEASE",
        releaseId: candidate.releaseId,
      });
      if (activationReceipt?.currentReleaseId !== candidate.releaseId
        || activationReceipt?.offlineReady !== true
        || !Number.isInteger(activationReceipt?.generation)
        || activationReceipt.generation < 0) {
        throw new Error("Candidate release was not durably active and offline-ready.");
      }
      const data = await this.loadRelease(candidate);
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

  async initialize() {
    try {
      await this.register("./sw.js", { scope: "./", type: "module" });
      const stored = await this.status();
      const durable = stateFromStatus(stored);
      let activeManifest = stored?.manifest ?? null;
      let activeData = null;
      if (activeManifest) {
        activeManifest = validateReleaseManifest(activeManifest, { appVersion: this.appVersion });
        activeData = await this.loadRelease(activeManifest);
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
        this.transition("caching", { candidate, error: null });
        return this.promote(candidate, { fallbackStatus: "failed" });
      }

      if (!activeManifest && candidate.releaseId === durable.currentReleaseId) {
        activeManifest = candidate;
        activeData = await this.loadRelease(candidate);
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
      const rolledBack = await this.sendMessage({
        type: "ROLLBACK_RELEASE",
        expectedCurrentReleaseId: prior.currentReleaseId,
        expectedPreviousReleaseId: prior.previousReleaseId,
        expectedGeneration: prior.generation,
      });
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
        return this.transition("failed", {
          currentReleaseId: null,
          previousReleaseId: null,
          offlineReady: false,
          generation: 0,
          manifest: null,
          data: null,
          candidate: null,
          error: `${message}; rollback reconciliation failed: ${String(statusError?.message ?? statusError)}`,
        });
      }
    }
  }
}
