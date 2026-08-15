// Group roster store: lets a player paste in a groupmate's exported roster
// JSON so raid-team tooling can consider more than the solo player's own
// boxes. Pure module over an injected storage adapter — same synchronous
// getItem/setItem interface storage.js's trainer profile already uses (group
// members are small records; no need for the async IndexedDB roster store).
const GROUP_STORAGE_KEY = "pogo-group-members";
const MAX_MEMBERS = 12;

export class GroupMemberCapError extends Error {
  constructor(message, code = "member_cap") {
    super(message);
    this.name = "GroupMemberCapError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Shared shape check for one member record. Returns { entry } on success or
// { error } describing what's wrong, so callers can either warn-and-drop
// (load) or throw (save).
function normalizeEntry(raw) {
  if (!isPlainObject(raw)) return { error: "must be an object" };
  const memberName = typeof raw.memberName === "string" ? raw.memberName.trim() : "";
  if (!memberName) return { error: "missing memberName" };
  if (typeof raw.exportedAt !== "string" || Number.isNaN(Date.parse(raw.exportedAt))) {
    return { error: "invalid exportedAt" };
  }
  if (!isPlainObject(raw.roster)) return { error: "missing roster" };
  return { entry: { memberName, exportedAt: raw.exportedAt, roster: raw.roster } };
}

// Reads the raw JSON array from storage, dropping any entry that doesn't
// look like a valid member record instead of throwing — a hand-edited or
// partially-written value shouldn't brick the whole group list.
export function loadGroupMembers(storage) {
  let parsed;
  try {
    parsed = JSON.parse(storage?.getItem?.(GROUP_STORAGE_KEY) ?? "null");
  } catch {
    return { members: [], warnings: ["stored group members were not valid JSON"] };
  }
  if (parsed === null) return { members: [], warnings: [] };
  if (!Array.isArray(parsed)) return { members: [], warnings: ["stored group members were not an array"] };
  const members = [];
  const warnings = [];
  parsed.forEach((raw, index) => {
    const result = normalizeEntry(raw);
    if (result.error) warnings.push(`entry ${index}: ${result.error}`);
    else members.push(result.entry);
  });
  return { members, warnings };
}

function persist(storage, members) {
  storage?.setItem?.(GROUP_STORAGE_KEY, JSON.stringify(members));
}

// Upserts by memberName (case-insensitive) — re-sharing a roster updates the
// existing slot instead of creating a duplicate. The member cap only applies
// to adding a genuinely new member; refreshing an existing one never trips it.
export function saveGroupMember(storage, member) {
  const result = normalizeEntry(member);
  if (result.error) throw new TypeError(`invalid group member: ${result.error}`);
  const { entry } = result;
  const { members } = loadGroupMembers(storage);
  const existingIndex = members.findIndex((m) => m.memberName.toLowerCase() === entry.memberName.toLowerCase());
  if (existingIndex === -1 && members.length >= MAX_MEMBERS) {
    throw new GroupMemberCapError(`Group is limited to ${MAX_MEMBERS} members.`);
  }
  const next = [...members];
  if (existingIndex === -1) next.push(entry);
  else next[existingIndex] = entry;
  persist(storage, next);
  return next;
}

export function removeGroupMember(storage, memberName) {
  const { members } = loadGroupMembers(storage);
  const target = typeof memberName === "string" ? memberName.trim().toLowerCase() : "";
  const next = members.filter((m) => m.memberName.toLowerCase() !== target);
  persist(storage, next);
  return next;
}

// UI header math: how many members, how many roster instances total across
// them, and the freshest/stalest share so a stale export can be called out
// honestly instead of assumed current.
export function groupSummary(members) {
  const list = Array.isArray(members) ? members : [];
  const totalInstances = list.reduce(
    (sum, m) => sum + (Array.isArray(m.roster?.instances) ? m.roster.instances.length : 0),
    0,
  );
  const timestamps = list
    .map((m) => m.exportedAt)
    .filter((t) => typeof t === "string" && !Number.isNaN(Date.parse(t)))
    .sort();
  return {
    memberCount: list.length,
    totalInstances,
    freshestExportedAt: timestamps.length ? timestamps[timestamps.length - 1] : null,
    stalestExportedAt: timestamps.length ? timestamps[0] : null,
  };
}
