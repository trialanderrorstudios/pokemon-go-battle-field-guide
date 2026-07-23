// In-game rename-string encoder/decoder — pairs with the round-11 in-game
// search bridge (game-search.js): rename an owned Pokémon to one of these
// short strings inside Pokémon GO itself, and the game's own inventory
// search field can find it again by exact text match, forever, without this
// app open. This module only builds/reads the string; the actual in-game
// rename (tap Pokémon → pencil icon → type it in) is manual, same as every
// other "copy this, then do it by hand in-game" flow in this app.
//
// LIMIT SOURCE: Pokémon GO's per-Pokémon nickname field is consistently
// documented at 12 characters across independent player guides (checked
// 2026-07-23: pokewolf.com "What is Pokémon Go nickname change limit?",
// anyto.imyfone.com "How to Change Pokemon GO Name") — the same limit the
// core series has used for Western-language nicknames since Gen VI. No
// single official Niantic Help Center article enumerates this specific
// field's length; the one Help Center page found on nicknames
// ("Changing your Trainer Nickname") covers the account username, a
// different field. Same honest posture as SEARCH_NAME_CHUNK_SIZE in
// game-search.js: best available sourcing, stated plainly, not invented.
export const RENAME_MAX_LENGTH = 12;

// WHAT THE STRING ENCODES (read left to right):
//   [1]   League letter this build targets: G=Great, U=Ultra, M=Master,
//         or X if no ranked PVP league data applies to this copy.
//   [2-4] This copy's exact Attack/Defense/Stamina IVs (0-15 each), one hex
//         digit apiece (0-9, A-F) — lossless, always present.
//   [-NN] Optional: this copy's PVP quality — % of the rank-1 (best
//         possible) stat product for that league/CP cap, from this app's
//         own qualityHint() — 1-3 digits.
//   [-RN] Optional: the species' published PvPoke meta rank within that
//         league (e.g. R7 = ranked #7 among this app's curated picks) —
//         "R" plus 1-3 digits.
// Optional pieces are dropped whole (never cut mid-number) when they would
// push the string past RENAME_MAX_LENGTH — rank goes first, since it
// describes the species rather than this exact copy.

const LEAGUE_LETTER = Object.freeze({ great: "G", ultra: "U", master: "M" });
const LETTER_LEAGUE = Object.freeze({ G: "great", U: "ultra", M: "master" });
const NO_LEAGUE_LETTER = "X";

function ivHexDigit(value) {
  if (!Number.isInteger(value) || value < 0 || value > 15) return null;
  return value.toString(16).toUpperCase();
}

// 3 IVs (0-15 each) -> 3 hex digits, or null if any IV is missing/invalid.
export function encodeIvHex(ivs) {
  const digits = [ivHexDigit(ivs?.atk), ivHexDigit(ivs?.def), ivHexDigit(ivs?.sta)];
  return digits.every((digit) => digit !== null) ? digits.join("") : null;
}

// Inverse of encodeIvHex; null for anything that isn't exactly 3 hex digits.
export function decodeIvHex(hex) {
  if (!/^[0-9a-f]{3}$/i.test(hex ?? "")) return null;
  const [atk, def, sta] = [...hex.toUpperCase()].map((digit) => parseInt(digit, 16));
  return { atk, def, sta };
}

// Builds the rename string for one owned copy. Returns null when there are
// no exact IVs to encode (nothing honest to write). qualityPercent/
// speciesRank are optional — omit either to encode only what's known.
export function buildRenameString({ league = null, ivs, qualityPercent = null, speciesRank = null } = {}) {
  const ivHex = encodeIvHex(ivs);
  if (!ivHex) return null;
  const letter = LEAGUE_LETTER[league] ?? NO_LEAGUE_LETTER;
  let value = letter + ivHex;
  const optional = [];
  if (Number.isFinite(qualityPercent)) {
    optional.push(String(Math.max(0, Math.min(100, Math.round(qualityPercent)))));
  }
  if (Number.isFinite(speciesRank) && speciesRank >= 1) {
    optional.push(`R${Math.round(speciesRank)}`);
  }
  for (const part of optional) {
    const candidate = `${value}-${part}`;
    if (candidate.length > RENAME_MAX_LENGTH) break; // drop this and any further optional piece
    value = candidate;
  }
  return value;
}

// Inverse of buildRenameString. Returns null for text that isn't in this
// scheme at all (e.g. a name the player typed by hand); otherwise returns
// exactly the fields that were actually encoded — qualityPercent/speciesRank
// are null when the string didn't carry them (they were never guessed at).
export function decodeRenameString(value) {
  if (typeof value !== "string") return null;
  const segments = value.trim().split("-");
  const core = segments[0] ?? "";
  if (core.length !== 4) return null;
  const letter = core[0].toUpperCase();
  if (letter !== NO_LEAGUE_LETTER && !LETTER_LEAGUE[letter]) return null;
  const ivs = decodeIvHex(core.slice(1));
  if (!ivs) return null;
  let qualityPercent = null;
  let speciesRank = null;
  for (const part of segments.slice(1)) {
    if (/^r\d+$/i.test(part)) speciesRank = parseInt(part.slice(1), 10);
    else if (/^\d{1,3}$/.test(part)) qualityPercent = parseInt(part, 10);
  }
  return { league: LETTER_LEAGUE[letter] ?? null, ivs, qualityPercent, speciesRank };
}

// Best signal for one triage entry (see triage.js): prefers the
// PVP-bucket-qualifying league (entry.pvp); falls back to whichever league
// has the best quality data among entry.pvpByLeague for a KEEP entry that
// didn't clear the PVP-bucket threshold; falls back to IV-only when no
// ranked league data applies at all (e.g. a raid-only keeper). Returns null
// only when the instance has no exact IVs recorded (a star-only owned form).
export function renameStringForEntry(entry) {
  const ivs = entry?.instance?.ivs;
  if (!ivs) return null;
  const byLeague = Object.entries(entry.pvpByLeague ?? {}).map(([league, data]) => ({ league, ...data }));
  const signal = entry.pvp
    ?? byLeague.filter((row) => Number.isFinite(row.quality?.ratio))
      .sort((left, right) => right.quality.ratio - left.quality.ratio)[0]
    ?? null;
  return buildRenameString({
    ivs,
    league: signal?.league ?? null,
    qualityPercent: signal?.quality?.percent ?? null,
    speciesRank: signal?.rankedRow?.rank ?? null,
  });
}

// Batch mode: one rename string per entry (e.g. a filtered KEEP/PVP triage
// list), skipping entries with nothing to encode.
export function batchRenameStrings(entries) {
  return (entries ?? [])
    .map((entry) => ({ entry, name: entry.name ?? entry.form?.name ?? entry.formId, value: renameStringForEntry(entry) }))
    .filter((row) => row.value !== null);
}
