// Group pack: a compact, versioned export of one player's battle-relevant
// roster for pasting into a raid/gym group chat — not a full backup. Mirrors
// storage.js's envelope/instance-whitelist/validation-throws-typed-error
// discipline (same enum sets, same omit-when-absent convention), with two
// deliberate relaxations for cross-device group sharing rather than
// same-device restore:
//   - unknown fields are stripped on parse, not rejected — a pack built by a
//     newer app release shouldn't fail to parse on an older one.
//   - there's no validFormIds check — a group pack is read/displayed, never
//     merged into this device's own roster, so it doesn't need this
//     device's release data to validate against.
//
// Fields kept: formId, cp, ivs, fastMove/chargedMoves, megaLevel,
// buddyLevel, canDynamax/canGigantamax, sizeClass, heightM/weightKg (a group
// showcase-comparison activity, and carries no personal-identity risk),
// isShiny/isLucky (trophy/social value), plus an ownedFormCounts summary.
// Fields dropped: instance id, nickname, addedAt/updatedAt (not battle
// facts), and anything not on this whitelist — friend codes and preferences
// never had a path onto an instance object to begin with, so they can't
// leak through here either.
import { isPlainObject } from "./storage.js";

export const GROUP_PACK_SCHEMA = 1;
// Matches storage.js's MAX_TRAINER_NAME_LENGTH (review catch: the view's
// maxlength=40 input accepted names the 24-cap then refused to export).
const MAX_MEMBER_NAME_LENGTH = 40;
const MAX_INSTANCES = 2000;

// Mirrors storage.js's private MEGA_LEVELS/SIZE_CLASSES/BUDDY_LEVELS enum
// sets (not exported there, so copied here). Keep in sync by hand; do not
// loosen.
const MEGA_LEVELS = new Set(["base", "high", "max", "supermax"]);
const SIZE_CLASSES = new Set(["xxs", "xs", "avg", "xl", "xxl"]);
const BUDDY_LEVELS = new Set(["good", "great", "ultra", "best"]);

export class GroupPackError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "GroupPackError";
    this.code = code;
    this.details = details;
  }
}

function validMemberName(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed && trimmed.length <= MAX_MEMBER_NAME_LENGTH ? trimmed : null;
}

// Whitelist-copies the battle-relevant instance fields, same
// omit-when-absent convention as instances.js/storage.js. `ivs` is passed in
// already-validated (build trusts local state; parse validates it first).
function pickPackFields(value, ivs) {
  return {
    formId: value.formId,
    cp: value.cp,
    ivs,
    ...(value.fastMove ? { fastMove: value.fastMove } : {}),
    ...(value.chargedMoves?.length ? { chargedMoves: [...value.chargedMoves] } : {}),
    ...(value.isShiny ? { isShiny: true } : {}),
    ...(value.isLucky ? { isLucky: true } : {}),
    ...(value.megaLevel ? { megaLevel: value.megaLevel } : {}),
    ...(value.sizeClass ? { sizeClass: value.sizeClass } : {}),
    ...(value.heightM !== undefined ? { heightM: value.heightM } : {}),
    ...(value.weightKg !== undefined ? { weightKg: value.weightKg } : {}),
    ...(value.buddyLevel ? { buddyLevel: value.buddyLevel } : {}),
    ...(value.canDynamax ? { canDynamax: true } : {}),
    ...(value.canGigantamax ? { canGigantamax: true } : {}),
  };
}

