// Pure helpers for wiring the Field Journal (journal.js) into app.js's
// existing mutation paths. Kept out of journal.js itself (that module owns
// storage/persistence; this one owns "did something journal-worthy just
// happen") and out of app.js (coordinator-owned wiring file — see
// docs/field-journal-hooks.md for the exact call sites).
import { collectionProgress } from "./collection.js";

// Detects which generations' living-dex crossed from incomplete to 100%
// caught as a result of one ownedFormIds mutation. Reuses collectionProgress
// (collection.js) for the actual per-generation caught/total counting rather
// than re-deriving dex-range math a second way.
//
// beforeOwnedFormIds/afterOwnedFormIds: arrays (or any iterable) of formId,
// e.g. roster.ownedFormIds snapshots taken immediately before and after a
// mutateRoster() call. forms: the app's form dictionary (state.core.forms).
//
// Returns an array of newly-completed gen numbers, oldest first, empty if
// none. An array (not a single gen) because a bulk mutation (Poke Genie
// import) can cross more than one generation to 100% in one step; a
// single-form collection-mark toggle will only ever produce zero or one.
export function genJustCompleted(beforeOwnedFormIds, afterOwnedFormIds, forms) {
  const before = collectionProgress(forms, { ownedFormIds: [...(beforeOwnedFormIds ?? [])] }).byGeneration;
  const after = collectionProgress(forms, { ownedFormIds: [...(afterOwnedFormIds ?? [])] }).byGeneration;
  return after
    .filter((gen) => gen.total > 0 && gen.caught === gen.total)
    .filter((gen) => {
      const was = before.find((entry) => entry.gen === gen.gen);
      return !was || was.caught < was.total;
    })
    .map((gen) => gen.gen);
}
