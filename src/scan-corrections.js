// I3 "fix and teach" — when a scanned row's Edit → quick-add save changes a
// value the scan actually read, that's a misread worth turning into a
// fixture. One flat list in localStorage (feedback.js's pattern), newest
// first, capped so it can't grow forever. No image, ever — just the field,
// what OCR read, what the operator corrected it to, the species, and when.
const CORRECTIONS_KEY = "pogo-scan-corrections";
const MAX_ENTRIES = 200;

function isValidEntry(entry) {
  return entry
    && typeof entry.field === "string" && entry.field.length > 0
    && typeof entry.species === "string" && entry.species.length > 0
    && typeof entry.read === "string"
    && typeof entry.corrected === "string"
    && Number.isFinite(entry.ts);
}


export function loadScanCorrections(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(CORRECTIONS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
  } catch {
    return [];
  }
}


// One call per saved row: diffs `read` against `corrected` field-by-field
// (both plain { field: value } maps — string/"" values, same convention as
// quick-add's own draft fields) and records only the fields that actually
// changed. A blank read (the scan found nothing — IVs are never OCR-read at
// all) that got filled in isn't a misread, so it's never recorded; only a
// non-blank read that ended up different counts as a correction. Returns
// the full, newest-first, capped list.
export function recordScanCorrections(storage, species, read, corrected) {
  const changed = Object.keys(corrected).filter((field) => {
    const before = String(read?.[field] ?? "");
    return before !== "" && before !== String(corrected[field] ?? "");
  });
  if (!changed.length) return loadScanCorrections(storage);
  const ts = Date.now();
  const entries = [
    ...changed.map((field) => ({
      field, species, read: String(read?.[field] ?? ""), corrected: String(corrected[field] ?? ""), ts,
    })),
    ...loadScanCorrections(storage),
  ].slice(0, MAX_ENTRIES);
  try {
    storage?.setItem?.(CORRECTIONS_KEY, JSON.stringify(entries));
  } catch {
    // Storage can legitimately be unavailable (private browsing, quota) —
    // the correction still applied for this session, it just won't persist.
  }
  return entries;
}


export function exportScanCorrections(storage) {
  return `${JSON.stringify(loadScanCorrections(storage), null, 2)}\n`;
}
