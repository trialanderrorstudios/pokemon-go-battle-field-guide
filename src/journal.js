// Field journal (fun item): append-only local log of what actually happened
// on this device — roster adds, gen completions, raid outcomes, and daily
// visits — powering the honest streak/weekly-recap fun items. Pure module
// over the same synchronous getItem/setItem storage interface group-store.js
// and today-tasks.js's check-offs already use; no IndexedDB needed for a
// small, capped log. Local-day math reuses today-tasks.js's todayDateISO
// convention rather than re-deriving YYYY-MM-DD parsing a second way.
import { todayDateISO } from "./today-tasks.js";

const JOURNAL_STORAGE_KEY = "pogo-field-journal";
const MAX_ENTRIES = 500;
const KINDS = new Set(["instance-added", "gen-completed", "raid-logged", "visit"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Shared shape check for one entry. Returns { entry } on success or
// { error } describing what's wrong — corrupt/hand-edited entries get
// warned-and-dropped on load rather than bricking the whole journal.
function normalizeEntry(raw) {
  if (!isPlainObject(raw)) return { error: "must be an object" };
  if (!KINDS.has(raw.kind)) return { error: "invalid kind" };
  if (typeof raw.at !== "string" || Number.isNaN(Date.parse(raw.at))) {
    return { error: "invalid at" };
  }
  if (!isPlainObject(raw.detail)) return { error: "missing detail" };
  return { entry: { kind: raw.kind, at: raw.at, detail: raw.detail } };
}

// Stored oldest-first (append order) under the hood; every public read
// returns newest-first, which is what a journal/recap UI actually wants.
export function loadJournal(storage) {
  let parsed;
  try {
    parsed = JSON.parse(storage?.getItem?.(JOURNAL_STORAGE_KEY) ?? "null");
  } catch {
    return { entries: [], warnings: ["stored journal was not valid JSON"] };
  }
  if (parsed === null) return { entries: [], warnings: [], bestStreak: 0 };
  // Payload is { entries, bestStreak } (high-water mark survives cap
  // eviction); a bare legacy array is accepted with bestStreak 0.
  const rawEntries = Array.isArray(parsed) ? parsed
    : (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) ? parsed.entries : null;
  if (rawEntries === null) return { entries: [], warnings: ["stored journal had an unknown shape"], bestStreak: 0 };
  const storedBest = Array.isArray(parsed) ? 0
    : (Number.isInteger(parsed.bestStreak) && parsed.bestStreak >= 0 ? parsed.bestStreak : 0);
  const entries = [];
  const warnings = [];
  rawEntries.forEach((raw, index) => {
    const result = normalizeEntry(raw);
    if (result.error) warnings.push(`entry ${index}: ${result.error}`);
    else entries.push(result.entry);
  });
  return { entries: entries.slice().reverse(), warnings, bestStreak: storedBest };
}

function persist(storage, entriesOldestFirst, bestStreak = 0) {
  // Never throws (hooks review catch: a QuotaExceededError here inside a
  // roster-save path would poison an already-successful save — the journal
  // is a bystander, never a gate). bestStreak rides the payload as a
  // high-water mark so cap eviction can't erase history (core review catch:
  // flooding past the 500-cap swallowed the old visit entries and "best"
  // silently fell).
  try {
    storage?.setItem?.(JOURNAL_STORAGE_KEY, JSON.stringify({ entries: entriesOldestFirst, bestStreak }));
  } catch {
    // Journal write failure is silent by design — the action that triggered
    // it already succeeded and must stay succeeded.
  }
}

function localDayKey(atISO) {
  return todayDateISO(new Date(atISO));
}

// entry.at is caller-passed ISO (no Date.now() inside this pure module) so
// callers control "now" the same way buildTodayTasks's now param does.
export function logJournalEntry(storage, { kind, at, detail }) {
  const result = normalizeEntry({ kind, at, detail });
  if (result.error) throw new TypeError(`invalid journal entry: ${result.error}`);
  const { entry } = result;
  const { entries: newestFirst, bestStreak: storedBest } = loadJournal(storage);
  const oldestFirst = newestFirst.slice().reverse();

  // Visits are capped at one-per-local-day (powers the streak); a second
  // visit logged the same day is a no-op, not a duplicate entry.
  if (entry.kind === "visit") {
    const day = localDayKey(entry.at);
    const alreadyVisitedToday = oldestFirst.some((e) => e.kind === "visit" && localDayKey(e.at) === day);
    if (alreadyVisitedToday) return newestFirst;
  }

  const next = [...oldestFirst, entry];
  const capped = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  const newestFirstNext = capped.slice().reverse();
  // Raise the persisted high-water mark from live entries before eviction
  // can forget them (streak history is append-only truth).
  const liveBest = streakInfo(newestFirstNext, new Date(entry.at)).best;
  persist(storage, capped, Math.max(storedBest, liveBest));
  return newestFirstNext;
}

function addDays(dayKey, delta) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  return todayDateISO(date);
}

// Consecutive local-calendar days with a "visit" entry. `current` only
// counts if the streak reaches today or yesterday (a visit today keeps
// yesterday's chain alive; skip two days and it's broken, not paused).
// `best` is the longest run anywhere in history. Expects entries in the
// newest-first shape loadJournal returns.
export function streakInfo(entries, now = new Date(), storedBest = 0) {
  const visitDays = [...new Set((entries ?? []).filter((e) => e.kind === "visit").map((e) => localDayKey(e.at)))].sort();
  const lastVisitEntry = (entries ?? []).find((e) => e.kind === "visit") ?? null;
  if (visitDays.length === 0) return { current: 0, best: Math.max(0, storedBest), lastVisit: null };

  let best = 1;
  let run = 1;
  for (let i = 1; i < visitDays.length; i += 1) {
    run = addDays(visitDays[i - 1], 1) === visitDays[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const today = todayDateISO(now);
  const yesterday = addDays(today, -1);
  const lastDay = visitDays[visitDays.length - 1];
  let current = 0;
  if (lastDay === today || lastDay === yesterday) {
    current = 1;
    for (let i = visitDays.length - 1; i > 0; i -= 1) {
      if (addDays(visitDays[i - 1], 1) !== visitDays[i]) break;
      current += 1;
    }
  }

  return { current, best: Math.max(best, storedBest), lastVisit: lastVisitEntry.at };
}

// `roster` is accepted (matching buildTodayTasks's param shape) but not
// currently read — recap counts come entirely from the journal, so there's
// nothing to cross-check against it yet.
// ponytail: unused param kept for signature parity; wire in when a recap
// row needs live-roster cross-checking.
export function weeklyRecap(entries, roster, now = new Date()) {
  const today = todayDateISO(now);
  const weekStartISO = addDays(today, -6);
  const inWindow = (e) => {
    const day = localDayKey(e.at);
    return day >= weekStartISO && day <= today;
  };
  const windowEntries = (entries ?? []).filter(inWindow);
  const instanceAdds = windowEntries.filter((e) => e.kind === "instance-added");
  const raids = windowEntries.filter((e) => e.kind === "raid-logged");

  return {
    weekStartISO,
    scans: instanceAdds.filter((e) => e.detail?.via === "scan").length,
    saves: instanceAdds.length,
    hundos: instanceAdds.filter((e) => e.detail?.isHundo === true).length,
    shinies: instanceAdds.filter((e) => e.detail?.isShiny === true).length,
    raidsWon: raids.filter((e) => e.detail?.outcome === "won").length,
    raidsLost: raids.filter((e) => e.detail?.outcome === "lost").length,
    gensCompleted: windowEntries.filter((e) => e.kind === "gen-completed").length,
  };
}
