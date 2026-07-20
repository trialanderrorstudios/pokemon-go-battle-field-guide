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


export function buildSearchIndex(core) {
  const candidates = [
    ...formRows(core?.forms).map(formEntry).filter(Boolean),
    ...bossEntries(core),
  ];
  const unique = new Map();
  for (const entry of candidates) {
    const key = `${entry.resultCategory}:${entry.formId}`;
    if (!unique.has(key)) unique.set(key, Object.freeze(entry));
  }
  return Object.freeze([...unique.values()].sort((left, right) => (
    left.formId.localeCompare(right.formId)
    || left.resultCategory.localeCompare(right.resultCategory)
  )));
}


function relevance(entry, query) {
  if (entry._name === query || entry._formId === query) return 0;
  if (entry._name.startsWith(query) || entry._formId.startsWith(query)) return 1;
  if (entry._fields.some((field) => field === query)) return 2;
  if (entry._fields.some((field) => field.startsWith(query))) return 3;
  if (entry._fields.some((field) => field.includes(query))) return 4;
  return Number.POSITIVE_INFINITY;
}


export function search(index, query, { limit = 50 } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const categoryOrder = { pokemon: 0, "raid-boss": 1 };
  return index
    .map((entry) => ({ entry, score: relevance(entry, normalizedQuery) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => (
      left.score - right.score
      || left.entry.name.localeCompare(right.entry.name)
      || (categoryOrder[left.entry.resultCategory] ?? 99)
        - (categoryOrder[right.entry.resultCategory] ?? 99)
      || left.entry.formId.localeCompare(right.entry.formId)
    ))
    .slice(0, Math.max(0, Number.isInteger(limit) ? limit : 50))
    .map(({ entry }) => {
      const { _name, _formId, _fields, ...result } = entry;
      return result;
    });
}
