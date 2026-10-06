// Full-device backup/restore: one versioned JSON envelope bundling every
// local store this app currently persists as user data — roster, gym
// defense log, text size, theme, drill streaks, and thumbs-up/down feedback.
// No secrets exist anywhere in this app's storage — every field here is
// Pokémon ownership, manual gym-log entries, display prefs, or drill/feedback
// stats — so the exported file is safe to AirDrop, email, or paste as text.
// The gym-geo coordinate cache (gym-availability.js) is deliberately excluded:
// it's a rebuildable geolocation cache, not user-entered data, and it isn't
// keyed by a single storage key so it doesn't fit this envelope shape.
//
// Validation reuses each store's own normalizer (storage.js's importRoster,
// gym-defense-log.js's loadDefenseLog, drill.js's loadDrillStats,
// feedback.js's loadFeedback) instead of re-describing their shapes here, so
// a change to any schema can't silently drift out of sync with backup.js.
import { ROSTER_SCHEMA, isPlainObject, importRoster } from "./storage.js";
import { loadDefenseLog } from "./gym-defense-log.js";
import { loadDrillStats } from "./drill.js";
import { loadFeedback } from "./feedback.js";
import { sanitizeMedalState } from "./medals.js";
import { TEXT_SIZES } from "./text-size.js";
import { THEMES } from "./theme.js";

export const BACKUP_FORMAT_VERSION = 1;
// Required: every backup must have these or the file is rejected.
const REQUIRED_PAYLOAD_FIELDS = new Set(["roster", "defenseLog", "textSize", "theme"]);
// Recognized: required fields plus optional ones added after format version 1
// shipped. Optional so older exported backups (which predate drillStats/
// feedback) still restore cleanly — loadDrillStats/loadFeedback already
// default missing/malformed input to empty stats.
// `profiles` (2026-10-05) carries every other profile's roster plus which one
// was active at export; `roster` stays the active profile's, so an app that
// predates profiles still restores the roster it would have before.
// `medals` (2026-10-06) is the raw pogo-medals dict, already keyed by every
// profile id in one object, so unlike `profiles` it needs no per-profile
// unpacking to round-trip every profile's medal/level progress.
const KNOWN_PAYLOAD_FIELDS = new Set([...REQUIRED_PAYLOAD_FIELDS, "drillStats", "feedback", "profiles", "medals"]);
const TEXT_SIZE_SET = new Set(TEXT_SIZES);
const THEME_SET = new Set(THEMES);

const LAST_BACKUP_KEY = "pogo-last-backup-at";
const BACKUP_SNOOZE_KEY = "pogo-backup-nudge-snoozed-until";
const NUDGE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days


export class BackupImportError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "BackupImportError";
    this.code = code;
  }
}


// Builds the envelope object (not yet stringified) from live app state.
// Round-8/9 stores (profile/stocks/weather/staleness) aren't implemented in
// this app yet — when they land, add their key here and to
// KNOWN_PAYLOAD_FIELDS/mergeBackupPayload; anything else unrecognized in an
// imported file is preserved opaquely (see parseBackupEnvelope's `extra`).
export function buildBackupEnvelope({
  roster, defenseLog, textSize, theme, appShellRevision,
  drillStats = { currentStreak: 0, bestStreak: 0 }, feedback = [], profiles = null, medals = {},
  now = () => new Date().toISOString(),
}) {
  const payload = { roster, defenseLog, textSize, theme, drillStats, feedback, medals };
  if (profiles) payload.profiles = profiles;
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now(),
    appShellRevision: appShellRevision ?? null,
    payload,
  };
}

// Every profile's roster keyed by profile id, from a parsed payload. A backup
// without a profiles block maps its one roster to `fallbackActiveId` — the
// profile on screen at restore time, which is exactly how such a backup
// restored before profiles existed.
export function backupRostersByProfile(payload, fallbackActiveId) {
  const activeId = payload.profiles?.index?.activeId ?? fallbackActiveId;
  return { activeId, index: payload.profiles?.index ?? null, rosters: { ...(payload.profiles?.rosters ?? {}), [activeId]: payload.roster } };
}

