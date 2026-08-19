// Field Journal view: pure presentation over journal.js's already-computed
// data (loadJournal's entries/warnings, streakInfo, weeklyRecap) — same
// "no new math here" contract as views/trophy.js. This file owns turning
// {kind, at, detail} rows into English lines/glyphs and grouping them by
// local day; the honest counting itself lives in ../journal.js.
import { escapeHtml } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { todayDateISO } from "../today-tasks.js";

const RAID_OUTCOME_GLYPH = Object.freeze({ won: "🏆", lost: "💥" });
const KIND_GLYPH = Object.freeze({
  "instance-added": "➕",
  "gen-completed": "✅",
  visit: "📍",
  "quest-completed": "🎯",
});
const DEFAULT_GLYPH = "•";

function glyphFor(entry) {
  if (entry.kind === "raid-logged") return RAID_OUTCOME_GLYPH[entry.detail?.outcome] ?? DEFAULT_GLYPH;
  return KIND_GLYPH[entry.kind] ?? DEFAULT_GLYPH;
}

// The one place {kind, detail} becomes a sentence — a new journal kind needs
// a case here too. formId resolves through `forms` when available (so a
// special form like Zacian (Crowned Sword) shows its real display name);
// detail.name is the fallback for a dangling/unreleased formId, since a
// journal is a historical record and shouldn't drop a real past event just
// because the dex entry it pointed to disappeared.
function entryLine(entry, forms) {
  const { kind, detail } = entry;
  if (kind === "instance-added") {
    const name = forms?.[detail?.formId]?.name ?? detail?.name ?? "a Pokémon";
    const modifiers = [detail?.isShiny ? "shiny" : null, detail?.isHundo ? "hundo" : null].filter(Boolean);
    const prefix = modifiers.length ? `${modifiers.join(" ")} ` : "";
    const via = detail?.via ? ` via ${detail.via}` : "";
    return `Caught up: ${prefix}${name}${via}`;
  }
  if (kind === "gen-completed") return `Gen ${detail?.gen ?? "?"} completed!`;
  if (kind === "raid-logged") {
    const boss = detail?.bossName ?? "the boss";
    // Explicit outcomes only (review catch: a missing outcome rendered as
    // "Lost to" — fabricated detail).
    if (detail?.outcome === "won") return `Beat ${boss}`;
    if (detail?.outcome === "lost") return `Lost to ${boss}`;
    return `Raid: ${boss}`;
  }
  if (kind === "visit") return "Checked in";
  if (kind === "quest-completed") return `Quest done: ${detail?.label ?? "a quest"}`;
  return "Journal entry";
}

// NEVER round up: 0 stays 0, never a fabricated "1" for "well you're here
// now". Math.floor (not round) so a fractional/garbage value never inflates.
function streakHeaderHtml(streak) {
  const current = Math.max(0, Math.floor(Number(streak?.current) || 0));
  const best = Math.max(0, Math.floor(Number(streak?.best) || 0));
  const currentLine = current > 0
    ? `<p class="journal-streak-current"><span class="journal-flame" aria-hidden="true">🔥</span> ${current}-day streak</p>`
    : `<p class="journal-streak-current journal-streak-zero">No streak yet — it starts with today's visit.</p>`;
  return `<section class="journal-streak" aria-labelledby="journal-streak-title">
    <p class="status-kicker" id="journal-streak-title">Streak</p>
    ${currentLine}
    <p class="journal-streak-best">Best streak: ${best} day${best === 1 ? "" : "s"}</p>
  </section>`;
}

// Home-header chip form of the same streak fact — a 0-1 day streak is noise
// (everyone's on day 1 after their first visit), so it renders "" below 2,
// same honesty rule as streakHeaderHtml's zero state. Reuses .tl-now-chip
// (Home's own pill class, home.js "The timeline" divider) and the
// already-shipped .journal-flame glow rather than a new chip class.
export function streakChipHtml(streak) {
  const current = Math.max(0, Math.floor(Number(streak?.current) || 0));
  if (current < 2) return "";
  const best = Math.max(0, Math.floor(Number(streak?.best) || 0));
  return `<span class="tl-now-chip" title="Best streak: ${best} day${best === 1 ? "" : "s"}"><span class="journal-flame" aria-hidden="true">🔥</span> ${current}-day streak</span>`;
}

// Order here is also render order for the chip row.
const RECAP_CHIPS = Object.freeze([
  // saves first (review catch: manual catches counted for nothing, so a
  // 5-catch week rendered as "quiet" over its own timeline).
  { key: "saves", label: (n) => `${n} catch${n === 1 ? "" : "es"}` },
  { key: "scans", label: (n) => `${n} scan${n === 1 ? "" : "s"}` },
  { key: "hundos", label: (n) => `${n} hundo${n === 1 ? "" : "s"}` },
  { key: "shinies", label: (n) => `${n} ${n === 1 ? "shiny" : "shinies"}` },
  { key: "raidsWon", label: (n) => `${n} raid${n === 1 ? "" : "s"} won` },
  { key: "raidsLost", label: (n) => `${n} raid${n === 1 ? "" : "s"} lost` },
  { key: "gensCompleted", label: (n) => `${n} gen${n === 1 ? "" : "s"} completed` },
  { key: "quests", label: (n) => `${n} quest${n === 1 ? "" : "s"} done` },
]);

