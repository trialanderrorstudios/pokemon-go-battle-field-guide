// Gym defense leaderboard v1 — honest manual tracking. Pokémon GO does not
// expose gym-hold data to third-party apps, so every entry here is typed in
// by a player: "I dropped a defender" (start) and "it came back" (complete).
// One flat list in localStorage (feedback.js pattern), plus a compact
// versioned text block so friends can paste each other's columns in.
const STORAGE_KEY = "pogo-gym-defense-log";
const SCHEMA_VERSION = 1;
export const EXPORT_HEADER = "PGDEF-v1";
const DEFAULT_PLAYER_NAME = "You";

// ponytail: the share format is pipe-delimited for readability, so free-text
// fields simply can't contain "|" or a newline — validated at entry time
// instead of building an escaping scheme for a character gym/Pokémon names
// never actually use.
function hasSeparator(value) {
  return typeof value !== "string" || /[|\r\n]/.test(value);
}


export class DefenseLogError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DefenseLogError";
    this.code = code;
  }
}


function isValidEntry(entry) {
  return entry
    && typeof entry === "object"
    && typeof entry.id === "string" && entry.id
    && typeof entry.playerName === "string" && entry.playerName && !hasSeparator(entry.playerName)
    && typeof entry.pokemon === "string" && entry.pokemon && !hasSeparator(entry.pokemon)
    && typeof entry.gymName === "string" && entry.gymName && !hasSeparator(entry.gymName)
    && typeof entry.startedAt === "string" && !Number.isNaN(Date.parse(entry.startedAt))
    && (entry.endedAt === null || (typeof entry.endedAt === "string" && !Number.isNaN(Date.parse(entry.endedAt))))
    && (entry.coins === null || (Number.isInteger(entry.coins) && entry.coins >= 0))
    && typeof entry.isLocal === "boolean";
}


function emptyLog() {
  return { schemaVersion: SCHEMA_VERSION, localPlayerName: DEFAULT_PLAYER_NAME, entries: [] };
}


export function loadDefenseLog(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) return emptyLog();
    const localPlayerName = typeof parsed.localPlayerName === "string"
      && parsed.localPlayerName.trim()
      && !hasSeparator(parsed.localPlayerName)
      ? parsed.localPlayerName
      : DEFAULT_PLAYER_NAME;
    return { schemaVersion: SCHEMA_VERSION, localPlayerName, entries: parsed.entries.filter(isValidEntry) };
  } catch {
    return emptyLog();
  }
}


export function saveDefenseLog(storage, log) {
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage can legitimately be unavailable — the change still applies for
    // this session, it just won't persist to the next visit.
  }
  return log;
}


export function setLocalPlayerName(log, name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || hasSeparator(trimmed)) {
    throw new DefenseLogError('Your name can\'t be empty or contain "|".', "invalid_player_name");
  }
  return { ...log, localPlayerName: trimmed };
}


function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


function toIso(value, fallbackNow, fieldLabel) {
  if (!value) return fallbackNow ? new Date().toISOString() : null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DefenseLogError(`${fieldLabel} is not a valid date.`, "invalid_date");
  }
  return parsed.toISOString();
}


export function startDefense(log, { pokemon, gymName, startedAt, instanceId } = {}) {
  const cleanPokemon = String(pokemon ?? "").trim();
  const cleanGym = String(gymName ?? "").trim();
  if (!cleanPokemon || hasSeparator(cleanPokemon)) {
    throw new DefenseLogError('Pokémon name is required and can\'t contain "|".', "invalid_pokemon");
  }
  if (!cleanGym || hasSeparator(cleanGym)) {
    throw new DefenseLogError('Gym name is required and can\'t contain "|".', "invalid_gym");
  }
  const entry = {
    id: randomId(),
    playerName: log.localPlayerName,
    pokemon: cleanPokemon,
    gymName: cleanGym,
    startedAt: toIso(startedAt, true, "Start time"),
    endedAt: null,
    coins: null,
    isLocal: true,
  };
  // ponytail: instanceId is optional and only used for exact roster matching.
  // Free-text entries (no instanceId) won't badge in raid counters.
  if (instanceId) entry.instanceId = String(instanceId).trim();
  return { ...log, entries: [...log.entries, entry] };
}


