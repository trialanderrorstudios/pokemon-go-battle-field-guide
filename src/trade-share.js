// Dex-gap trade compare v1 — honest, small share of "what species I own."
// This app has no roster-sync with the game (round 9's collection.js honesty
// note applies here too), so a friend's dex data only ever comes from a
// pasted export of theirs. The export deliberately carries species-level
// ownership only — dex number, plus quick-toggle shiny/lucky flags from
// collection.js — never exact roster detail (no CP, IV, moves, or catch
// dates). That keeps the paste small and keeps a friend's exact instance
// data private; only the species set is shared, and the share screen says so.
//
// Encoding: each of owned/shiny/lucky is a fixed-width bitset (one bit per
// dex number, 1..maxDex) packed to bytes and base64'd — small and exact
// regardless of how sparse or dense the set is, same "compact versioned text
// block" shape as gym-defense-log.js's leaderboard paste-share. Friends are
// stored as a flat named list, same pattern as friend-codes.js.
import { livingDexEntries, livingDexRows } from "./collection.js";

const STORAGE_KEY = "pogo-trade-friends";
export const EXPORT_HEADER = "PGDEX-v1";
const MAX_FRIENDS = 200;
const MAX_FRIEND_NAME_LENGTH = 40;
// ponytail: no real Pokédex will ever reach this — it's a sanity ceiling so a
// garbled/hostile paste can't force a huge bitset allocation.
const MAX_DEX = 20000;

function hasSeparator(value) {
  return typeof value !== "string" || /[|\r\n]/.test(value);
}

export class TradeShareError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "TradeShareError";
    this.code = code;
  }
}

// --- bitset compression, reused for owned/shiny/lucky alike ---

export function encodeDexBitset(dexSet, maxDex) {
  const bytes = new Uint8Array(Math.ceil(Math.max(Number(maxDex) || 0, 0) / 8));
  for (const dex of dexSet) {
    if (!Number.isInteger(dex) || dex < 1 || dex > maxDex) continue;
    const bit = dex - 1;
    bytes[bit >> 3] |= 1 << (bit % 8);
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeDexBitset(base64, maxDex) {
  let binary;
  try {
    binary = atob(String(base64 ?? ""));
  } catch {
    throw new TradeShareError("Malformed dex data — could not decode.", "invalid_bitset");
  }
  const set = new Set();
  for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
    const byte = binary.charCodeAt(byteIndex);
    if (!byte) continue;
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      if (!(byte & (1 << bitIndex))) continue;
      const dex = byteIndex * 8 + bitIndex + 1;
      if (dex <= maxDex) set.add(dex);
    }
  }
  return set;
}


// This device's own species/shiny/lucky sets, keyed by dex number, plus the
// highest dex number this bundle's data actually spans (the bitset width).
function myDexSets(forms, roster) {
  const rows = livingDexRows(forms, roster);
  const owned = new Set();
  const shiny = new Set();
  const lucky = new Set();
  let maxDex = 0;
  for (const row of rows) {
    if (row.dex > maxDex) maxDex = row.dex;
    if (row.caught) owned.add(row.dex);
    if (row.isShiny) shiny.add(row.dex);
    if (row.isLucky) lucky.add(row.dex);
  }
  return { owned, shiny, lucky, maxDex };
}


// "My dex summary" — a compact, versioned text block a friend pastes into
// their own app. Header carries the exporter's name and the dex width the
// bitsets below were packed at.
export function exportDexSummary(name, forms, roster) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || hasSeparator(trimmed)) {
    throw new TradeShareError('Your name can\'t be empty or contain "|".', "invalid_name");
  }
  const { owned, shiny, lucky, maxDex } = myDexSets(forms, roster);
  const header = `${EXPORT_HEADER}|${trimmed}|${maxDex}`;
  return `${[
    header,
    `O:${encodeDexBitset(owned, maxDex)}`,
    `S:${encodeDexBitset(shiny, maxDex)}`,
    `L:${encodeDexBitset(lucky, maxDex)}`,
  ].join("\n")}\n`;
}