export function mergeProfileRoster(current, imported) {
  return mergeRoster(current, imported);
}


export function stableBackupJson(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}


// Validates and normalizes a pasted/uploaded backup file. Pure: never
// touches any store, so a thrown BackupImportError leaves every store
// untouched — the caller only writes after this (and the merge/replace step
// below) succeed. `validFormIds` is required so roster contents get the same
// exact-form-id check a plain roster import gets.
export async function parseBackupEnvelope(text, validFormIds) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupImportError("That file isn't valid JSON.", "invalid_json");
  }
  if (!isPlainObject(raw)) {
    throw new BackupImportError("A backup file must be a JSON object.", "invalid_envelope");
  }
  if (raw.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupImportError(
      `Unsupported backup format ${JSON.stringify(raw.formatVersion)}; expected ${BACKUP_FORMAT_VERSION}.`,
      "unsupported_format",
    );
  }
  if (typeof raw.exportedAt !== "string" || Number.isNaN(Date.parse(raw.exportedAt))) {
    throw new BackupImportError("Backup exportedAt must be an ISO date string.", "invalid_envelope");
  }
  if (!isPlainObject(raw.payload)) {
    throw new BackupImportError("Backup payload must be a JSON object.", "invalid_envelope");
  }
  const missing = [...REQUIRED_PAYLOAD_FIELDS].filter((key) => !Object.hasOwn(raw.payload, key));
  if (missing.length) {
    throw new BackupImportError(`Backup is missing required data: ${missing.join(", ")}.`, "partial_payload");
  }
  let roster;
  try {
    const noopStore = { async replace() {} };
    roster = await importRoster(raw.payload.roster, validFormIds, noopStore);
  } catch (error) {
    throw new BackupImportError(`Backup roster is invalid: ${error.message}`, "invalid_roster");
  }
  const defenseLogPayload = raw.payload.defenseLog;
  if (!isPlainObject(defenseLogPayload) || !Array.isArray(defenseLogPayload.entries)) {
    throw new BackupImportError("Backup defense log must be an object with an entries array.", "invalid_defense_log");
  }
  const defenseLog = loadDefenseLog({ getItem: () => JSON.stringify(defenseLogPayload) });
  if (!TEXT_SIZE_SET.has(raw.payload.textSize)) {
    throw new BackupImportError("Backup textSize must be S, M, or L.", "invalid_text_size");
  }
  if (!THEME_SET.has(raw.payload.theme)) {
    throw new BackupImportError("Backup theme must be auto, light, or dark.", "invalid_theme");
  }
  // drillStats/feedback are optional (missing on pre-existing backups made
  // before these stores were added). loadDrillStats/loadFeedback already
  // default missing or malformed input to empty stats, so absence here is
  // never an error — just treated as "no drill/feedback history in this file".
  let profiles = null;
  if (raw.payload.profiles !== undefined) {
    const block = raw.payload.profiles;
    if (!isPlainObject(block) || !isPlainObject(block.index) || !Array.isArray(block.index.profiles) || !isPlainObject(block.rosters)) {
      throw new BackupImportError("Backup profiles block is malformed.", "invalid_profiles");
    }
    const rosters = {};
    for (const [id, value] of Object.entries(block.rosters)) {
      try {
        rosters[id] = await importRoster(value, validFormIds, { async replace() {} });
      } catch (error) {
        throw new BackupImportError(`Backup roster for profile ${id} is invalid: ${error.message}`, "invalid_profiles");
      }
    }
    profiles = { index: block.index, rosters };
  }
  const drillStats = loadDrillStats({ getItem: () => JSON.stringify(raw.payload.drillStats ?? null) });
  const feedback = loadFeedback({ getItem: () => JSON.stringify(raw.payload.feedback ?? []) });
  // Optional (missing on pre-2026-10-06 backups). Each profile is normalized
  // through sanitizeMedalState — same "trust each store's own normalizer"
  // rule as drillStats/feedback above — so a malformed/tampered backup
  // file can't inject NaN counts, junk task keys, or an absurd typePlatinums
  // into a later merge/replace.
  const rawMedals = isPlainObject(raw.payload.medals) ? raw.payload.medals : {};
  const medals = Object.fromEntries(
    Object.entries(rawMedals).map(([profileId, state]) => [profileId, sanitizeMedalState(state)]),
  );
  // Anything beyond the known fields is a future store this build of the app
  // doesn't understand yet. JSON.parse already guarantees these are plain
  // JSON values, so they're carried through this parse step rather than
  // dropped here — but nothing downstream persists them: app.js's restore
  // handler rebuilds `current` fresh from live stores each time (no `extra`
  // key), so mergeBackupPayload/replaceBackupPayload's `extra` output is
  // never written to storage. Restoring an older build's backup onto a
  // newer app therefore still loses that newer app's unknown fields today;
  // wiring `extra` into an actual persisted slot is deferred until a real
  // future store exists to round-trip it into.
  const extra = Object.fromEntries(
    Object.entries(raw.payload).filter(([key]) => !KNOWN_PAYLOAD_FIELDS.has(key)),
  );
  return {
    formatVersion: raw.formatVersion,
    exportedAt: raw.exportedAt,
    appShellRevision: raw.appShellRevision ?? null,
    payload: {
      roster, defenseLog, textSize: raw.payload.textSize, theme: raw.payload.theme, drillStats, feedback, medals, extra,
      ...(profiles ? { profiles } : {}),
    },
  };
}