export function completeDefense(log, entryId, { endedAt, coins } = {}) {
  const index = log.entries.findIndex((entry) => entry.id === entryId && entry.isLocal);
  if (index === -1) throw new DefenseLogError("That defender entry was not found.", "entry_not_found");
  const entry = log.entries[index];
  if (entry.endedAt) throw new DefenseLogError("That defender already came back.", "already_completed");
  const endedAtIso = toIso(endedAt, true, "End time");
  if (new Date(endedAtIso).getTime() < new Date(entry.startedAt).getTime()) {
    throw new DefenseLogError("End time can't be before the start time.", "end_before_start");
  }
  let coinsValue = null;
  if (coins !== undefined && coins !== null && coins !== "") {
    const number = Number(coins);
    if (!Number.isInteger(number) || number < 0) {
      throw new DefenseLogError("Coins earned must be a whole number of 0 or more.", "invalid_coins");
    }
    coinsValue = number;
  }
  const nextEntries = [...log.entries];
  nextEntries[index] = { ...entry, endedAt: endedAtIso, coins: coinsValue };
  return { ...log, entries: nextEntries };
}


export function deleteDefenseEntry(log, entryId) {
  return { ...log, entries: log.entries.filter((entry) => !(entry.id === entryId && entry.isLocal)) };
}


export function durationMs(entry, now = Date.now()) {
  const start = new Date(entry.startedAt).getTime();
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
  return Math.max(0, end - start);
}


// Three independent rankings per player, all derived from the same flat
// entry list: longest single defense, total defense time, and who's
// currently up (in-progress entries, sorted longest-held-so-far first).
// Local entries are grouped under the *current* localPlayerName rather than
// the name stored on the entry, so renaming yourself doesn't fork your own
// history into two players.
export function buildLeaderboard(log, now = Date.now()) {
  const byPlayer = new Map();
  for (const entry of log.entries) {
    const playerName = entry.isLocal ? log.localPlayerName : entry.playerName;
    if (!byPlayer.has(playerName)) byPlayer.set(playerName, []);
    byPlayer.get(playerName).push(entry);
  }
  const rows = [...byPlayer.entries()].map(([playerName, entries]) => {
    let longestMs = 0;
    let longestEntry = null;
    let totalMs = 0;
    const active = [];
    for (const entry of entries) {
      const duration = durationMs(entry, now);
      totalMs += duration;
      if (duration > longestMs) {
        longestMs = duration;
        longestEntry = entry;
      }
      if (!entry.endedAt) active.push({ ...entry, elapsedMs: duration });
    }
    return {
      playerName,
      longestMs,
      longestPokemon: longestEntry?.pokemon ?? null,
      longestGymName: longestEntry?.gymName ?? null,
      totalMs,
      active: active.sort((left, right) => right.elapsedMs - left.elapsedMs),
    };
  });
  return rows.sort((left, right) => right.totalMs - left.totalMs
    || left.playerName.localeCompare(right.playerName));
}


// Exports only this device's own entries — "my leaderboard" — as a compact,
// versioned, human-readable text block a friend pastes into their own app.
// Always stamped with the *current* localPlayerName (see buildLeaderboard).
export function exportPlayerLog(log) {
  const lines = log.entries
    .filter((entry) => entry.isLocal)
    .map((entry) => [
      entry.id, entry.pokemon, entry.gymName, entry.startedAt, entry.endedAt ?? "", entry.coins ?? "",
    ].join("|"));
  return `${[`${EXPORT_HEADER}|${log.localPlayerName}`, ...lines].join("\n")}\n`;
}


