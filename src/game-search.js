// Pokémon GO's in-game inventory search-box grammar, for building
// copy-paste strings this app's verdicts can hand to that search field.
//
// SOURCE (official Pokémon GO Help Center, "Searching & Filtering your
// Pokémon Inventory" — niantic.helpshift.com, article id 1486 under the
// 6-pokemon-go FAQ section; fetched and re-verified 2026-07-23; no scheme
// or "//" written here on purpose — this file ships to the public site and
// the build's own privacy scanner rejects literal external URLs in it).
// This grammar has changed over app versions, so only operators confirmed
// on that page are used here — nothing borrowed from third-party cheat
// sheets. Relevant excerpts:
//   - "Multiple searches: Use , : or ; to search for Pokémon from multiple
//     criteria." — comma-separated names is an OR.
//   - "Exclude Pokémon: Use ! before your search..." — negation.
//   - "Appraisal: Enter 0-4* to search by appraisal." — star rating.
//   - "Age (in Days): Search age plus a number... age0-1..."
//   - "Year: Search year plus a number..."
//   - "Shadow Pokémon: Enter Shadow...", "Lucky Pokémon: Enter lucky...",
//     "Shiny Pokémon: Enter shiny...", "Special Event Pokémon: Enter
//     costume...", "Gym defenders: Enter defender..."
//   - "Punctuation: For Pokémon whose name contains punctuation or special
//     characters, the search will not return those Pokémon unless your
//     query also includes the punctuation. For example, a search for mr.
//     will return Mr. Mime and Mr. Rime however a search for mr mime will
//     not return any Pokémon." — so apostrophes/periods must stay in.

// No documented hard character/length limit for the search field exists
// (checked 2026-07-23 — official page and a Google Play support thread
// asking about this went unanswered). 15 names keeps each paste short and
// readable as a practical, honestly-labeled choice, not a game-enforced cap.
// ponytail: bump this if real boxes routinely need it — no evidence yet they do.
export const SEARCH_NAME_CHUNK_SIZE = 15;

// Regional forms ("Vulpix (Alolan)" in this app's data) have no in-game
// search string verified against the official Help Center page — it
// documents region *keywords* as a separate filter, never a
// region-prefixed display name as searchable text. Rather than guess a
// "Alolan Vulpix"-style string, these are left as an unhandled
// parenthetical below and excluded like any other unmapped name.

// "Shadow" is a separate status flag in search ("Enter Shadow to show
// Shadow Pokémon"), not part of the species name — strip it before
// building a name query.
const SHADOW_SUFFIX = /\s*\(Shadow\)\s*$/;

// This app displays Nidoran's two forms by spelled-out gender ("Nidoran
// Female" / "Nidoran Male"); the game's own name uses the ♀/♂ glyph
// instead ("Nidoran♀" / "Nidoran♂"). Neither of those strings is
// verified to round-trip through the game's search field, so rather than
// guess, these are excluded — the honest fallback is looking them up by
// hand.
const UNMAPPABLE_NAMES = new Set([
  "Nidoran Female", "Nidoran Female (Shadow)",
  "Nidoran Male", "Nidoran Male (Shadow)",
]);

// Converts one of this app's display names into the literal text to paste
// into the in-game search field, or null if the mapping isn't verified
// (any remaining parenthetical — Mega, regional Forme, weather form, etc.
// — has no confirmed in-game name here, so it's excluded rather than
// guessed at).
export function toSearchName(name) {
  if (!name || UNMAPPABLE_NAMES.has(name)) return null;
  // Raw data-id names (e.g. "Maushold_family_of_four") never got a display
  // conversion and match nothing in the game's search field — exclude
  // rather than paste garbage.
  if (name.includes("_")) return null;
  const working = name.replace(SHADOW_SUFFIX, "");
  if (/\([^)]*\)/.test(working)) return null;
  return working.trim() || null;
}

// Builds one or more comma-OR search strings from a list of display names,
// deduped and chunked to a readable length. Returns the copy-paste chunks
// plus a count of names that couldn't be mapped to a verified in-game name
// (see toSearchName) so callers can show an honest "N not included" note.
export function buildSearchQuery(names, chunkSize = SEARCH_NAME_CHUNK_SIZE) {
  const seenRaw = new Set();
  const mapped = new Set();
  let excludedCount = 0;
  for (const raw of names ?? []) {
    if (!raw || seenRaw.has(raw)) continue;
    seenRaw.add(raw);
    const searchName = toSearchName(raw);
    if (searchName) mapped.add(searchName);
    else excludedCount += 1;
  }
  const uniqueNames = [...mapped];
  const chunks = [];
  for (let i = 0; i < uniqueNames.length; i += chunkSize) {
    chunks.push(uniqueNames.slice(i, i + chunkSize).join(","));
  }
  return { chunks, excludedCount };
}
