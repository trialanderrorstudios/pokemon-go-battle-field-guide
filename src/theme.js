// Theme preference: system default, or a manual light/dark override,
// persisted in localStorage. "auto" defers to the prefers-color-scheme media
// query in app.css; "light"/"dark" set data-theme on the root to force it.
const STORAGE_KEY = "pogo-theme";
export const THEMES = Object.freeze(["auto", "light", "dark"]);
const THEME_SET = new Set(THEMES);
const DEFAULT_THEME = "auto";

export function loadTheme(storage) {
  const stored = storage?.getItem?.(STORAGE_KEY);
  return THEME_SET.has(stored) ? stored : DEFAULT_THEME;
}


export function saveTheme(storage, theme) {
  const safe = THEME_SET.has(theme) ? theme : DEFAULT_THEME;
  try {
    storage?.setItem?.(STORAGE_KEY, safe);
  } catch {
    // Storage can legitimately be unavailable — the choice still applies
    // for this session, it just won't persist to the next visit.
  }
  return safe;
}


export function applyTheme(rootElement, theme) {
  const safe = THEME_SET.has(theme) ? theme : DEFAULT_THEME;
  if (safe === "auto") rootElement?.removeAttribute?.("data-theme");
  else rootElement?.setAttribute?.("data-theme", safe);
  return safe;
}
