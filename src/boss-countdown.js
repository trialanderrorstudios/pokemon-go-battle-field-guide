// Boss countdown chips (Home briefing) — bosses leaving the rotation within
// 7 days, with an honest readiness read: does the roster already own a
// ranked-attacker counter for a type this boss is weak to? Composes existing
// machinery only:
//   weakness types      -> type-chart.js's weaknessesOf (no second effectiveness copy)
//   owned-counter check -> party-optimizer.js's buildParty (same ranked-row +
//                          moveset + CP-scaling logic the "bring these" card uses)
//   local-day math       -> journal.js/home.js's part-wise Date() construction
//                          (the endOfDay tz bug is fresh — no UTC-midnight parsing)
import { escapeHtml } from "./views/home.js";
import { spriteHtml } from "./sprites.js";
import { weaknessesOf } from "./type-chart.js";
import { buildParty } from "./party-optimizer.js";

const WINDOW_DAYS = 7;

// currentBosses/currentMaxBattles endsAt is a bare "YYYY-MM-DD" local
// calendar date (the boss runs THROUGH that day, no timezone of its own).
// `new Date("2026-08-13")` parses that as UTC midnight, which west of UTC
// lands on the previous LOCAL day — copied from today-tasks.js's
// localDateFromISO/daysUntil pair rather than re-importing (both private).
function localDateFromISO(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function dateOnly(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(dateString, now) {
  const target = localDateFromISO(dateString);
  if (target === null) return null;
  return Math.round((target - dateOnly(now)) / 86400000);
}

function urgencyFor(daysLeft) {
  if (daysLeft <= 1) return "urgent";
  if (daysLeft <= 3) return "soon";
  return "upcoming";
}

function leavesPhrase(daysLeft) {
  if (daysLeft === 0) return "leaves today";
  if (daysLeft === 1) return "leaves tomorrow";
  return `leaves in ${daysLeft} days`;
}

// {ready, counterName, weaknessTypes} — ready is true only when the roster
// has an actual ranked-attacker owned counter (buildParty's own moveset/CP
// scoring), never inferred from ownership alone.
function readinessFor({ formId, forms, roster, raidRows }) {
  const form = forms?.[formId];
  const bossTypes = [form?.primary_type, form?.secondary_type].filter(Boolean);
  const weaknessTypes = weaknessesOf(bossTypes).map((row) => row.type);
  const party = buildParty({
    targetFormId: formId, roster, forms, raids: raidRows,
  });
  const best = party?.party?.[0] ?? null;
  return {
    ready: Boolean(best),
    counterName: best?.form?.name ?? null,
    weaknessTypes,
  };
}

function lineFor({ name, daysLeft, readiness }) {
  const phrase = leavesPhrase(daysLeft);
  if (readiness.ready) {
    return `${name} ${phrase} — your ${readiness.counterName} is ready`;
  }
  const topType = readiness.weaknessTypes[0] ?? null;
  const chartNote = readiness.weaknessTypes.length
    ? `type chart says ${readiness.weaknessTypes.join("/")}`
    : "no known weaknesses in the type chart";
  return `${name} ${phrase} — no strong ${topType ? `${topType} ` : ""}counter saved; ${chartNote}`;
}

// [{formId, name, daysLeft, urgency, readiness, line}] for currentBosses
// rows ending within the next 7 days (today through +7, inclusive), soonest-
// leaving first. Expired bosses (endsAt already past) are excluded, not
// shown as overdue — same fail-closed contract renderFieldBriefing's own
// expiry filter uses.
// A derived future-week row (startsAt from the events feed) is not live yet.
function hasStarted(boss, now) {
  if (typeof boss?.startsAt !== "string" || Number.isNaN(Date.parse(boss.startsAt))) return true;
  const [year, month, day] = boss.startsAt.split("-").map(Number);
  return new Date(year, month - 1, day) <= now;
}

export function bossCountdowns({
  currentBosses, roster, forms, raidRows, raidTargetTool, now = new Date(),
} = {}) {
  // Countdown rows are the surface that survives every card dismissal, so
  // the catch hundo rides here too (operator ask 2026-08-31: five Ascension
  // Megas, hundo only visible inside a dismissible lane card). Same
  // raid-target row the briefing catch line reads; no target row, no number.
  const targetsByFormId = new Map(
    (raidTargetTool?.targets ?? []).map((target) => [target.bossFormId, target]),
  );
  return (currentBosses?.bosses ?? [])
    .filter((boss) => hasStarted(boss, now))
    .map((boss) => ({ boss, daysLeft: daysUntil(boss.endsAt, now) }))
    .filter((row) => row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= WINDOW_DAYS)
    .sort((left, right) => left.daysLeft - right.daysLeft || left.boss.formId.localeCompare(right.boss.formId))
    .map(({ boss, daysLeft }) => {
      const name = forms?.[boss.formId]?.name ?? boss.formId;
      const readiness = readinessFor({
        formId: boss.formId, forms, roster, raidRows,
      });
      const hundoCP = targetsByFormId.get(boss.formId)?.normal?.hundoCP ?? null;
      const line = lineFor({ name, daysLeft, readiness });
      return {
        formId: boss.formId,
        name,
        daysLeft,
        urgency: urgencyFor(daysLeft),
        readiness: readiness.ready,
        line: hundoCP ? `${line} · hundo ${hundoCP}` : line,
      };
    });
}

// Chip list for the Home briefing rail — one row per bossCountdowns() entry.
// Empty string when nothing's leaving soon (silence, not a placeholder).
// `forms` is only needed for the sprite (dex/type lookup) — bossCountdowns()
// rows already carry every other field the chip renders.
export function renderCountdownChips({ rows, forms } = {}) {
  if (!rows?.length) return "";
  return `<div class="boss-countdown-list" role="list" aria-label="Bosses leaving soon">
    ${rows.map((row) => `<div class="boss-countdown-chip" data-urgency="${escapeHtml(row.urgency)}" role="listitem">
      ${spriteHtml(row.formId, forms, row.name, forms?.[row.formId]?.primary_type)}
      <p class="briefing-note boss-countdown-line">${escapeHtml(row.line)}</p>
    </div>`).join("")}
  </div>`;
}
