// Text-size preference: S/M/L applied as a root font-size class, persisted
// in localStorage. All spacing/typography in app.css is rem-based, so
// scaling the root font-size scales the whole UI consistently.
const STORAGE_KEY = "pogo-text-size";
export const TEXT_SIZES = Object.freeze(["S", "M", "L"]);
const TEXT_SIZE_SET = new Set(TEXT_SIZES);
const DEFAULT_TEXT_SIZE = "M";

export function loadTextSize(storage) {
  const stored = storage?.getItem?.(STORAGE_KEY);
  return TEXT_SIZE_SET.has(stored) ? stored : DEFAULT_TEXT_SIZE;
}


export function saveTextSize(storage, size) {
  const safe = TEXT_SIZE_SET.has(size) ? size : DEFAULT_TEXT_SIZE;
  try {
    storage?.setItem?.(STORAGE_KEY, safe);
  } catch {
    // Storage can legitimately be unavailable — the choice still applies
    // for this session, it just won't persist to the next visit.
  }
  return safe;
}


export function applyTextSize(rootElement, size) {
  const safe = TEXT_SIZE_SET.has(size) ? size : DEFAULT_TEXT_SIZE;
  for (const value of TEXT_SIZES) rootElement?.classList?.remove(`text-size-${value}`);
  rootElement?.classList?.add(`text-size-${safe}`);
  return safe;
}