function sortedCounts(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

function sortInstances(instances) {
  return [...instances].sort((left, right) => left.formId.localeCompare(right.formId) || left.cp - right.cp);
}

// Builds the group-share envelope from live roster state. `forms` is this
// device's known-form-id map (formId -> form); an owned formId this build
// doesn't recognize (stale data from an older release) is quietly dropped
// rather than shared broken. `forms` may be omitted to skip that filter.
export function buildGroupPack({ roster, forms, memberName }) {
  const name = validMemberName(memberName);
  if (!name) {
    throw new GroupPackError("memberName is required and must be 1-24 characters.", "invalid_member_name");
  }
  const validFormIds = forms ? new Set(Object.keys(forms)) : null;
  const knownFormId = (formId) => !validFormIds || validFormIds.has(formId);
  const ownedFormCounts = sortedCounts(
    Object.entries(roster?.ownedFormCounts ?? {}).filter(([formId]) => knownFormId(formId)),
  );
  const instances = sortInstances(
    (roster?.instances ?? [])
      .filter((instance) => isPlainObject(instance) && knownFormId(instance.formId))
      .map((instance) => pickPackFields(instance, {
        atk: instance.ivs.atk, def: instance.ivs.def, sta: instance.ivs.sta,
      })),
  );
  return {
    schemaVersion: GROUP_PACK_SCHEMA,
    kind: "group-pack",
    memberName: name,
    exportedAt: new Date().toISOString(),
    roster: { ownedFormCounts, instances },
  };
}

function normalizeIvs(value, index) {
  if (!isPlainObject(value)) {
    throw new GroupPackError(
      `roster.instances[${index}].ivs must be an object with atk, def, sta.`, "invalid_instance", { index },
    );
  }
  const ivs = {};
  for (const key of ["atk", "def", "sta"]) {
    const raw = value[key];
    if (!Number.isInteger(raw) || raw < 0 || raw > 15) {
      throw new GroupPackError(
        `roster.instances[${index}].ivs.${key} must be a whole number from 0 to 15.`, "invalid_instance", { index },
      );
    }
    ivs[key] = raw;
  }
  return ivs;
}

// Validates one instance entry, then whitelist-copies it (pickPackFields) —
// this is also where unknown fields get dropped, since only whitelisted
// fields are ever read.
function normalizePackInstance(value, index) {
  if (!isPlainObject(value)) {
    throw new GroupPackError(`roster.instances[${index}] must be a plain object.`, "invalid_instance", { index });
  }
  // Shape rules on the free-string fields (review catch: a friend code fits
  // inside a "non-empty string" — "1234 5678 9012" survived as a formId).
  if (typeof value.formId !== "string" || !/^\d{4}-[a-z0-9-]{1,40}$/.test(value.formId)) {
    throw new GroupPackError(`roster.instances[${index}].formId must look like "0888-crowned-sword".`, "invalid_instance", { index });
  }
  if (!Number.isInteger(value.cp) || value.cp <= 0) {
    throw new GroupPackError(`roster.instances[${index}].cp must be a positive whole number.`, "invalid_instance", { index });
  }
  const ivs = normalizeIvs(value.ivs, index);
  if (value.fastMove !== undefined && (typeof value.fastMove !== "string" || !/^[A-Z0-9_]{1,48}$/.test(value.fastMove))) {
    throw new GroupPackError(`roster.instances[${index}].fastMove must be a MOVE_ID string if present.`, "invalid_instance", { index });
  }
  if (value.chargedMoves !== undefined && (
    !Array.isArray(value.chargedMoves) || value.chargedMoves.length < 1 || value.chargedMoves.length > 2
    || value.chargedMoves.some((moveId) => typeof moveId !== "string" || !/^[A-Z0-9_]{1,48}$/.test(moveId))
    || new Set(value.chargedMoves).size !== value.chargedMoves.length
  )) {
    throw new GroupPackError(`roster.instances[${index}].chargedMoves must be 1-2 distinct move ID strings.`, "invalid_instance", { index });
  }
  if (value.isShiny !== undefined && typeof value.isShiny !== "boolean") {
    throw new GroupPackError(`roster.instances[${index}].isShiny must be a boolean if present.`, "invalid_instance", { index });
  }
  if (value.isLucky !== undefined && typeof value.isLucky !== "boolean") {
    throw new GroupPackError(`roster.instances[${index}].isLucky must be a boolean if present.`, "invalid_instance", { index });
  }
  if (value.megaLevel !== undefined && !MEGA_LEVELS.has(value.megaLevel)) {
    throw new GroupPackError(`roster.instances[${index}].megaLevel must be "base", "high", "max", or "supermax" if present.`, "invalid_instance", { index });
  }
  if (value.sizeClass !== undefined && !SIZE_CLASSES.has(value.sizeClass)) {
    throw new GroupPackError(`roster.instances[${index}].sizeClass must be "xxs", "xs", "avg", "xl", or "xxl" if present.`, "invalid_instance", { index });
  }
  if (value.heightM !== undefined && (typeof value.heightM !== "number" || !Number.isFinite(value.heightM) || value.heightM <= 0)) {
    throw new GroupPackError(`roster.instances[${index}].heightM must be a positive finite number if present.`, "invalid_instance", { index });
  }
  if (value.weightKg !== undefined && (typeof value.weightKg !== "number" || !Number.isFinite(value.weightKg) || value.weightKg <= 0)) {
    throw new GroupPackError(`roster.instances[${index}].weightKg must be a positive finite number if present.`, "invalid_instance", { index });
  }
  if (value.buddyLevel !== undefined && !BUDDY_LEVELS.has(value.buddyLevel)) {
    throw new GroupPackError(`roster.instances[${index}].buddyLevel must be "good", "great", "ultra", or "best" if present.`, "invalid_instance", { index });
  }
  if (value.canDynamax !== undefined && typeof value.canDynamax !== "boolean") {
    throw new GroupPackError(`roster.instances[${index}].canDynamax must be a boolean if present.`, "invalid_instance", { index });
  }
  if (value.canGigantamax !== undefined && typeof value.canGigantamax !== "boolean") {
    throw new GroupPackError(`roster.instances[${index}].canGigantamax must be a boolean if present.`, "invalid_instance", { index });
  }
  return pickPackFields(value, ivs);
}

// Validates a parsed-or-raw-text group pack and returns the normalized
// member object, or throws a typed GroupPackError. `json` may be a JSON
// string (the pasted/uploaded pack) or an already-parsed object.
export function parseGroupPack(json) {
  let raw = json;
  if (typeof json === "string") {
    try {
      raw = JSON.parse(json);
    } catch {
      throw new GroupPackError("That group pack isn't valid JSON.", "invalid_json");
    }
  }
  if (!isPlainObject(raw)) {
    throw new GroupPackError("A group pack must be a JSON object.", "invalid_envelope");
  }
  if (raw.schemaVersion !== GROUP_PACK_SCHEMA) {
    throw new GroupPackError(
      `Unsupported group pack schema ${JSON.stringify(raw.schemaVersion)}; expected ${GROUP_PACK_SCHEMA}.`,
      "unsupported_schema",
    );
  }
  if (raw.kind !== "group-pack") {
    throw new GroupPackError(`Not a group pack (kind ${JSON.stringify(raw.kind)}).`, "wrong_kind");
  }
  const memberName = validMemberName(raw.memberName);
  if (!memberName) {
    throw new GroupPackError("memberName is required and must be 1-24 characters.", "invalid_member_name");
  }
  if (typeof raw.exportedAt !== "string" || Number.isNaN(Date.parse(raw.exportedAt))) {
    throw new GroupPackError("exportedAt must be an ISO date string.", "invalid_envelope");
  }
  if (!isPlainObject(raw.roster)) {
    throw new GroupPackError("roster must be a JSON object.", "invalid_envelope");
  }
  if (!Array.isArray(raw.roster.instances)) {
    throw new GroupPackError("roster.instances must be an array.", "invalid_envelope");
  }
  if (raw.roster.instances.length > MAX_INSTANCES) {
    throw new GroupPackError(`Group pack exceeds the ${MAX_INSTANCES}-instance cap.`, "oversized_pack");
  }
  const rawCounts = raw.roster.ownedFormCounts ?? {};
  if (!isPlainObject(rawCounts)) {
    throw new GroupPackError("roster.ownedFormCounts must be an object keyed by exact form ID.", "invalid_envelope");
  }
  const countEntries = Object.entries(rawCounts);
  if (countEntries.some(([formId, count]) => !formId || !Number.isInteger(count) || count < 1 || count > 999)) {
    throw new GroupPackError("roster.ownedFormCounts values must be whole numbers from 1 to 999.", "invalid_envelope");
  }
  const instances = sortInstances(raw.roster.instances.map(normalizePackInstance));
  return {
    schemaVersion: GROUP_PACK_SCHEMA,
    kind: "group-pack",
    memberName,
    exportedAt: raw.exportedAt,
    roster: { ownedFormCounts: sortedCounts(countEntries), instances },
  };
}
