// Local-only "did this help?" thumbs. One flat list in localStorage, capped
// so it can't grow forever; export is the only way this data leaves the
// device.
const FEEDBACK_KEY = "pogo-feedback";
const MAX_ENTRIES = 500;

function isValidEntry(entry) {
  return entry
    && typeof entry.surface === "string" && entry.surface.length > 0
    && typeof entry.formId === "string" && entry.formId.length > 0
    && (entry.verdict === "up" || entry.verdict === "down")
    && Number.isFinite(entry.ts);
}


export function loadFeedback(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(FEEDBACK_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
  } catch {
    return [];
  }
}


export function recordFeedback(storage, surface, formId, verdict) {
  if (verdict !== "up" && verdict !== "down") return loadFeedback(storage);
  const entries = [...loadFeedback(storage), { surface, formId, verdict, ts: Date.now() }].slice(-MAX_ENTRIES);
  try {
    storage?.setItem?.(FEEDBACK_KEY, JSON.stringify(entries));
  } catch {
    // Storage can legitimately be unavailable (private browsing, quota) —
    // the tap still registers for this render, it just won't persist.
  }
  return entries;
}


export function exportFeedback(storage) {
  return `${JSON.stringify(loadFeedback(storage), null, 2)}\n`;
}
