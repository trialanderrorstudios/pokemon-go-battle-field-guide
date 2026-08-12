import { TIPS } from "./tricks.js";
import { weaknessesOf } from "./type-chart.js";

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


// The data stores "Tyranitar (Shadow)"; players type "shadow tyranitar", and
// 586 of 586 reversed-order queries returned nothing because relevance() has no
// per-token AND. Indexing the reversed spelling as a field is enough — it lands
// on the existing exact/prefix tiers. Multi-suffix forms are the trap: one
// greedy rewrite leaves "Marowak (Alolan) (Shadow)" as "shadow marowak alolan",
// so "alolan marowak" still fails. Each suffix gets its own alias instead.
function reversedNameAliases(name) {
  const suffixes = [...name.matchAll(/\(([^()]+)\)/g)].map((match) => match[1].trim()).filter(Boolean);
  const base = name.replace(/\s*\([^()]*\)/g, "").trim();
  if (!suffixes.length || !base) return [];
  const aliases = [];
  for (const suffix of suffixes) {
    const words = suffix.split(/\s+/);
    aliases.push(`${suffix} ${base}`);
    // "Charizard (Mega X)" also has to answer "mega charizard" and "mega
    // charizard x"; one alias covers both, the shorter query being its prefix.
    if (words.length > 1) aliases.push(`${words[0]} ${base} ${words.slice(1).join(" ")}`);
  }
  // "shadow alolan marowak" — the whole suffix stack, reader's order.
  if (suffixes.length > 1) aliases.push(`${[...suffixes].reverse().join(" ")} ${base}`);
  return aliases;
}


