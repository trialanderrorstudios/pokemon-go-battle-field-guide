// Manual resource tracking — Pokemon GO does not expose Stardust/Candy/Mega
// Energy balances to third-party apps, so every number here is typed in by
// the player. Kept as its own module with its own storage keys, separate
// from the roster IndexedDB store (storage.js), so a future profile-screen
// card can read/write the same keys without depending on this raid-target
// wiring — see docs/plans for the coordination note.
const STARDUST_KEY = "pogo-stardust";
const CANDY_KEY = "pogo-candy-inventory";
const MEGA_ENERGY_KEY = "pogo-mega-energy-inventory";


// null = never recorded ("unknown"); a stored 0 is a real, distinct answer.
function loadNonNegativeInt(storage, key) {
  const raw = storage?.getItem?.(key);
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}


export function loadStardust(storage) {
  return loadNonNegativeInt(storage, STARDUST_KEY);
}


export function saveStardust(storage, value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError("Stardust must be a whole number of 0 or more.");
  }
  try {
    storage?.setItem?.(STARDUST_KEY, String(number));
  } catch {
    // Storage can legitimately be unavailable — the value still applies for
    // this session, it just won't persist to the next visit.
  }
  return number;
}


// Puts Stardust back to "unknown" — the player cleared the field, distinct
// from entering 0.
export function clearStardust(storage) {
  try {
    storage?.removeItem?.(STARDUST_KEY);
  } catch {
    // See saveStardust.
  }
  return null;
}


function loadCountMap(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(key) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean = {};
    for (const [formId, count] of Object.entries(parsed)) {
      if (formId && Number.isInteger(count) && count >= 0) clean[formId] = count;
    }
    return clean;
  } catch {
    return {};
  }
}


function setCount(storage, key, formId, count) {
  if (typeof formId !== "string" || !formId) {
    throw new TypeError("formId must be a non-empty string.");
  }
  const number = Number(count);
  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError("Count must be a whole number of 0 or more.");
  }
  const map = loadCountMap(storage, key);
  map[formId] = number;
  try {
    storage?.setItem?.(key, JSON.stringify(map));
  } catch {
    // Storage can legitimately be unavailable — same as saveStardust above.
  }
  return map;
}


// Puts one form/species back to "unknown" — distinct from a stored 0.
function clearCount(storage, key, formId) {
  if (typeof formId !== "string" || !formId) {
    throw new TypeError("formId must be a non-empty string.");
  }
  const map = loadCountMap(storage, key);
  delete map[formId];
  try {
    storage?.setItem?.(key, JSON.stringify(map));
  } catch {
    // See setCount above.
  }
  return map;
}


// Per-species Candy on hand — this app never builds a bulk candy-inventory
// screen (ponytail: on-demand only), just this one inline row wherever a
// power-up cost is already shown.
export function loadCandyInventory(storage) {
  return loadCountMap(storage, CANDY_KEY);
}


export function setCandyCount(storage, formId, count) {
  return setCount(storage, CANDY_KEY, formId, count);
}


export function clearCandyCount(storage, formId) {
  return clearCount(storage, CANDY_KEY, formId);
}


// Per-species (and, since the May 2026 Mega X/Y split, per-form) Mega Energy
// on hand. Manual entry only — this app does not hardcode Mega Energy costs;
// see the mega guidance card in app.js for why.
export function loadMegaEnergyInventory(storage) {
  return loadCountMap(storage, MEGA_ENERGY_KEY);
}


export function setMegaEnergyCount(storage, formId, count) {
  return setCount(storage, MEGA_ENERGY_KEY, formId, count);
}


export function clearMegaEnergyCount(storage, formId) {
  return clearCount(storage, MEGA_ENERGY_KEY, formId);
}


// Combines what's known; never fabricates an unknown number.
// - Both currencies recorded → "can-afford" or "short".
// - Only one recorded and it already falls short on its own → "short" (the
//   other currency can't rescue a shortfall that's already real).
// - Only one recorded and it's sufficient on its own → "partial" (still
//   missing half the picture).
// - Neither recorded → "unknown".
export function affordability({
  candyNeeded = 0, stardustNeeded = 0, candyOwned = null, stardustOwned = null,
} = {}) {
  const candyKnown = Number.isInteger(candyOwned);
  const stardustKnown = Number.isInteger(stardustOwned);
  const candyShort = candyKnown ? Math.max(0, candyNeeded - candyOwned) : null;
  const stardustShort = stardustKnown ? Math.max(0, stardustNeeded - stardustOwned) : null;
  let status;
  if (!candyKnown && !stardustKnown) status = "unknown";
  else if ((candyKnown && candyShort > 0) || (stardustKnown && stardustShort > 0)) status = "short";
  else if (candyKnown && stardustKnown) status = "can-afford";
  else status = "partial";
  return {
    status, candyKnown, stardustKnown, candyShort, stardustShort,
  };
}