// Small preview summary for the restore confirmation screen — counts only,
// no PII, safe to render before the user commits to merge/replace.
export function summarizeBackup(envelope) {
  return {
    exportedAt: envelope.exportedAt,
    appShellRevision: envelope.appShellRevision,
    ownedFormCount: envelope.payload.roster.ownedFormIds.length,
    instanceCount: envelope.payload.roster.instances.length,
    defenseLogEntryCount: envelope.payload.defenseLog.entries.length,
    drillBestStreak: envelope.payload.drillStats?.bestStreak ?? 0,
    feedbackEntryCount: envelope.payload.feedback?.length ?? 0,
  };
}


// Union two id-keyed lists, keeping whichever copy of a colliding id is
// newer per `timestampOf`. Shared by roster instances (keyed on addedAt) and
// defense log entries (keyed on endedAt ?? startedAt). On an exact tie, the
// current device's copy wins (imported must be strictly newer to replace
// it) — an instance's addedAt never changes on edit (app.js's save-instance
// keeps the original id+addedAt), so re-merging an older backup of the same
// device must not resurrect its stale fields over edits made since export.
function unionNewestById(currentList, importedList, timestampOf) {
  const byId = new Map(currentList.map((item) => [item.id, item]));
  for (const item of importedList) {
    const existing = byId.get(item.id);
    if (!existing || (Date.parse(timestampOf(item)) || 0) > (Date.parse(timestampOf(existing)) || 0)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}


function mergeRoster(current, imported) {
  const ownedFormIds = [...new Set([...(current.ownedFormIds ?? []), ...(imported.ownedFormIds ?? [])])].sort();
  const currentCounts = current.ownedFormCounts ?? {};
  const importedCounts = imported.ownedFormCounts ?? {};
  // ponytail: counts have no per-value timestamp to compare, so a colliding
  // formId keeps the higher count — merging two devices should never lose
  // owned copies either device already knew about.
  const ownedFormCounts = Object.fromEntries(
    ownedFormIds.map((formId) => [formId, Math.max(currentCounts[formId] ?? 0, importedCounts[formId] ?? 0) || 1]),
  );
  const favorites = [...new Set([...(current.favorites ?? []), ...(imported.favorites ?? [])])].sort();
  const instances = unionNewestById(current.instances ?? [], imported.instances ?? [], (row) => row.addedAt);
  // Schema-3 collection flags (shiny/lucky owned sets): same never-lose-data
  // rule as ownedFormIds — union both devices' sets.
  const shinyOwnedFormIds = [...new Set([...(current.shinyOwnedFormIds ?? []), ...(imported.shinyOwnedFormIds ?? [])])].sort();
  const luckyOwnedFormIds = [...new Set([...(current.luckyOwnedFormIds ?? []), ...(imported.luckyOwnedFormIds ?? [])])].sort();
  return {
    schemaVersion: ROSTER_SCHEMA,
    ownedFormIds,
    ownedFormCounts,
    favorites,
    shinyOwnedFormIds,
    luckyOwnedFormIds,
    // Preferences (last task, PvP overrides, etc.) are an opaque blob with
    // no per-key timestamp either; the imported side wins per top-level key
    // since restoring is the explicit action just taken.
    preferences: { ...(current.preferences ?? {}), ...(imported.preferences ?? {}) },
    instances,
  };
}


function mergeDefenseLog(current, imported) {
  const entries = unionNewestById(
    current.entries ?? [],
    imported.entries ?? [],
    (entry) => entry.endedAt ?? entry.startedAt,
  );
  // Keep this device's own player name identity rather than the backup's.
  return { schemaVersion: current.schemaVersion, localPlayerName: current.localPlayerName, entries };
}


// Streaks have no per-value timestamp either (same as ownedFormCounts) — a
// merge should never lose a streak either device already reached, so keep
// the higher of each.
function mergeDrillStats(current, imported) {
  return {
    currentStreak: Math.max(current?.currentStreak ?? 0, imported?.currentStreak ?? 0),
    bestStreak: Math.max(current?.bestStreak ?? 0, imported?.bestStreak ?? 0),
  };
}


// Feedback entries have no id, just a (surface, formId, verdict, ts) tuple —
// union by exact-duplicate removal instead of unionNewestById's id keying.
// ponytail: doesn't re-enforce feedback.js's 500-entry cap; the next
// recordFeedback call re-trims via its own slice(-MAX_ENTRIES), so a rare
// merge overshoot self-heals instead of needing the cap duplicated here.
function mergeFeedback(current, imported) {
  const seen = new Set();
  const merged = [];
  for (const entry of [...(current ?? []), ...(imported ?? [])]) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.sort((left, right) => left.ts - right.ts);
}


// One profile's medal state has the same no-per-value-timestamp shape as
// drillStats/ownedFormCounts above: never lose progress either device
// already recorded, so counts/typePlatinums/xp keep the higher value and a
// completed task stays completed. targets are a user override with no
// timestamp either, so (like roster.preferences) the imported side wins per
// key on merge — restoring is the explicit action just taken.
//
// Both sides are re-sanitized here, not just trusted from parseBackupEnvelope
// above: `current` comes straight from live localStorage (loadAllMedalState),
// which has never been through that normalizer, and sanitizeMedalState(null)
// / sanitizeMedalState(undefined) return safe empty state instead of
// throwing — a plain `current = {}` default parameter does NOT catch a
// stored `null` entry (defaults only trigger on `undefined`), which used to
// throw reading `current.counts` on a corrupted pogo-medals record.
function mergeMedalState(current, imported) {
  const safeCurrent = sanitizeMedalState(current);
  const safeImported = sanitizeMedalState(imported);
  const counts = { ...safeCurrent.counts };
  for (const [name, value] of Object.entries(safeImported.counts)) {
    counts[name] = Math.max(counts[name] ?? 0, value);
  }
  const tasks = { ...safeCurrent.tasks };
  for (const [key, done] of Object.entries(safeImported.tasks)) {
    tasks[key] = Boolean(safeCurrent.tasks[key]) || done;
  }
  const xp = safeCurrent.xp === null && safeImported.xp === null
    ? null
    : Math.max(safeCurrent.xp ?? 0, safeImported.xp ?? 0);
  return {
    counts,
    targets: { ...safeCurrent.targets, ...safeImported.targets },
    typePlatinums: Math.max(safeCurrent.typePlatinums, safeImported.typePlatinums),
    tasks,
    xp,
  };
}


// medals is the raw pogo-medals dict (every profile id -> state) — merge
// every profile id present on either side instead of just the active one.
function mergeAllMedals(current, imported) {
  const safeCurrent = isPlainObject(current) ? current : {};
  const safeImported = isPlainObject(imported) ? imported : {};
  const merged = {};
  for (const profileId of new Set([...Object.keys(safeCurrent), ...Object.keys(safeImported)])) {
    merged[profileId] = mergeMedalState(safeCurrent[profileId], safeImported[profileId]);
  }
  return merged;
}


// Replace overwrites, but only for profile ids the backup actually carries —
// a profile this backup never knew about (a pre-medals backup, which carries
// none at all, or a profile added to this device after export) keeps its
// current medals untouched. Mirrors the "absent profile rosters are
// preserved" rule the restore handler already applies to rosters
// (app.js's backup-restore-merge/replace profile loop skips any profile id
// not present in the backup). Every carried-over profile is re-sanitized —
// same reasoning as mergeMedalState above.
function replaceAllMedals(current, imported) {
  const safeCurrent = isPlainObject(current) ? current : {};
  const safeImported = isPlainObject(imported) ? imported : {};
  const merged = { ...safeCurrent };
  for (const [profileId, state] of Object.entries(safeImported)) {
    merged[profileId] = sanitizeMedalState(state);
  }
  return merged;
}


// Combines a currently-loaded app state with a parsed backup's payload.
// textSize/theme are per-device ergonomics, not shared data — merge leaves
// them as this device already has them; only replaceBackupPayload changes
// them.
export function mergeBackupPayload(current, imported) {
  return {
    roster: mergeRoster(current.roster, imported.roster),
    defenseLog: mergeDefenseLog(current.defenseLog, imported.defenseLog),
    textSize: current.textSize,
    theme: current.theme,
    drillStats: mergeDrillStats(current.drillStats, imported.drillStats),
    feedback: mergeFeedback(current.feedback, imported.feedback),
    medals: mergeAllMedals(current.medals, imported.medals),
    extra: { ...(current.extra ?? {}), ...(imported.extra ?? {}) },
  };
}


// Full overwrite: every store becomes exactly what the backup says — except
// medals, which replace per-profile-id (see replaceAllMedals above): a
// profile the backup doesn't mention keeps what it already had rather than
// being wiped to empty. `current` is optional for callers that genuinely
// have nothing to preserve (e.g. restoring onto a blank device).
export function replaceBackupPayload(imported, current = {}) {
  return {
    roster: imported.roster,
    defenseLog: imported.defenseLog,
    textSize: imported.textSize,
    theme: imported.theme,
    drillStats: imported.drillStats ?? { currentStreak: 0, bestStreak: 0 },
    feedback: imported.feedback ?? [],
    medals: replaceAllMedals(current.medals, imported.medals),
    extra: imported.extra ?? {},
  };
}


export function recordBackupNow(storage, now = Date.now()) {
  try {
    storage?.setItem?.(LAST_BACKUP_KEY, String(now));
  } catch {
    // Storage can legitimately be unavailable — the nudge just won't
    // remember this backup for next visit.
  }
}


export function snoozeBackupNudge(storage, now = Date.now()) {
  try {
    storage?.setItem?.(BACKUP_SNOOZE_KEY, String(now + NUDGE_INTERVAL_MS));
  } catch {
    // See recordBackupNow.
  }
}


// Shown on More when the user has never backed up, or it's been 30+ days
// since the last backup/restore/import — unless they explicitly snoozed it.
export function shouldShowBackupNudge(storage, now = Date.now()) {
  const snoozedUntil = Number(storage?.getItem?.(BACKUP_SNOOZE_KEY) ?? 0);
  if (Number.isFinite(snoozedUntil) && snoozedUntil > 0 && now < snoozedUntil) return false;
  const lastBackupAt = Number(storage?.getItem?.(LAST_BACKUP_KEY) ?? 0);
  if (!lastBackupAt) return true;
  return now - lastBackupAt >= NUDGE_INTERVAL_MS;
}
