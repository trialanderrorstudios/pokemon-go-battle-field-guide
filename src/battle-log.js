// GBL battle log (Wave P lane P2, 2026-10-16): "Log a GBL match" — league,
// the 3 opponents faced, win/loss, and an optional lead — so "my meta"
// (battleLogFrequency) can feed team-finder.js's opponent weighting with
// what the operator is actually facing, not just PvPoke's open top 50.
// Storage shape mirrors medals.js: one key holds every profile's log,
// loaded fresh at render time (no ui-cached copy) exactly like
// medals.js's loadMedalState.
const STORAGE_KEY = "pogo-battle-log";
// Exported so backup.js can cap a merged log the same way a live log caps
// itself, instead of duplicating the number.
export const MAX_ENTRIES = 500;
// Exported so the view's "from N matches" label always describes the exact
// window battleLogFrequency actually used, instead of a hand-copied number
// that could drift from it (Fable review, 2026-10-16).
export const DEFAULT_FREQUENCY_LIMIT = 50;
const MAX_ID_LENGTH = 64;
const MAX_LEAGUE_LENGTH = 20;
const MAX_FORM_ID_LENGTH = 40;

export function loadAllBattleLogState(storage) {
  try {
    const all = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? "{}");
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

export function saveAllBattleLogState(storage, all) {
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function loadBattleLog(storage, profileId = "main") {
  return sanitizeBattleLog(loadAllBattleLogState(storage)[profileId]);
}

export function saveBattleLog(storage, profileId, entries) {
  const all = loadAllBattleLogState(storage);
  all[profileId] = entries;
  return saveAllBattleLogState(storage, all);
}

// Same "every acceptance rule here is also what a live edit must pass" rule
// as medals.js's sanitizeMedalState — used for a raw localStorage read AND
// an imported backup profile, so a corrupted/tampered entry can't ride in
// through either path. `validFormIds` (optional — backup.js's parse path
// passes it; the live store doesn't need it, every live entry already came
// from a real search pick) drops an entry whose opponents/lead include a
// formId that isn't a real form in this release, same honesty rule
// importRoster already applies to a backed-up roster. String fields are
// length-capped so an imported file can't smuggle in an oversized blob.
export function sanitizeBattleLog(raw, validFormIds = null) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" && entry.id ? entry.id.slice(0, MAX_ID_LENGTH) : null,
      ts: Number.isFinite(entry.ts) ? entry.ts : null,
      league: typeof entry.league === "string" ? entry.league.slice(0, MAX_LEAGUE_LENGTH) : null,
      opponents: Array.isArray(entry.opponents)
        ? entry.opponents.filter((formId) => typeof formId === "string" && formId).map((formId) => formId.slice(0, MAX_FORM_ID_LENGTH)).slice(0, 3)
        : [],
      win: Boolean(entry.win),
      lead: typeof entry.lead === "string" ? entry.lead.slice(0, MAX_FORM_ID_LENGTH) : null,
    }))
    .filter((entry) => entry.id && entry.ts !== null && entry.league && entry.opponents.length)
    .filter((entry) => !validFormIds || entry.opponents.every((formId) => validFormIds.has(formId)))
    .map((entry) => ({ ...entry, lead: entry.lead && entry.opponents.includes(entry.lead) ? entry.lead : null }))
    .slice(-MAX_ENTRIES);
}

export function addBattleLogEntry(entries, { league, opponents, win, lead = null, now = Date.now() }) {
  const trimmedOpponents = (opponents ?? []).slice(0, 3);
  const entry = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    ts: now,
    league,
    opponents: trimmedOpponents,
    win: Boolean(win),
    lead: lead && trimmedOpponents.includes(lead) ? lead : null,
  };
  return [...entries, entry].slice(-MAX_ENTRIES);
}

export function deleteBattleLogEntry(entries, id) {
  return entries.filter((entry) => entry.id !== id);
}

// "My meta": how often each opponent showed up in the last `limit` matches
// logged for a league — every logged opponent slot counts, not just leads.
// Feeds team-finder.js's opponentWeights as the battle-log source.
export function battleLogFrequency(entries, { league, limit = DEFAULT_FREQUENCY_LIMIT } = {}) {
  const recent = entries.filter((entry) => entry.league === league).slice(-limit);
  const counts = new Map();
  for (const entry of recent) {
    for (const formId of entry.opponents) counts.set(formId, (counts.get(formId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([formId, count]) => ({ formId, count }))
    .sort((a, b) => b.count - a.count || a.formId.localeCompare(b.formId));
}

// How often each opponent was logged as the LEAD specifically (not just any
// of the 3 faced), over the same last-`limit`-matches window. Feeds
// team-finder.js's leadMeta so Lead Mode weighs a lead the operator
// actually keeps running into, not only PvPoke's own top-30 ranking.
export function battleLogLeadFrequency(entries, { league, limit = DEFAULT_FREQUENCY_LIMIT } = {}) {
  const recent = entries.filter((entry) => entry.league === league && entry.lead).slice(-limit);
  const counts = new Map();
  for (const entry of recent) counts.set(entry.lead, (counts.get(entry.lead) ?? 0) + 1);
  return [...counts.entries()]
    .map(([formId, count]) => ({ formId, count }))
    .sort((a, b) => b.count - a.count || a.formId.localeCompare(b.formId));
}

// How many of this league's logged matches fall inside the same window
// battleLogFrequency/battleLogLeadFrequency actually used — the view's
// "from N matches" label must cite THIS, not the full (possibly larger)
// all-time count, or the label describes a window the frequency table
// didn't use.
export function battleLogWindowSize(entries, { league, limit = DEFAULT_FREQUENCY_LIMIT } = {}) {
  return Math.min(entries.filter((entry) => entry.league === league).length, limit);
}

// --- ephemeral "log a match" draft (not persisted, like swap.js's opponent query) ---

export function createLogDraft(league = "great") {
  return { league, opponents: [], win: null, lead: null, query: "" };
}

export function setLogDraftLeague(draft, league) {
  return { ...draft, league };
}

export function addLogDraftOpponent(draft, formId) {
  if (!formId || draft.opponents.length >= 3) return draft;
  return { ...draft, opponents: [...draft.opponents, formId] };
}

export function removeLogDraftOpponent(draft, formId) {
  const opponents = draft.opponents.filter((id) => id !== formId);
  return { ...draft, opponents, lead: draft.lead === formId ? null : draft.lead };
}

export function setLogDraftWin(draft, win) {
  return { ...draft, win: Boolean(win) };
}

export function setLogDraftLead(draft, formId) {
  return { ...draft, lead: draft.opponents.includes(formId) ? formId : draft.lead };
}

export function setLogDraftQuery(draft, query) {
  return { ...draft, query: String(query ?? "").slice(0, 60) };
}

export function canSubmitLogDraft(draft) {
  return draft.opponents.length === 3 && draft.win !== null;
}