// Parses (but does not store) a pasted dex-summary block. Fully validates
// before returning anything — a malformed paste always throws TradeShareError.
export function parseDexSummary(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new TradeShareError("Nothing to import — paste a shared dex summary block.", "empty_paste");
  const [header, ...rest] = lines;
  const headerParts = header.split("|");
  const [headerTag, rawName, rawMaxDex] = headerParts;
  if (headerTag !== EXPORT_HEADER || headerParts.length !== 3) {
    throw new TradeShareError(
      `Unrecognized share format — expected a first line like "${EXPORT_HEADER}|<name>|<dex count>".`,
      "invalid_header",
    );
  }
  const name = String(rawName ?? "").trim();
  if (!name || hasSeparator(name)) {
    throw new TradeShareError("Unrecognized share format — missing a trainer name.", "invalid_header");
  }
  if (!/^\d+$/.test(rawMaxDex ?? "")) {
    throw new TradeShareError("Unrecognized share format — invalid dex count.", "invalid_header");
  }
  const maxDex = Number(rawMaxDex);
  if (maxDex < 1 || maxDex > MAX_DEX) {
    throw new TradeShareError(`Dex count must be between 1 and ${MAX_DEX}.`, "invalid_header");
  }
  const byTag = new Map();
  for (const line of rest) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) throw new TradeShareError(`Malformed line: "${line}".`, "invalid_line");
    byTag.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
  }
  if (!byTag.has("O")) throw new TradeShareError("That dex summary is missing its owned-species data.", "missing_owned");
  return {
    name,
    maxDex,
    owned: decodeDexBitset(byTag.get("O"), maxDex),
    shiny: byTag.has("S") ? decodeDexBitset(byTag.get("S"), maxDex) : new Set(),
    lucky: byTag.has("L") ? decodeDexBitset(byTag.get("L"), maxDex) : new Set(),
  };
}


function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `trade-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validFriendRecord(entry) {
  return entry && typeof entry === "object"
    && typeof entry.id === "string" && Boolean(entry.id)
    && typeof entry.name === "string" && Boolean(entry.name)
    && Number.isInteger(entry.maxDex) && entry.maxDex >= 1
    && Array.isArray(entry.owned) && Array.isArray(entry.shiny) && Array.isArray(entry.lucky)
    && typeof entry.importedAt === "string" && !Number.isNaN(Date.parse(entry.importedAt));
}

export function loadTradeFriends(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validFriendRecord);
  } catch {
    return [];
  }
}

function saveTradeFriends(storage, friends) {
  const safe = (Array.isArray(friends) ? friends : []).filter(validFriendRecord).slice(0, MAX_FRIENDS);
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Storage can legitimately be unavailable — same tolerance as
    // friend-codes.js/gym-defense-log.js.
  }
  return safe;
}

// Imports a pasted dex summary and upserts it into the friend list, keyed by
// (trimmed) name — re-pasting the same friend's updated summary replaces
// their record in place instead of duplicating it, same idempotent-import
// discipline as gym-defense-log.js's importPlayerLog.
export function importFriendSummary(storage, text) {
  const parsed = parseDexSummary(text);
  const existing = loadTradeFriends(storage);
  const previous = existing.find((entry) => entry.name === parsed.name);
  const record = {
    id: previous?.id ?? randomId(),
    name: parsed.name.slice(0, MAX_FRIEND_NAME_LENGTH),
    maxDex: parsed.maxDex,
    owned: [...parsed.owned].sort((left, right) => left - right),
    shiny: [...parsed.shiny].sort((left, right) => left - right),
    lucky: [...parsed.lucky].sort((left, right) => left - right),
    importedAt: new Date().toISOString(),
  };
  const next = [...existing.filter((entry) => entry.name !== parsed.name), record];
  return { friends: saveTradeFriends(storage, next), friend: record };
}

export function removeTradeFriend(storage, id) {
  return saveTradeFriends(storage, loadTradeFriends(storage).filter((entry) => entry.id !== id));
}


// Trade-night candidates: species this device owns that a friend's imported
// summary doesn't (you could trade those away), and species the friend owns
// that this device doesn't (you could receive them). Comparison is strictly
// from each side's imported dex summary — nothing here estimates or assumes
// what a friend owns beyond their last paste, and rows for a dex number this
// bundle's data doesn't recognize (e.g. a friend on a newer release) are
// dropped rather than guessed at.
export function tradeComparison(forms, roster, friend) {
  const mine = myDexSets(forms, roster);
  const bySpeciesDex = new Map(livingDexEntries(forms).map((entry) => [entry.dex, entry]));
  const friendOwned = new Set(friend?.owned ?? []);
  const toRows = (dexNumbers) => dexNumbers
    .map((dex) => bySpeciesDex.get(dex))
    .filter(Boolean)
    .sort((left, right) => left.dex - right.dex)
    .map((entry) => ({ dex: entry.dex, name: entry.name, region: entry.region }));
  return {
    friendName: friend?.name ?? "",
    friendImportedAt: friend?.importedAt ?? null,
    youHaveTheyLack: toRows([...mine.owned].filter((dex) => !friendOwned.has(dex))),
    theyHaveYouLack: toRows([...friendOwned].filter((dex) => !mine.owned.has(dex))),
  };
}
