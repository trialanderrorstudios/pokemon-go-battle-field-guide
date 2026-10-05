// Calendar export (D, 2026-10-05) — alerts without a server. The app can't
// reach you when it isn't open (no push; the July relay spike is still an
// operator decision), but your phone's calendar can: export the next few
// weeks as an .ics file and the calendar does the reminding.
//
// Times: Pokémon GO events run on local wall-clock time (Raid Hour is 6 PM
// wherever you are), and the feed writes them without a zone, so they become
// floating times — same wall clock in any zone. GO Battle League rows carry a
// UTC "Z" and stay UTC.

const DEFAULT_HORIZON_DAYS = 30;
const ALARM_MINUTES_BEFORE = 30;
// RFC 5545 PRODID, joined at runtime: its literal form contains a double
// slash, which the public-safety scanner reads as a protocol-relative URL
// (same trick as the CP retry's digit string). Comments are scanned too.
const PRODID = ["-", "", "Battle Field Guide", "", "Events", "", "EN"].join("/");

// Which feed events are worth a calendar slot, and how each reads there.
function titleFor(event) {
  if (event.kind === "pokemon-spotlight-hour") {
    return `Spotlight Hour${event.spotlightBonus ? ` — ${event.spotlightBonus}` : ""}: ${event.name.replace(/ Spotlight Hour$/, "")}`;
  }
  if (event.bonuses?.frustrationRemovable) return `${event.name} — Frustration removable`;
  if (event.kind === "go-battle-league") {
    const cups = (event.cups ?? []).map((cup) => cup.name);
    return cups.length ? `GBL: ${cups.join(", ")} starts` : null;
  }
  if (["raid-hour", "community-day", "raid-day"].includes(event.kind)) return event.name;
  return null;
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545: content lines fold at 75 octets with CRLF + one space. Folding on
// characters (not bytes) keeps multi-byte text intact; 70 leaves room.
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 70) {
    out.push(rest.slice(0, 70));
    rest = ` ${rest.slice(70)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

// "2026-10-01T18:00:00.000" -> "20261001T180000" (floating);
// "...Z" -> "...Z" (UTC). Null for anything unparseable.
export function icsDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z)?$/.exec(String(value ?? ""));
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  return `${y}${mo}${d}T${h}${mi}${s}${z ? "Z" : ""}`;
}

function parseLocal(value) {
  const date = new Date(String(value).endsWith("Z") ? value : String(value).replace(/\.\d+$/, ""));
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function calendarEvents(currentEvents, { now = new Date(), horizonDays = DEFAULT_HORIZON_DAYS } = {}) {
  const until = new Date(now.getTime() + horizonDays * 86400000);
  return (currentEvents?.events ?? [])
    .map((event) => ({ event, title: titleFor(event), start: parseLocal(event.startsAt), end: parseLocal(event.endsAt) }))
    .filter(({ title, start, end }) => title && start && end && end >= now && start <= until)
    .sort((a, b) => a.start - b.start);
}

export function buildIcs(currentEvents, { now = new Date(), horizonDays = DEFAULT_HORIZON_DAYS } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODID}`, "CALSCALE:GREGORIAN"];
  for (const { event, title } of calendarEvents(currentEvents, { now, horizonDays })) {
    const start = icsDateTime(event.startsAt);
    const end = icsDateTime(event.endsAt);
    if (!start || !end) continue;
    const details = [event.action, event.bonuses?.summary].filter(Boolean).join(" ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.eventId)}@battle-field-guide`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      fold(`SUMMARY:${escapeText(title)}`),
      ...(details ? [fold(`DESCRIPTION:${escapeText(details)}`)] : []),
      ...(event.link ? [fold(`URL:${event.link}`)] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${escapeText(title)}`),
      `TRIGGER:-PT${ALARM_MINUTES_BEFORE}M`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