// Parses a pasted block and merges it into `log`, upserting each entry by
// (playerName, id) so re-pasting the same or an updated block is idempotent
// — never duplicates, always reflects the latest paste. A collision against
// one of *your own* local entries (isLocal:true) is never applied — only
// this device can produce a local entry, so a matching id there is either
// your own export bouncing back or a hostile paste, not a real update.
// Fully validates before merging anything: a malformed paste throws
// DefenseLogError and leaves `log` untouched, it never partially imports or
// crashes.
export function importPlayerLog(log, text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new DefenseLogError("Nothing to import — paste a shared leaderboard block.", "empty_paste");
  const [header, ...entryLines] = lines;
  const [headerTag, ...headerRest] = header.split("|");
  const playerName = headerRest.join("|").trim();
  if (headerTag !== EXPORT_HEADER || !playerName || hasSeparator(playerName)) {
    throw new DefenseLogError(
      `Unrecognized share format — expected a first line like "${EXPORT_HEADER}|<player name>".`,
      "invalid_header",
    );
  }
  if (!entryLines.length) {
    throw new DefenseLogError("That leaderboard block has no entries to import.", "empty_import");
  }
  const parsedEntries = entryLines.map((line, index) => {
    const lineNumber = index + 2;
    const parts = line.split("|");
    if (parts.length !== 6) {
      throw new DefenseLogError(`Line ${lineNumber}: expected 6 fields, found ${parts.length}.`, "invalid_line");
    }
    const [id, pokemon, gymName, startedAt, endedAt, coinsRaw] = parts;
    if (!id) throw new DefenseLogError(`Line ${lineNumber}: missing entry id.`, "invalid_line");
    if (!pokemon) throw new DefenseLogError(`Line ${lineNumber}: missing Pokémon name.`, "invalid_line");
    if (!gymName) throw new DefenseLogError(`Line ${lineNumber}: missing gym name.`, "invalid_line");
    if (Number.isNaN(Date.parse(startedAt))) throw new DefenseLogError(`Line ${lineNumber}: invalid start time.`, "invalid_line");
    if (endedAt && Number.isNaN(Date.parse(endedAt))) throw new DefenseLogError(`Line ${lineNumber}: invalid end time.`, "invalid_line");
    if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
      throw new DefenseLogError(`Line ${lineNumber}: end time can't be before the start time.`, "invalid_line");
    }
    let coins = null;
    if (coinsRaw !== "") {
      // ponytail: require plain digits (no "1e3", no sign) and cap at
      // MAX_SAFE_INTEGER so a 21-digit paste can't round-trip through Number().
      if (!/^\d+$/.test(coinsRaw) || Number(coinsRaw) > Number.MAX_SAFE_INTEGER) {
        throw new DefenseLogError(`Line ${lineNumber}: coins must be a whole number.`, "invalid_line");
      }
      coins = Number(coinsRaw);
    }
    return { id, playerName, pokemon, gymName, startedAt, endedAt: endedAt || null, coins, isLocal: false };
  });
  // Local entry ids are the collision key, independent of playerName: only
  // this device can produce a local entry, and its playerName drifts with
  // renames while its id doesn't, so keying on the pair let a renamed-self
  // paste sneak past the guard and fork into a ghost duplicate.
  const localIds = new Set(log.entries.filter((entry) => entry.isLocal).map((entry) => entry.id));
  const byKey = new Map(log.entries.map((entry) => [`${entry.playerName}::${entry.id}`, entry]));
  const importedKeys = new Set();
  for (const entry of parsedEntries) {
    if (localIds.has(entry.id)) continue;
    const key = `${entry.playerName}::${entry.id}`;
    byKey.set(key, entry);
    importedKeys.add(key);
  }
  return { log: { ...log, entries: [...byKey.values()] }, playerName, importedCount: importedKeys.size };
}
