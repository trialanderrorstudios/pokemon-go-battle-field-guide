function normalizedParts(values) {
  return values
    .flat(Infinity)
    .filter((value) => typeof value === "string" && value.trim())
    .map(normalizeSearchText);
}


export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-–—/]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function formRows(forms) {
  if (Array.isArray(forms)) return forms;
  if (forms && typeof forms === "object") return Object.values(forms);
  return [];
}


function formEntry(form) {
  const formId = form.formId ?? form.form_id;
  if (typeof formId !== "string" || typeof form.name !== "string") return null;
  const types = [
    form.primaryType ?? form.primary_type,
    form.secondaryType ?? form.secondary_type,
    ...(form.types ?? []),
  ].filter(Boolean);
  const moves = [
    ...(form.fastMoves ?? form.fast_moves ?? []),
    ...(form.chargedMoves ?? form.charged_moves ?? []),
    ...(form.moves ?? []),
  ];
  const fields = normalizedParts([form.name, formId, types, moves]);
  return {
    formId,
    name: form.name,
    resultCategory: "pokemon",
    types: [...new Set(types)],
    moves: [...new Set(moves)],
    _name: normalizeSearchText(form.name),
    _formId: normalizeSearchText(formId),
    _fields: fields,
  };
}


function bossEntries(core) {
  const targets = core?.raidTargetTool?.targets ?? core?.raidTargets ?? [];
  if (!Array.isArray(targets)) return [];
  return targets.flatMap((target) => {
    const formId = target.bossFormId ?? target.formId;
    const name = target.boss ?? target.name;
    if (typeof formId !== "string" || typeof name !== "string") return [];
    const types = target.bossTypes ?? target.types ?? [];
    return [{
      formId,
      name,
      resultCategory: "raid-boss",
      types: [...types],
      moves: [],
      _name: normalizeSearchText(name),
      _formId: normalizeSearchText(formId),
      _fields: normalizedParts([name, formId, types, "raid boss"]),
    }];
  });
}


function fuzzyTokens(entry) {
  const tokens = new Set([entry._name, entry._formId, ...entry._fields]);
  for (const field of [entry._name, ...entry._fields]) {
    if (field.includes(" ")) for (const word of field.split(" ")) tokens.add(word);
  }
  return [...tokens];
}


export function buildSearchIndex(core) {
  const candidates = [
    ...formRows(core?.forms).map(formEntry).filter(Boolean),
    ...bossEntries(core),
  ];
  const unique = new Map();
  for (const entry of candidates) {
    const key = `${entry.resultCategory}:${entry.formId}`;
    if (!unique.has(key)) unique.set(key, Object.freeze({ ...entry, _fuzzyTokens: Object.freeze(fuzzyTokens(entry)) }));
  }
  return Object.freeze([...unique.values()].sort((left, right) => (
    left.formId.localeCompare(right.formId)
    || left.resultCategory.localeCompare(right.resultCategory)
  )));
}


// Typo tolerance: bounded Levenshtein edit distance, layered in as the last
// (lowest-priority) tier below. Chosen over trigram scoring because index
// fields here are short single tokens (a name, a form ID, a move, a type) —
// an O(n*m) DP per field is cheap at this size, and it gives an exact
// distance rather than trigram's approximate overlap score. A transposition
// ("teh" vs "the") costs 2 substitutions in plain Levenshtein, so it's still
// caught by the distance<=2 bound below. Bailing out once a DP row's minimum
// exceeds the bound (rowMin > maxDistance) keeps a full-corpus scan fast —
// see the latency test.
const FUZZY_MAX_DISTANCE = 2;
const FUZZY_MIN_QUERY_LENGTH = 3;

// Single reused row (no per-call array allocation — this runs per index
// entry per keystroke, so DP call overhead is what the latency test bounds).
// The classic single-row Levenshtein optimization: one preceding cell
// ("diagonal") is enough scalar state, no second array needed.
const editDistanceRow = [0];

