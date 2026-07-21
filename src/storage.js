export const ROSTER_SCHEMA = 2;
const ROSTER_DB_VERSION = 1;

const ROSTER_FIELDS = new Set([
  "schemaVersion", "ownedFormIds", "ownedFormCounts", "favorites", "preferences",
]);
const EMPTY_ROSTER = Object.freeze({
  schemaVersion: ROSTER_SCHEMA,
  ownedFormIds: Object.freeze([]),
  ownedFormCounts: Object.freeze({}),
  favorites: Object.freeze([]),
  preferences: Object.freeze({}),
});


export class RosterImportError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "RosterImportError";
    this.code = code;
    this.details = details;
  }
}


function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}


function isJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isPlainObject(value) && Object.values(value).every(isJsonValue);
}


function normalizeFormIds(value, field, validFormIds) {
  if (!Array.isArray(value) || value.some((formId) => typeof formId !== "string" || !formId)) {
    throw new RosterImportError(
      `${field} must be an array of exact form ID strings.`,
      "invalid_form_ids",
      { field },
    );
  }
  const duplicates = [...new Set(value.filter((formId, index) => value.indexOf(formId) !== index))].sort();
  if (duplicates.length) {
    throw new RosterImportError(
      `${field} contains duplicate form IDs: ${duplicates.join(", ")}.`,
      "duplicate_form_ids",
      { field, rejectedIds: duplicates },
    );
  }
  const unknown = validFormIds
    ? value.filter((formId) => !validFormIds.has(formId)).sort()
    : [];
  if (unknown.length) {
    throw new RosterImportError(
      `${field} contains unknown exact form IDs: ${unknown.join(", ")}.`,
      "unknown_form_ids",
      { field, rejectedIds: unknown },
    );
  }
  return [...value].sort();
}


function normalizeFormCounts(value, ownedFormIds, validFormIds) {
  if (value === undefined) {
    return Object.fromEntries(ownedFormIds.map((formId) => [formId, 1]));
  }
  if (!isPlainObject(value)) {
    throw new RosterImportError(
      "ownedFormCounts must be an object keyed by exact form ID.",
      "invalid_form_counts",
      { field: "ownedFormCounts" },
    );
  }
  const entries = Object.entries(value);
  if (entries.some(([formId, count]) => (
    !formId || !Number.isInteger(count) || count < 1 || count > 999
  ))) {
    throw new RosterImportError(
      "ownedFormCounts values must be whole numbers from 1 to 999.",
      "invalid_form_counts",
      { field: "ownedFormCounts" },
    );
  }
  const unknown = validFormIds
    ? entries.map(([formId]) => formId).filter((formId) => !validFormIds.has(formId)).sort()
    : [];
  if (unknown.length) {
    throw new RosterImportError(
      `ownedFormCounts contains unknown exact form IDs: ${unknown.join(", ")}.`,
      "unknown_form_ids",
      { field: "ownedFormCounts", rejectedIds: unknown },
    );
  }
  const countIds = entries.map(([formId]) => formId).sort();
  if (JSON.stringify(countIds) !== JSON.stringify(ownedFormIds)) {
    throw new RosterImportError(
      "ownedFormIds and ownedFormCounts must describe the same exact forms.",
      "inconsistent_form_counts",
      { field: "ownedFormCounts" },
    );
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}


function normalizeRoster(payload, validFormIds = null) {
  if (!isPlainObject(payload)) {
    throw new RosterImportError(
      "Roster import must be a plain JSON object.",
      "plain_object",
      { receivedType: Array.isArray(payload) ? "array" : typeof payload },
    );
  }
  const unknownFields = Object.keys(payload).filter((field) => !ROSTER_FIELDS.has(field)).sort();
  if (unknownFields.length) {
    throw new RosterImportError(
      `Roster import contains unsupported fields: ${unknownFields.join(", ")}.`,
      "unknown_fields",
      { fields: unknownFields },
    );
  }
  if (payload.schemaVersion !== 1 && payload.schemaVersion !== ROSTER_SCHEMA) {
    throw new RosterImportError(
      `Unsupported roster schema ${String(payload.schemaVersion)}; expected ${ROSTER_SCHEMA}.`,
      "unsupported_schema",
      { expected: ROSTER_SCHEMA, received: payload.schemaVersion },
    );
  }
  const preferences = payload.preferences ?? {};
  if (!isPlainObject(preferences) || !isJsonValue(preferences)) {
    throw new RosterImportError(
      "preferences must be a plain JSON object with finite values.",
      "invalid_preferences",
      { field: "preferences" },
    );
  }
  const ownedFormIds = normalizeFormIds(payload.ownedFormIds, "ownedFormIds", validFormIds);
  return {
    schemaVersion: ROSTER_SCHEMA,
    ownedFormIds,
    ownedFormCounts: normalizeFormCounts(
      payload.schemaVersion === 1 ? undefined : payload.ownedFormCounts,
      ownedFormIds,
      validFormIds,
    ),
    favorites: normalizeFormIds(payload.favorites ?? [], "favorites", validFormIds),
    preferences: structuredClone(preferences),
  };
}


function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}


export async function loadRoster(store) {
  const value = await store.read();
  if (value === null || value === undefined) return structuredClone(EMPTY_ROSTER);
  const normalized = normalizeRoster(value);
  if (value.schemaVersion !== ROSTER_SCHEMA && typeof store.replace === "function") {
    await store.replace(normalized);
  }
  return normalized;
}


export async function importRoster(payload, validFormIds, store) {
  if (!(validFormIds instanceof Set)) {
    throw new TypeError("validFormIds must be a Set of exact canonical form IDs");
  }
  if (!store || typeof store.replace !== "function") {
    throw new TypeError("store must provide an atomic replace(state) method");
  }
  const next = normalizeRoster(payload, validFormIds);
  await store.replace(next);
  return structuredClone(next);
}


export async function replaceRoster(state, validFormIds, store) {
  return importRoster(state, validFormIds, store);
}


export async function exportRoster(store) {
  return `${stableJson(await loadRoster(store))}\n`;
}


export function createIndexedDbAdapter({
  indexedDBObject = globalThis.indexedDB,
  databaseName = "pokemon-go-field-guide",
  storeName = "local-state",
} = {}) {
  if (!indexedDBObject || typeof indexedDBObject.open !== "function") {
    throw new Error("IndexedDB is unavailable in this browser.");
  }

  const open = () => new Promise((resolve, reject) => {
    const request = indexedDBObject.open(databaseName, ROSTER_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open local roster storage."));
    request.onsuccess = () => resolve(request.result);
  });

  const requestResult = (request) => new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("Local roster request failed."));
    request.onsuccess = () => resolve(request.result);
  });

  return {
    async read() {
      const database = await open();
      try {
        const transaction = database.transaction(storeName, "readonly");
        return await requestResult(transaction.objectStore(storeName).get("roster"));
      } finally {
        database.close();
      }
    },
    async replace(state) {
      const database = await open();
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, "readwrite");
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save local roster."));
          transaction.onabort = () => reject(transaction.error ?? new Error("Local roster save was aborted."));
          transaction.objectStore(storeName).put(structuredClone(state), "roster");
        });
      } finally {
        database.close();
      }
    },
  };
}