function formEntry(form, bandVocabByFormId) {
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
  // A gym-band member (see bandVocabByFormId below) also picks up its band's
  // "anti <type>" vocabulary here, so searching the band's own words surfaces
  // the defender directly, not just the band's reference card.
  const bandVocab = bandVocabByFormId?.get(formId) ?? [];
  const fields = normalizedParts([form.name, reversedNameAliases(form.name), formId, types, moves, bandVocab]);
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


// Tips are static (not part of the release-data `core`), so they're always
// included rather than derived from the `core` argument like forms/bosses.
// Body text is stripped of the jargon-term markup (see glossary.js's
// jargonTerm) before indexing so search fields hold plain words, not HTML.
// Reference pages that answer a search on their own. Max Battles is the case
// that forced this: a Gigantamax Rillaboom event day, and searching
// "gigantamax", "gmax", "dynamax" or "max battle" returned "No local matches" —
// the species name was the only route in, and it is the one word a player
// looking for the event is least likely to type. These carry a destination
// rather than a formId, so the renderer links them instead of showing a sprite.
export const REFERENCE_PAGES = Object.freeze([
  {
    id: "reference-max-battles",
    title: "Max Battles",
    route: "basics",
    view: "max",
    // Aliases, not prose: what someone would actually type. Gigantamax and
    // Dynamax bosses are Max Battles, so both land here.
    terms: [
      "max battles", "max battle", "gigantamax", "gmax", "dynamax", "dmax",
      "power spot", "power spots", "max particles", "max moves", "max monday",
    ],
  },
  {
    id: "reference-budget-attackers",
    title: "Budget Attackers",
    route: "more",
    view: "budget",
    // The page existed and answered the question well; nobody could find it.
    // Reported as "do we have a section for budget raid attackers?" — we did.
    terms: [
      "budget attackers", "budget raid", "cheap attackers", "cheap raid",
      "low stardust", "low candy", "best value", "value attackers", "on a budget",
    ],
  },
  {
    id: "reference-evolution-items",
    title: "Evolution items",
    route: "basics",
    view: "items",
    terms: [
      "evolution item", "evolution items", "sinnoh stone", "unova stone",
      "metal coat", "dragon scale", "kings rock", "sun stone", "up-grade",
      "lure module", "special item",
    ],
  },
]);


function referenceEntries() {
  return REFERENCE_PAGES.map((page) => ({
    formId: page.id,
    name: page.title,
    resultCategory: "reference",
    route: page.route,
    view: page.view,
    types: [],
    moves: [],
    _name: normalizeSearchText(page.title),
    _formId: normalizeSearchText(page.id),
    _fields: normalizedParts([page.title, ...page.terms]),
  }));
}


// Gym anti-<type> bands (gym.bands, kind === "anti"): a band answers "which
// defenders resist an incoming <type> attacker". DEFECT 9 — the app computes
// this but a search for "anti fighting", a band member's own name, or a
// specific attacker ("counter machamp") couldn't reach it. See
// bandVocabByFormId (tags each member's own pokemon entry) and
// bandReferenceEntries (one findable card per band) below.
function antiBands(gym) {
  const bands = Array.isArray(gym?.bands) ? gym.bands : [];
  return bands.filter((band) => band?.kind === "anti" && typeof band.id === "string");
}

// "anti-fighting" -> "fighting" (matches gyms.js's own bandThreatType, kept
// separate since that file is a view this task doesn't own).
function bandThreatType(band) {
  return band.id.replace(/^anti-/, "");
}

function bandVocabulary(type) {
  return [`anti ${type}`, `resist ${type}`, `resists ${type}`, `resistant to ${type}`];
}

// formId -> that defender's band vocabulary, so its own pokemon entry (not
// just the band's reference card) surfaces on "anti <type>".
function bandVocabByFormId(gym) {
  const map = new Map();
  for (const band of antiBands(gym)) {
    const vocab = bandVocabulary(bandThreatType(band));
    for (const row of band.rows ?? []) {
      if (typeof row.formId !== "string") continue;
      map.set(row.formId, [...(map.get(row.formId) ?? []), ...vocab]);
    }
  }
  return map;
}

// One findable "reference" card per band (same shape/rendering as
// REFERENCE_PAGES below) so "anti fighting" and a member's own name
// ("Drifblim") both reach it, even before its member defenders are searched
// individually.
function bandReferenceEntries(gym) {
  return antiBands(gym).map((band) => {
    const type = bandThreatType(band);
    // Defensive framing (operator misread "Anti-Grass" as an offense pick,
    // 2026-08-12); "anti <type>" stays findable via bandVocabulary below.
    const typeName = `${type[0].toUpperCase()}${type.slice(1)}`;
    const title = `Beats ${typeName} attackers — gym defenders`;
    const memberNames = (band.rows ?? []).map((row) => row.pokemon).filter(Boolean);
    return {
      formId: `gym-band-${band.id}`,
      name: title,
      resultCategory: "reference",
      route: "gyms",
      view: "defend",
      types: [`${type[0].toUpperCase()}${type.slice(1)}`],
      moves: [],
      _name: normalizeSearchText(title),
      _formId: normalizeSearchText(band.id),
      _fields: normalizedParts([title, band.id, ...bandVocabulary(type), memberNames]),
    };
  });
}


function tipEntries() {
  return TIPS.map((tip) => ({
    formId: tip.id,
    name: tip.title,
    resultCategory: "tip",
    types: [],
    moves: [],
    _name: normalizeSearchText(tip.title),
    _formId: normalizeSearchText(tip.id),
    _fields: normalizedParts([tip.title, tip.category, tip.body.replace(/<[^>]+>/g, " ")]),
  }));
}


function fuzzyTokens(entry) {
  const tokens = new Set([entry._name, entry._formId, ...entry._fields]);
  for (const field of [entry._name, ...entry._fields]) {
    if (field.includes(" ")) for (const word of field.split(" ")) tokens.add(word);
  }
  return [...tokens];
}


export function buildSearchIndex(core) {
  const bandVocab = bandVocabByFormId(core?.gym);
  const candidates = [
    ...formRows(core?.forms).map((form) => formEntry(form, bandVocab)).filter(Boolean),
    ...bossEntries(core),
    ...tipEntries(),
    ...referenceEntries(),
    ...bandReferenceEntries(core?.gym),
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


// "counter machamp" / "beats blissey" / "what beats blissey": these name an
// attacker, not the anti-<type> vocabulary itself (that's covered by the
// bandVocabulary fields above, e.g. plain "anti fighting"). Resolve the named
// pokemon's own type(s) — what it hits gyms WITH — and, failing that, what
// it's weak TO (the same "which anti-band answers this" question from a
// gym-defender's point of view, which is how "what beats Blissey" — Blissey
// itself has no offensive type worth a band — still lands on anti-fighting).
// Rewriting the query onto the matched band's own vocabulary reuses the
// normal scoring pipeline unchanged, so the band card AND its tagged member
// defenders both surface, sorted the same as any other search.
const COUNTER_QUERY_PATTERN = /^(?:what\s+beats|counter|beats)\s+(.+)$/;

function findPokemonEntry(index, name) {
  return index.find((entry) => entry.resultCategory === "pokemon" && entry._name === name)
    ?? index.find((entry) => entry.resultCategory === "pokemon" && entry._name.startsWith(name));
}

function findBandEntryForType(index, type) {
  return index.find((entry) => (
    entry.resultCategory === "reference" && entry.formId.startsWith("gym-band-") && entry.types[0] === type
  ));
}

function rewriteCounterQuery(index, normalizedQuery) {
  const match = normalizedQuery.match(COUNTER_QUERY_PATTERN);
  const target = match ? findPokemonEntry(index, match[1].trim()) : null;
  if (!target) return normalizedQuery;
  const candidateTypes = [...target.types, ...weaknessesOf(target.types).map((row) => row.type)];
  for (const type of candidateTypes) {
    const band = findBandEntryForType(index, type);
    if (band) return `anti ${type.toLowerCase()}`;
  }
  return normalizedQuery;
}

export function search(index, query, { limit = 50 } = {}) {
  const rawNormalizedQuery = normalizeSearchText(query);
  if (!rawNormalizedQuery) return [];
  const normalizedQuery = rewriteCounterQuery(index, rawNormalizedQuery);
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
