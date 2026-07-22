export const ROSTER_SCHEMA = 2;
const ROSTER_DB_VERSION = 1;

const ROSTER_FIELDS = new Set([
  "schemaVersion", "ownedFormIds", "ownedFormCounts", "favorites", "preferences", "instances",
]);
const EMPTY_ROSTER = Object.freeze({
  schemaVersion: ROSTER_SCHEMA,
  ownedFormIds: Object.freeze([]),
  ownedFormCounts: Object.freeze({}),
  favorites: Object.freeze([]),
  preferences: Object.freeze({}),
  instances: Object.freeze([]),
});
const INSTANCE_FIELDS = new Set([
  "id", "formId", "cp", "ivs", "fastMove", "chargedMoves", "nickname", "addedAt",
]);


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


function normalizeIvs(value, index) {
  if (!isPlainObject(value)) {
    throw new RosterImportError(
      `instances[${index}].ivs must be an object with atk, def, sta.`,
      "invalid_instance",
      { field: "instances", index },
    );
  }
  const ivs = {};
  for (const key of ["atk", "def", "sta"]) {
    const raw = value[key];
    if (!Number.isInteger(raw) || raw < 0 || raw > 15) {
      throw new RosterImportError(
        `instances[${index}].ivs.${key} must be a whole number from 0 to 15.`,
        "invalid_instance",
        { field: "instances", index },
      );
    }
    ivs[key] = raw;
  }
  return ivs;
}


function normalizeInstance(value, index, validFormIds) {
  if (!isPlainObject(value)) {
    throw new RosterImportError(
      `instances[${index}] must be a plain object.`,
      "invalid_instance",
      { field: "instances", index },
    );
  }
  const unknownFields = Object.keys(value).filter((field) => !INSTANCE_FIELDS.has(field)).sort();
  if (unknownFields.length) {
    throw new RosterImportError(
      `instances[${index}] contains unsupported fields: ${unknownFields.join(", ")}.`,
      "unknown_fields",
      { field: "instances", index, fields: unknownFields },
    );
  }
  if (typeof value.id !== "string" || !value.id) {
    throw new RosterImportError(
      `instances[${index}].id must be a non-empty string.`, "invalid_instance", { field: "instances", index },
    );
  }
  if (typeof value.formId !== "string" || !value.formId || (validFormIds && !validFormIds.has(value.formId))) {
    throw new RosterImportError(
      `instances[${index}].formId is not a known exact form ID.`, "unknown_form_ids", { field: "instances", index },
    );
  }
  if (!Number.isInteger(value.cp) || value.cp <= 0) {
    throw new RosterImportError(
      `instances[${index}].cp must be a positive whole number.`, "invalid_instance", { field: "instances", index },
    );
  }
  const ivs = normalizeIvs(value.ivs, index);
  // fastMove/chargedMoves are optional: bulk-import sources (e.g. Poke Genie
  // CSV) carry verified CP/IVs but no move data. When present, still hold
  // them to the same shape manual entry requires.
  if (value.fastMove !== undefined && (typeof value.fastMove !== "string" || !value.fastMove)) {
    throw new RosterImportError(
      `instances[${index}].fastMove must be a non-empty string.`, "invalid_instance", { field: "instances", index },
    );
  }
  if (value.chargedMoves !== undefined && (
    !Array.isArray(value.chargedMoves) || value.chargedMoves.length < 1 || value.chargedMoves.length > 2
    || value.chargedMoves.some((moveId) => typeof moveId !== "string" || !moveId)
    || new Set(value.chargedMoves).size !== value.chargedMoves.length
  )) {
    throw new RosterImportError(
      `instances[${index}].chargedMoves must be 1-2 distinct move ID strings.`, "invalid_instance", { field: "instances", index },
    );
  }
  if (value.nickname !== undefined && (typeof value.nickname !== "string" || !value.nickname)) {
    throw new RosterImportError(
      `instances[${index}].nickname must be a non-empty string if present.`, "invalid_instance", { field: "instances", index },
    );
  }
  if (typeof value.addedAt !== "string" || Number.isNaN(Date.parse(value.addedAt))) {
    throw new RosterImportError(
      `instances[${index}].addedAt must be an ISO date string.`, "invalid_instance", { field: "instances", index },
    );
  }
  return {
    id: value.id,
    formId: value.formId,
    cp: value.cp,
    ivs,
    ...(value.fastMove !== undefined ? { fastMove: value.fastMove } : {}),
    ...(value.chargedMoves !== undefined ? { chargedMoves: [...value.chargedMoves] } : {}),
    ...(value.nickname !== undefined ? { nickname: value.nickname } : {}),
    addedAt: value.addedAt,
  };
}


// Additive to the round-2 roster schema: an array of manually entered,
// per-copy detail records. Old rosters without "instances" stay valid — this
// defaults to [] rather than being required.
function normalizeInstances(value, validFormIds) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new RosterImportError("instances must be an array.", "invalid_instance", { field: "instances" });
  }
  const seenIds = new Set();
  const normalized = value.map((entry, index) => {
    const instance = normalizeInstance(entry, index, validFormIds);
    if (seenIds.has(instance.id)) {
      throw new RosterImportError(
        `instances contains duplicate id: ${instance.id}.`, "duplicate_instance_id", { field: "instances", index },
      );
    }
    seenIds.add(instance.id);
    return instance;
  });
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
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
    instances: normalizeInstances(payload.instances, validFormIds),
  };
}


function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}


// Same stable shape as stableJson(), but formats an in-memory roster object
// directly — no store round-trip — for immediate export/share/copy actions.
export function stableRosterJson(roster) {
  const ownedFormIds = [...(roster.ownedFormIds ?? [])].sort();
  const ownedFormCounts = Object.fromEntries(ownedFormIds.map((formId) => [
    formId,
    Number.isInteger(roster.ownedFormCounts?.[formId]) && roster.ownedFormCounts[formId] > 0
      ? roster.ownedFormCounts[formId]
      : 1,
  ]));
  const instances = (roster.instances ?? [])
    .filter((instance) => isPlainObject(instance) && typeof instance.id === "string")
    .map((instance) => ({
      id: instance.id,
      formId: instance.formId,
      cp: instance.cp,
      ivs: { atk: instance.ivs?.atk, def: instance.ivs?.def, sta: instance.ivs?.sta },
      ...(instance.fastMove ? { fastMove: instance.fastMove } : {}),
      ...(instance.chargedMoves?.length ? { chargedMoves: [...instance.chargedMoves] } : {}),
      ...(instance.nickname ? { nickname: instance.nickname } : {}),
      addedAt: instance.addedAt,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return `${JSON.stringify({
    schemaVersion: ROSTER_SCHEMA,
    ownedFormIds,
    ownedFormCounts,
    favorites: [...(roster.favorites ?? [])].sort(),
    preferences: roster.preferences ?? {},
    instances,
  })}\n`;
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
