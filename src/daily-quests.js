// Daily quests (Home fun item): 2-3 small checkable to-dos generated fresh
// per local day from real state — "log today's raid", "keep the streak
// alive" — distinct from today-tasks.js's Today strip (time-boxed event
// nudges: a live Max hour, a rotation boss leaving). Quests are a checklist,
// not a countdown. Reuses collection.js's collectionProgress (gen-closer)
// and type-chart.js's weaknessesOf (catch-target) rather than re-deriving
// either; addedAt/kind-day matching mirrors journal.js's localDayKey pattern
// via today-tasks.js's exported todayDateISO.
import { collectionProgress, livingDexEntries } from "./collection.js";
import { weaknessesOf } from "./type-chart.js";
import { todayDateISO } from "./today-tasks.js";
import { escapeHtml } from "./views/home.js";

const MAX_QUESTS = 3;

// Deterministic pick, no Math.random: a small string hash of dateKey+salt so
// the same day always seeds the same choice, and different quest slots
// (catch-target vs a future pool member) don't collide on the same index.
function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function localDayKey(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? null : todayDateISO(date);
}

// currentBosses.endsAt is a bare "YYYY-MM-DD" (rotation runs through that
// local day) or null (indefinite/ongoing) — same shape today-tasks.js reads.
// Both dateKey and endsAt are YYYY-MM-DD, so plain string compare is exact.
function isLiveOn(endsAt, dateKey) {
  return endsAt == null || dateKey <= endsAt;
}

// A released, un-owned species relevant to today's live bosses' weaknesses
// (its own primary type would hit one of those bosses super-effectively),
// falling back to any un-owned species when no boss is live or none of the
// living dex matches. null once the living dex is complete.
function catchTargetQuest({ roster, forms, currentBosses, dateKey }) {
  const owned = new Set(roster?.ownedFormIds ?? []);
  const entries = livingDexEntries(forms).filter((entry) => !entry.formIds.some((id) => owned.has(id)));
  if (!entries.length) return null;

  const liveBossFormIds = (currentBosses?.bosses ?? [])
    .filter((boss) => isLiveOn(boss.endsAt, dateKey))
    .map((boss) => boss.formId);
  const weaknessTypes = new Set();
  for (const formId of liveBossFormIds) {
    const boss = forms?.[formId];
    if (!boss) continue;
    for (const { type } of weaknessesOf([boss.primary_type, boss.secondary_type])) weaknessTypes.add(type);
  }

  const relevant = entries.filter((entry) => weaknessTypes.has(entry.primaryType));
  const pool = relevant.length ? relevant : entries;
  const salt = relevant.length ? "catch-target-relevant" : "catch-target-random";
  const pick = pool[hashString(`${dateKey}:${salt}`) % pool.length];
  const label = relevant.length
    ? `Catch ${pick.name} (${pick.primaryType}) — hits today's boss weakness`
    : `Catch ${pick.name} — still missing from your living dex`;
  return { id: `catch-target-${pick.formId}`, label, kind: "catch-target" };
}

// A live boss exists today and no raid was logged today yet.
function raidLogQuest({ currentBosses, journal, dateKey }) {
  const liveBoss = (currentBosses?.bosses ?? []).some((boss) => isLiveOn(boss.endsAt, dateKey));
  if (!liveBoss) return null;
  const loggedToday = (journal?.entries ?? [])
    .some((entry) => entry.kind === "raid-logged" && localDayKey(entry.at) === dateKey);
  if (loggedToday) return null;
  return { id: "raid-log", label: "Log today's raid result", kind: "raid-log" };
}

// Roster has zero instances saved (addedAt) today.
function scanRosterQuest({ roster, dateKey }) {
  const savedToday = (roster?.instances ?? [])
    .some((instance) => localDayKey(instance.addedAt) === dateKey);
  if (savedToday) return null;
  return { id: "scan-roster", label: "Save at least one catch to your roster today", kind: "scan-roster" };
}

