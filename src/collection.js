// Living-dex tracking: shiny/lucky ownership derived from the roster, and
// progress readouts grouped by generation/region. Honest scope (round 9):
// this only tracks what the user marks. There is no shiny-availability
// database in this app's bundled sources, so "shiny count" always means
// "shinies you told us you own," never "shinies this species can be."
//
// Generation boundaries are the fixed National Pokédex ranges (public,
// unchanging dex-number cutoffs — the same kind of frozen reference table as
// the type chart), applied to each form's own bundled `dex` number.
const GENERATIONS = Object.freeze([
  Object.freeze({ gen: 1, region: "Kanto", start: 1, end: 151 }),
  Object.freeze({ gen: 2, region: "Johto", start: 152, end: 251 }),
  Object.freeze({ gen: 3, region: "Hoenn", start: 252, end: 386 }),
  Object.freeze({ gen: 4, region: "Sinnoh", start: 387, end: 493 }),
  Object.freeze({ gen: 5, region: "Unova", start: 494, end: 649 }),
  Object.freeze({ gen: 6, region: "Kalos", start: 650, end: 721 }),
  Object.freeze({ gen: 7, region: "Alola", start: 722, end: 809 }),
  Object.freeze({ gen: 8, region: "Galar", start: 810, end: 905 }),
  Object.freeze({ gen: 9, region: "Paldea", start: 906, end: 1025 }),
]);

export function generationOf(dex) {
  return GENERATIONS.find((entry) => dex >= entry.start && dex <= entry.end) ?? null;
}


// One row per collectible species (bundled dex number), not per exact form —
// living-dex completion is about owning the species at all, not every
// costume/regional variant separately. Mega/Primal forms are excluded: they
// share their base species' dex number and are temporary battle forms, never
// a persisted roster entry (same exclusion as poke-genie-import.js's form
// matcher). The representative form (for sprite/name) prefers the plain
// NORMAL tag; otherwise the first released non-mega form, sorted by form_id
// for determinism.
export function livingDexEntries(forms = {}) {
  const bySpecies = new Map();
  for (const form of Object.values(forms)) {
    if (!form?.released || (form.tags ?? []).includes("mega")) continue;
    if (!Number.isInteger(form.dex)) continue;
    if (!bySpecies.has(form.dex)) bySpecies.set(form.dex, []);
    bySpecies.get(form.dex).push(form);
  }
  const rows = [...bySpecies.entries()].map(([dex, speciesForms]) => {
    const sorted = [...speciesForms].sort((left, right) => left.form_id.localeCompare(right.form_id));
    const representative = sorted.find((form) => form.form === "NORMAL") ?? sorted[0];
    const generation = generationOf(dex);
    return {
      dex,
      formId: representative.form_id,
      name: representative.name,
      primaryType: representative.primary_type,
      formIds: sorted.map((form) => form.form_id),
      gen: generation?.gen ?? null,
      region: generation?.region ?? "Unknown",
    };
  });
  return rows.sort((left, right) => left.dex - right.dex);
}


// A form counts toward its species' shiny/lucky ownership either from the
// standalone per-form flag (dex-list quick toggle) or from any owned
// instance that's individually marked — a real shiny/lucky instance always
// counts, even if the quick-toggle flag was never set or was later cleared.
export function shinyOwnedFormIdSet(roster = {}) {
  const ids = new Set(roster.shinyOwnedFormIds ?? []);
  for (const instance of roster.instances ?? []) if (instance.isShiny) ids.add(instance.formId);
  return ids;
}

export function luckyOwnedFormIdSet(roster = {}) {
  const ids = new Set(roster.luckyOwnedFormIds ?? []);
  for (const instance of roster.instances ?? []) if (instance.isLucky) ids.add(instance.formId);
  return ids;
}


function speciesIsCaught(entry, ownedFormIdSet) {
  return entry.formIds.some((formId) => ownedFormIdSet.has(formId));
}

function speciesIsFlagged(entry, flaggedFormIdSet) {
  return entry.formIds.some((formId) => flaggedFormIdSet.has(formId));
}


// Progress readouts: overall + one row per generation the bundled dex data
// actually spans. Counts are real-or-zero — every number here is a count of
// entries in livingDexEntries(), never an estimate.
export function collectionProgress(forms, roster) {
  const entries = livingDexEntries(forms);
  const owned = new Set(roster?.ownedFormIds ?? []);
  const shiny = shinyOwnedFormIdSet(roster);
  const lucky = luckyOwnedFormIdSet(roster);

  const byGeneration = new Map();
  for (const entry of entries) {
    const key = entry.gen ?? 0;
    if (!byGeneration.has(key)) {
      byGeneration.set(key, { gen: entry.gen, region: entry.region, caught: 0, total: 0, shiny: 0, lucky: 0 });
    }
    const bucket = byGeneration.get(key);
    bucket.total += 1;
    if (speciesIsCaught(entry, owned)) bucket.caught += 1;
    if (speciesIsFlagged(entry, shiny)) bucket.shiny += 1;
    if (speciesIsFlagged(entry, lucky)) bucket.lucky += 1;
  }

  const overall = { caught: 0, total: entries.length, shiny: 0, lucky: 0 };
  for (const entry of entries) {
    if (speciesIsCaught(entry, owned)) overall.caught += 1;
    if (speciesIsFlagged(entry, shiny)) overall.shiny += 1;
    if (speciesIsFlagged(entry, lucky)) overall.lucky += 1;
  }

  return {
    overall,
    byGeneration: [...byGeneration.values()].sort((left, right) => (left.gen ?? 0) - (right.gen ?? 0)),
  };
}


// Filterable, missing-first-sorted dex grid rows for the Collection view.
// filter: "all" | "missing" | "shiny" | "lucky". query matches name/dex/form.
export function livingDexRows(forms, roster, { query = "", filter = "all" } = {}) {
  const owned = new Set(roster?.ownedFormIds ?? []);
  const shiny = shinyOwnedFormIdSet(roster);
  const lucky = luckyOwnedFormIdSet(roster);
  const normalizedQuery = query.trim().toLowerCase();

  const rows = livingDexEntries(forms).map((entry) => ({
    ...entry,
    caught: speciesIsCaught(entry, owned),
    isShiny: speciesIsFlagged(entry, shiny),
    isLucky: speciesIsFlagged(entry, lucky),
  }));

  const filtered = rows.filter((row) => {
    if (normalizedQuery && !`${row.name} #${row.dex} ${row.region}`.toLowerCase().includes(normalizedQuery)) {
      return false;
    }
    if (filter === "missing") return !row.caught;
    if (filter === "shiny") return row.isShiny;
    if (filter === "lucky") return row.isLucky;
    return true;
  });

  // Missing-first: uncaught species surface before caught ones, dex order
  // within each group.
  return filtered.sort((left, right) => Number(left.caught) - Number(right.caught) || left.dex - right.dex);
}
