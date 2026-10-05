// Profiles (C, 2026-10-05) — separate rosters for separate Pokémon GO
// accounts on one device: the operator runs a main and an alt, and checks a
// partner's account too. Every roster answer in that month of chat was per
// account, and the app had no notion of more than one.
//
// Storage: the profile list lives in localStorage; each profile's roster is
// its own IndexedDB record. "main" keeps the original record key ("roster"),
// so a device that has never seen profiles is already the Main profile with
// nothing migrated or rewritten — lossless by construction.
//
// Switching profiles reloads the app rather than hot-swapping the roster
// object, which dozens of closures capture: a reload guarantees no view keeps
// reading the previous account's data.
const PROFILES_STORAGE_KEY = "pogo-profiles";
export const MAIN_PROFILE_ID = "main";
const MAX_PROFILES = 8;
const MAX_NAME_LENGTH = 24;

function defaultIndex() {
  return { activeId: MAIN_PROFILE_ID, profiles: [{ id: MAIN_PROFILE_ID, name: "Main" }] };
}

function cleanName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

// Always returns a usable index: unreadable or malformed storage falls back to
// Main only, and Main can never be missing.
export function loadProfiles(storage) {
  let parsed = null;
  try {
    parsed = JSON.parse(storage?.getItem?.(PROFILES_STORAGE_KEY) ?? "null");
  } catch {
    parsed = null;
  }
  const fallback = defaultIndex();
  if (!parsed || !Array.isArray(parsed.profiles)) return fallback;
  const seen = new Set();
  const profiles = parsed.profiles
    .filter((p) => p && typeof p.id === "string" && /^[a-z0-9-]{1,32}$/.test(p.id) && !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ id: p.id, name: cleanName(p.name) || p.id }));
  if (!profiles.some((p) => p.id === MAIN_PROFILE_ID)) profiles.unshift(fallback.profiles[0]);
  const activeId = profiles.some((p) => p.id === parsed.activeId) ? parsed.activeId : MAIN_PROFILE_ID;
  return { activeId, profiles };
}

export function saveProfiles(storage, index) {
  try {
    storage?.setItem?.(PROFILES_STORAGE_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

// The IndexedDB record key holding a profile's roster.
export function rosterRecordKey(profileId) {
  return profileId === MAIN_PROFILE_ID ? "roster" : `roster:${profileId}`;
}

function slug(name) {
  return cleanName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "profile";
}

export function addProfile(index, name) {
  const clean = cleanName(name);
  if (!clean) return { index, error: "Give the profile a name." };
  if (index.profiles.length >= MAX_PROFILES) return { index, error: `Up to ${MAX_PROFILES} profiles.` };
  if (index.profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return { index, error: "That name is already used." };
  let id = slug(clean);
  for (let n = 2; index.profiles.some((p) => p.id === id) || id === MAIN_PROFILE_ID; n += 1) id = `${slug(clean)}-${n}`;
  return { index: { ...index, profiles: [...index.profiles, { id, name: clean }] }, id, error: null };
}

export function renameProfile(index, id, name) {
  const clean = cleanName(name);
  if (!clean) return { index, error: "Give the profile a name." };
  if (index.profiles.some((p) => p.id !== id && p.name.toLowerCase() === clean.toLowerCase())) return { index, error: "That name is already used." };
  return { index: { ...index, profiles: index.profiles.map((p) => (p.id === id ? { ...p, name: clean } : p)) }, error: null };
}

// Main and the active profile can't be removed — the first holds the original
// record, the second is what's on screen. The caller deletes the IndexedDB
// record after this succeeds.
export function removeProfile(index, id) {
  if (id === MAIN_PROFILE_ID) return { index, error: "Main can't be removed." };
  if (id === index.activeId) return { index, error: "Switch to another profile first." };
  return { index: { ...index, profiles: index.profiles.filter((p) => p.id !== id) }, error: null };
}

export function setActiveProfile(index, id) {
  if (!index.profiles.some((p) => p.id === id)) return index;
  return { ...index, activeId: id };
}

export function activeProfile(index) {
  return index.profiles.find((p) => p.id === index.activeId) ?? index.profiles[0];
}

// Trade-to-account suggestions (C3). Moves survive a trade and IVs re-roll, so
// a spare copy is worth more on an account that has none of that form — and a
// spare carrying a legacy or Elite-only move is the most valuable kind (the
// Inteleon-with-Hydro-Cannon case). Spare = any copy beyond the first in the
// source profile; only offered to profiles owning zero of the form. Shadows
// and mythicals can't be traded, so they're excluded.
export function tradeSuggestions(rostersById, forms, { maxPerPair = 25 } = {}) {
  const suggestions = [];
  const ids = Object.keys(rostersById);
  for (const from of ids) {
    const byForm = new Map();
    for (const instance of rostersById[from]?.instances ?? []) {
      if (!byForm.has(instance.formId)) byForm.set(instance.formId, []);
      byForm.get(instance.formId).push(instance);
    }
    for (const to of ids) {
      if (to === from) continue;
      const theirs = new Set([
        ...(rostersById[to]?.instances ?? []).map((i) => i.formId),
        ...(rostersById[to]?.ownedFormIds ?? []),
      ]);
      let count = 0;
      for (const [formId, copies] of byForm) {
        const form = forms?.[formId];
        if (!form || copies.length < 2 || theirs.has(formId)) continue;
        if (form.shadow || (form.tags ?? []).includes("mythical")) continue;
        const legacyMoves = new Set([...(form.elite_moves ?? []), ...(form.event_only_moves ?? [])]);
        const carrying = copies.find((c) => (c.chargedMoves ?? []).some((m) => legacyMoves.has(m)) || legacyMoves.has(c.fastMove));
        suggestions.push({
          from, to, formId, name: form.name, spares: copies.length - 1,
          legacyMove: carrying ? [carrying.fastMove, ...(carrying.chargedMoves ?? [])].find((m) => legacyMoves.has(m)) : null,
        });
        count += 1;
        if (count >= maxPerPair) break;
      }
    }
  }
  return suggestions.sort((a, b) => Number(Boolean(b.legacyMove)) - Number(Boolean(a.legacyMove)) || a.name.localeCompare(b.name));
}