// journal.streak is the already-computed { current, best, lastVisit } shape
// app.js's ui.journal prop carries (journal.js streakInfo output) — this
// module never recomputes a streak from raw entries.
function streakKeeperQuest({ journal, dateKey }) {
  void dateKey; // no date math needed here — the caller's streak is already "as of today"
  const current = journal?.streak?.current ?? 0;
  if (current < 2) return null;
  return { id: "streak-keeper", label: `Keep the ${current}-day streak alive`, kind: "streak-keeper" };
}

// Nearest-to-done generation at 90%+ complete (and not already 100%).
function genCloserQuest({ roster, forms }) {
  const candidates = collectionProgress(forms, roster).byGeneration
    .map((bucket) => ({ ...bucket, remaining: bucket.total - bucket.caught }))
    .filter((bucket) => bucket.total > 0 && bucket.remaining > 0 && bucket.caught / bucket.total >= 0.9)
    .sort((left, right) => left.remaining - right.remaining || (left.gen ?? 0) - (right.gen ?? 0));
  const pick = candidates[0];
  if (!pick) return null;
  return {
    id: `gen-closer-${pick.gen}`,
    label: `Gen ${pick.gen} is ${pick.caught}/${pick.total} — ${pick.remaining} mark${pick.remaining === 1 ? "" : "s"} to go`,
    kind: "gen-closer",
  };
}

// Fixed priority order; only real (state-backed) quests emit, capped at
// MAX_QUESTS — same filter-then-slice shape as today-tasks.js's buildTodayTasks.
export function generateQuests({
  dateKey, roster = null, forms = {}, currentBosses = null, journal = null,
} = {}) {
  const rows = [
    raidLogQuest({ currentBosses, journal, dateKey }),
    streakKeeperQuest({ journal, dateKey }),
    scanRosterQuest({ roster, dateKey }),
    genCloserQuest({ roster, forms }),
    catchTargetQuest({ roster, forms, currentBosses, dateKey }),
  ].filter(Boolean);
  return rows.slice(0, MAX_QUESTS);
}

const QUEST_STATE_KEY = "pogo-daily-quests-state";

function readAllDays(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(QUEST_STATE_KEY) ?? "null");
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    return {};
  }
}

// { questId: true } for the given day, or {} if nothing's checked (or the
// stored payload is corrupt/legacy-shaped).
export function loadQuestState(storage, dateKey) {
  const day = readAllDays(storage)[dateKey];
  return (day && typeof day === "object" && !Array.isArray(day)) ? day : {};
}

// Single storage key, one day's payload at a time — every toggle prunes any
// other day out (a stray "yesterday" quest-state blob has nothing left to
// answer for once today exists).
export function toggleQuest(storage, dateKey, questId) {
  const dayState = { ...loadQuestState(storage, dateKey) };
  if (dayState[questId]) delete dayState[questId];
  else dayState[questId] = true;
  try {
    storage?.setItem?.(QUEST_STATE_KEY, JSON.stringify({ [dateKey]: dayState }));
  } catch {
    // Never throw — a completion checkmark is a nice-to-have, not a gate.
  }
  return dayState;
}

function questRowHtml(quest, done) {
  return `<li class="today-task-row${done ? " is-done" : ""}">
    <button type="button" class="today-check" data-action="quest-toggle" data-quest-id="${escapeHtml(quest.id)}" aria-pressed="${done}" aria-label="${done ? "Mark not done: " : "Mark done: "}${escapeHtml(quest.label)}"><span aria-hidden="true">${done ? "☑" : "☐"}</span></button>
    <p class="today-task-title">${escapeHtml(quest.label)}</p>
  </li>`;
}

export function renderDailyQuestsCard({ quests = [], state = {} } = {}) {
  const body = quests.length
    ? `<ul class="today-task-list daily-quests-list">${quests.map((quest) => questRowHtml(quest, Boolean(state[quest.id]))).join("")}</ul>`
    : `<p>No quests today — check back once there's something real to do.</p>`;
  return `<section class="fallback-section daily-quests-card" aria-labelledby="daily-quests-title">
    <p class="status-kicker">Today's quests</p>
    <h3 id="daily-quests-title">Daily quests</h3>
    ${body}
  </section>`;
}