function recapCardHtml(recap) {
  const chips = RECAP_CHIPS
    .map((spec) => ({ spec, count: Math.max(0, Math.floor(Number(recap?.[spec.key]) || 0)) }))
    .filter(({ count }) => count > 0);
  const body = chips.length
    ? `<p class="journal-recap-lead">This week</p>
       <ul class="journal-recap-chips">${chips.map(({ spec, count }) => `<li><span class="status-chip">${escapeHtml(spec.label(count))}</span></li>`).join("")}</ul>`
    : `<p class="journal-recap-empty">A quiet week — the rotation's waiting.</p>`;
  return `<section class="journal-recap" aria-labelledby="journal-recap-title">
    <p class="status-kicker" id="journal-recap-title">Weekly recap</p>
    ${body}
  </section>`;
}

// Same rotation-window expiry rule as share-card.js's/home.js's own private
// liveRotationBosses/liveMaxBosses (endsAt runs through end-of-day, not up to
// midnight at the start) — neither is exported, so this is a small local
// copy rather than a new shared util for one extra caller.
// ponytail: duplicated 6-line filter, promote to a shared export if a third
// caller needs it.
function endOfDay(dateString) {
  // Local-calendar parse (tz fix, 2026-08-14 review catch): new Date("YYYY-MM-DD")
  // parses as UTC midnight, which west of UTC lands on the PREVIOUS local
  // day — a boss "through Aug 17" expired at Aug 16 23:59 local. Building
  // from parts pins the intended local calendar day.
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

// A derived future-week row (startsAt from the events feed) is not live yet.
function hasStarted(boss, now) {
  if (typeof boss?.startsAt !== "string" || Number.isNaN(Date.parse(boss.startsAt))) return true;
  const [year, month, day] = boss.startsAt.split("-").map(Number);
  return new Date(year, month - 1, day) <= now;
}

function liveBosses(currentBosses, now) {
  return (currentBosses?.bosses ?? []).filter((boss) => hasStarted(boss, now)
    && !(typeof boss?.endsAt === "string"
    && !Number.isNaN(Date.parse(boss.endsAt))
    && endOfDay(boss.endsAt) < now));
}

function raidQuickLogHtml(currentBosses, forms, now) {
  const bosses = liveBosses(currentBosses, now);
  if (!bosses.length) return "";
  const rows = bosses.map((boss) => {
    const form = forms?.[boss.formId];
    const name = form?.name ?? boss.formId;
    return `<div class="journal-raid-row">
      ${spriteHtml(boss.formId, forms ?? {}, name, form?.primary_type)}
      <span class="journal-raid-name">${escapeHtml(name)}</span>
      <button type="button" class="journal-raid-btn" data-action="journal-raid-log" data-journal-boss="${escapeHtml(boss.formId)}" data-journal-outcome="won">Won</button>
      <button type="button" class="journal-raid-btn" data-action="journal-raid-log" data-journal-boss="${escapeHtml(boss.formId)}" data-journal-outcome="lost">Lost</button>
    </div>`;
  }).join("");
  return `<section class="journal-raid-quicklog" aria-labelledby="journal-raid-title">
    <p class="status-kicker" id="journal-raid-title">Log a raid</p>
    ${rows}
  </section>`;
}

function dayHeaderLabel(dayKey, now) {
  if (dayKey === todayDateISO(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === todayDateISO(yesterday)) return "Yesterday";
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// entries arrive newest-first (loadJournal's own contract) so a Map keyed by
// first-seen day preserves that order across groups for free.
function groupByDay(entries, now) {
  const groups = new Map();
  for (const entry of entries ?? []) {
    if (typeof entry?.at !== "string" || Number.isNaN(Date.parse(entry.at))) continue;
    const dayKey = todayDateISO(new Date(entry.at));
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey).push(entry);
  }
  return [...groups.entries()].map(([dayKey, dayEntries]) => ({
    dayKey, label: dayHeaderLabel(dayKey, now), entries: dayEntries,
  }));
}

function timelineHtml(entries, forms, now) {
  const groups = groupByDay(entries, now);
  if (!groups.length) {
    return `<section class="journal-timeline" aria-labelledby="journal-timeline-title">
      <p class="status-kicker" id="journal-timeline-title">Timeline</p>
      <p class="journal-timeline-empty">Nothing logged yet — catches, raids, and gen completions land here.</p>
    </section>`;
  }
  const body = groups.map((group) => `<div class="journal-day-group">
    <p class="journal-day-header">${escapeHtml(group.label)}</p>
    <ul class="journal-day-entries">
      ${group.entries.map((entry) => `<li class="journal-entry"><span class="journal-entry-glyph" aria-hidden="true">${glyphFor(entry)}</span><span class="journal-entry-line">${escapeHtml(entryLine(entry, forms))}</span></li>`).join("")}
    </ul>
  </div>`).join("");
  return `<section class="journal-timeline" aria-labelledby="journal-timeline-title">
    <p class="status-kicker" id="journal-timeline-title">Timeline</p>
    ${body}
  </section>`;
}

function warningsHtml(warnings) {
  if (!warnings?.length) return "";
  return `<ul class="journal-warnings">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`;
}

export function renderJournalView({
  entries = [], streak = null, recap = null, warnings = [], currentBosses = null, forms = {}, now = new Date(),
} = {}) {
  return `<section class="journal-view" aria-labelledby="journal-view-title">
    <p class="status-kicker">Log</p>
    <h2 id="journal-view-title">Field Journal</h2>
    ${warningsHtml(warnings)}
    ${streakHeaderHtml(streak)}
    ${recapCardHtml(recap)}
    ${raidQuickLogHtml(currentBosses, forms, now)}
    ${timelineHtml(entries, forms, now)}
  </section>`;
}