function editDistanceAtMost(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return null;
  const n = b.length;
  while (editDistanceRow.length <= n) editDistanceRow.push(0);
  for (let j = 0; j <= n; j += 1) editDistanceRow[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = editDistanceRow[0];
    editDistanceRow[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j += 1) {
      const upLeft = diagonal;
      diagonal = editDistanceRow[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      editDistanceRow[j] = Math.min(editDistanceRow[j] + 1, editDistanceRow[j - 1] + 1, upLeft + cost);
      if (editDistanceRow[j] < rowMin) rowMin = editDistanceRow[j];
    }
    if (rowMin > maxDistance) return null;
  }
  const distance = editDistanceRow[n];
  return distance <= maxDistance ? distance : null;
}

// A typo'd single word ("raichy") should still match inside a multi-word
// name ("mega raichu y") without the unrelated words inflating the whole-
// field distance — so the fuzzy candidate set is the field plus its words,
// precomputed once per entry at index-build time (see buildSearchIndex)
// rather than re-split on every keystroke.
function fuzzyDistance(entry, query) {
  if (query.length < FUZZY_MIN_QUERY_LENGTH) return null;
  let best = null;
  for (const token of entry._fuzzyTokens) {
    const distance = editDistanceAtMost(token, query, FUZZY_MAX_DISTANCE);
    if (distance !== null && (best === null || distance < best)) best = distance;
  }
  return best;
}


function relevance(entry, query) {
  if (entry._name === query || entry._formId === query) return 0;
  if (entry._name.startsWith(query) || entry._formId.startsWith(query)) return 1;
  if (entry._fields.some((field) => field === query)) return 2;
  if (entry._fields.some((field) => field.startsWith(query))) return 3;
  if (entry._fields.some((field) => field.includes(query))) return 4;
  const fuzzy = fuzzyDistance(entry, query);
  if (fuzzy !== null) return 5 + fuzzy;
  return Number.POSITIVE_INFINITY;
}


// Recent searches: last-N confirmed queries, most recent first, persisted
// like theme.js/text-size.js (a flat localStorage record, not roster state).
const RECENT_SEARCHES_STORAGE_KEY = "pogo-recent-searches";
export const RECENT_SEARCHES_MAX = 6;

export function loadRecentSearches(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(RECENT_SEARCHES_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === "string" && entry.trim()).slice(0, RECENT_SEARCHES_MAX);
  } catch {
    return [];
  }
}

function persistRecentSearches(storage, terms) {
  try {
    storage?.setItem?.(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(terms));
  } catch {
    // Storage can legitimately be unavailable — the choice still applies for
    // this session, it just won't persist to the next visit.
  }
  return terms;
}

export function saveRecentSearch(storage, term) {
  const trimmed = String(term ?? "").trim();
  if (!trimmed) return loadRecentSearches(storage);
  const deduped = loadRecentSearches(storage).filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  return persistRecentSearches(storage, [trimmed, ...deduped].slice(0, RECENT_SEARCHES_MAX));
}

export function removeRecentSearch(storage, term) {
  return persistRecentSearches(storage, loadRecentSearches(storage).filter((entry) => entry !== term));
}


export function search(index, query, { limit = 50 } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const categoryOrder = { pokemon: 0, "raid-boss": 1 };
  const scored = index
    .map((entry) => ({ entry, score: relevance(entry, normalizedQuery) }))
    .filter(({ score }) => Number.isFinite(score));
  // Fuzzy (tier 5+) is a typo-tolerance fallback, not extra noise on top of
  // real matches — suppress it whenever an exact/prefix/substring hit exists.
  const hasRealMatch = scored.some(({ score }) => score < 5);
  return (hasRealMatch ? scored.filter(({ score }) => score < 5) : scored)
    .sort((left, right) => (
      left.score - right.score
      || left.entry.name.localeCompare(right.entry.name)
      || (categoryOrder[left.entry.resultCategory] ?? 99)
        - (categoryOrder[right.entry.resultCategory] ?? 99)
      || left.entry.formId.localeCompare(right.entry.formId)
    ))
    .slice(0, Math.max(0, Number.isInteger(limit) ? limit : 50))
    .map(({ entry }) => {
      const { _name, _formId, _fields, _fuzzyTokens, ...result } = entry;
      return result;
    });
}
