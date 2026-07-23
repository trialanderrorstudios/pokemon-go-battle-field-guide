// Trainer friend codes: the player's own 12-digit code (validated, shown as
// a scannable QR) plus a named list of friends' codes. Manual entry only —
// Pokemon GO does not expose friend codes to third-party apps. Everything
// here stays on this device (localStorage), same pattern as
// resource-inventory.js/storage.js's trainerProfile.
import qrcodeFactory from "./vendor/qrcode-generator.js";
import { isPlainObject } from "./storage.js";

const MY_CODE_KEY = "pogo-friend-code";
const FRIENDS_KEY = "pogo-friend-codes";
const MAX_FRIEND_NAME_LENGTH = 40;
const MAX_FRIENDS = 500;

// In-game friend codes are always exactly 12 digits (Menu > Friends > Add
// Friend). Any other length or non-digit character is not a real code.
export function normalizeFriendCode(raw) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 12);
}

export function isValidFriendCode(code) {
  return /^\d{12}$/.test(code);
}

// "0000 0000 0000" — matches how the game itself displays a friend code.
export function formatFriendCode(code) {
  const digits = normalizeFriendCode(code);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function loadMyFriendCode(storage) {
  const raw = storage?.getItem?.(MY_CODE_KEY) ?? "";
  return isValidFriendCode(raw) ? raw : "";
}

// ponytail: only ever persists "" (explicit clear) or a fully valid 12-digit
// code — never a partial in-progress edit, so a half-typed correction can't
// clobber an already-saved code.
export function saveMyFriendCode(storage, raw) {
  const digits = normalizeFriendCode(raw);
  const safe = digits === "" || isValidFriendCode(digits) ? digits : loadMyFriendCode(storage);
  try {
    storage?.setItem?.(MY_CODE_KEY, safe);
  } catch {
    // Storage can legitimately be unavailable — the value still applies for
    // this session, it just won't persist to the next visit.
  }
  return safe;
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `friend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validFriendEntry(entry) {
  return isPlainObject(entry) && typeof entry.id === "string" && Boolean(entry.id)
    && typeof entry.name === "string" && isValidFriendCode(entry.code);
}

export function loadFriendList(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(FRIENDS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validFriendEntry).map((entry) => ({
      id: entry.id,
      name: entry.name.trim().slice(0, MAX_FRIEND_NAME_LENGTH),
      code: entry.code,
    }));
  } catch {
    return [];
  }
}

function saveFriendList(storage, list) {
  const safe = (Array.isArray(list) ? list : []).filter(validFriendEntry).slice(0, MAX_FRIENDS);
  try {
    storage?.setItem?.(FRIENDS_KEY, JSON.stringify(safe));
  } catch {
    // Same tolerance as saveMyFriendCode above.
  }
  return safe;
}

export class FriendCodeError extends Error {
  constructor(message) {
    super(message);
    this.name = "FriendCodeError";
  }
}

function friendName(name) {
  return String(name ?? "").trim().slice(0, MAX_FRIEND_NAME_LENGTH) || "Unnamed friend";
}

export function addFriend(storage, { name, code } = {}) {
  const digits = normalizeFriendCode(code);
  if (!isValidFriendCode(digits)) throw new FriendCodeError("Friend code must be exactly 12 digits.");
  const existing = loadFriendList(storage);
  if (existing.some((entry) => entry.code === digits)) {
    throw new FriendCodeError("That friend code is already saved.");
  }
  const entry = { id: randomId(), name: friendName(name), code: digits };
  return saveFriendList(storage, [...existing, entry]);
}

export function updateFriend(storage, id, { name, code } = {}) {
  const digits = normalizeFriendCode(code);
  if (!isValidFriendCode(digits)) throw new FriendCodeError("Friend code must be exactly 12 digits.");
  const existing = loadFriendList(storage);
  if (existing.some((entry) => entry.id !== id && entry.code === digits)) {
    throw new FriendCodeError("That friend code is already saved.");
  }
  const next = existing.map((entry) => (
    entry.id === id ? { ...entry, name: friendName(name), code: digits } : entry
  ));
  return saveFriendList(storage, next);
}

export function removeFriend(storage, id) {
  return saveFriendList(storage, loadFriendList(storage).filter((entry) => entry.id !== id));
}

// QR version 1 (21x21) at error-correction level M holds up to 34 numeric
// digits — comfortably fits the fixed 12-digit code, so no version/level
// auto-selection is needed. Returns a size x size grid of booleans (true =
// dark module), or null for anything that isn't a valid code.
export function friendCodeQrMatrix(code) {
  if (!isValidFriendCode(code)) return null;
  const qr = qrcodeFactory(1, "M");
  qr.addData(code, "Numeric");
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_row, row) => (
    Array.from({ length: size }, (_col, col) => qr.isDark(row, col))
  ));
}
