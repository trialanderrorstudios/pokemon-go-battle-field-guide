const SUPER = {
  Normal: [], Fire: ["Grass", "Ice", "Bug", "Steel"], Water: ["Fire", "Ground", "Rock"],
  Electric: ["Water", "Flying"], Grass: ["Water", "Ground", "Rock"],
  Ice: ["Grass", "Ground", "Flying", "Dragon"], Fighting: ["Normal", "Ice", "Rock", "Dark", "Steel"],
  Poison: ["Grass", "Fairy"], Ground: ["Fire", "Electric", "Poison", "Rock", "Steel"],
  Flying: ["Grass", "Fighting", "Bug"], Psychic: ["Fighting", "Poison"],
  Bug: ["Grass", "Psychic", "Dark"], Rock: ["Fire", "Ice", "Flying", "Bug"],
  Ghost: ["Psychic", "Ghost"], Dragon: ["Dragon"], Dark: ["Psychic", "Ghost"],
  Steel: ["Ice", "Rock", "Fairy"], Fairy: ["Fighting", "Dragon", "Dark"],
};

const RESISTED = {
  Normal: ["Rock", "Steel"], Fire: ["Fire", "Water", "Rock", "Dragon"],
  Water: ["Water", "Grass", "Dragon"], Electric: ["Electric", "Grass", "Dragon"],
  Grass: ["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"],
  Ice: ["Fire", "Water", "Ice", "Steel"], Fighting: ["Poison", "Flying", "Psychic", "Bug", "Fairy"],
  Poison: ["Poison", "Ground", "Rock", "Ghost"], Ground: ["Grass", "Bug"],
  Flying: ["Electric", "Rock", "Steel"], Psychic: ["Psychic", "Steel"],
  Bug: ["Fire", "Fighting", "Poison", "Flying", "Ghost", "Steel", "Fairy"],
  Rock: ["Fighting", "Ground", "Steel"], Ghost: ["Dark"], Dragon: ["Steel"],
  Dark: ["Fighting", "Dark", "Fairy"], Steel: ["Fire", "Water", "Electric", "Steel"],
  Fairy: ["Fire", "Poison", "Steel"],
};

// Pokémon GO treats these matchups as stronger resistance, never zero damage.
const DOUBLE_RESISTED = {
  Normal: ["Ghost"], Electric: ["Ground"], Fighting: ["Ghost"], Poison: ["Steel"],
  Ground: ["Flying"], Psychic: ["Dark"], Ghost: ["Normal"], Dragon: ["Fairy"],
};

export const ATTACK_TYPES = Object.freeze([
  "Bug", "Dark", "Dragon", "Electric", "Fairy", "Fighting", "Fire", "Flying", "Ghost",
  "Grass", "Ground", "Ice", "Normal", "Poison", "Psychic", "Rock", "Steel", "Water",
]);


export function effectiveness(attackingType, primaryType, secondaryType = null) {
  let multiplier = 1;
  for (const defendingType of [primaryType, secondaryType]) {
    if (!defendingType) continue;
    if (DOUBLE_RESISTED[attackingType]?.includes(defendingType)) multiplier *= 0.390625;
    else if (SUPER[attackingType]?.includes(defendingType)) multiplier *= 1.6;
    else if (RESISTED[attackingType]?.includes(defendingType)) multiplier *= 0.625;
  }
  return multiplier;
}


function unwrap(data) {
  return {
    forms: data.forms ?? data.core?.forms ?? {},
    raids: data.raids?.regular ? data.raids : data.raids?.raids ?? {},
    tool: data.raidTargetTool?.targets
      ? data.raidTargetTool
      : data.raidTargetTool?.raidTargetTool ?? {},
  };
}


function compareCounters(left, right) {
  return (right.effectiveness - left.effectiveness)
    || (Number(left.rank) - Number(right.rank))
    || (Number(right.points ?? 0) - Number(left.points ?? 0))
    || String(left.formId).localeCompare(String(right.formId));
}


function counterLane(rows, bossTypes, { limit, owned = null }) {
  const candidates = [];
  for (const row of rows ?? []) {
    if (row?.status !== "ranked" || !row.formId || (owned && !owned.has(row.formId))) continue;
    const multiplier = effectiveness(row.attackingType, bossTypes[0], bossTypes[1]);
    if (multiplier <= 1) continue;
    candidates.push({ ...row, typeRank: row.rank, effectiveness: Math.round(multiplier * 10000) / 10000 });
  }
  candidates.sort(compareCounters);
  const output = [];
  const seen = new Set();
  for (const row of candidates) {
    if (seen.has(row.formId)) continue;
    seen.add(row.formId);
    output.push(row);
    if (output.length === limit) break;
  }
  return output;
}


function encounterBand(target, encounterLevel) {
  if (["weatherBoosted", "boosted", 25, "25", 25.0].includes(encounterLevel)) {
    return ["weatherBoosted", target.weatherBoosted];
  }
  if (["normal", "unboosted", 20, "20", 20.0, undefined, null].includes(encounterLevel)) {
    return ["normal", target.normal];
  }
  throw new RangeError(`Unknown raid encounter level: ${encounterLevel}`);
}


function hundoVerdict(observedCp, band) {
  if (observedCp === undefined || observedCp === null || observedCp === "") {
    return { status: "not-entered", message: "Enter the catch-screen CP to compare." };
  }
  const cp = Number(observedCp);
  if (!Number.isInteger(cp) || cp <= 0) {
    return { status: "invalid", message: "Enter a positive whole-number CP from the catch screen." };
  }
  if (cp === band.hundoCP) {
    return { status: "hundo", message: "Hundo CP — this is the 15/15/15 maximum at this encounter level." };
  }
  if (cp >= band.minimumRaidIVCP && cp < band.hundoCP) {
    return { status: "in-range-not-hundo", message: "Within the raid IV range, but not the hundo CP." };
  }
  return {
    status: "outside-range",
    message: "Outside the expected 10/10/10–15/15/15 range for this encounter level.",
  };
}


export function buildRaidPlan({
  targetFormId,
  observedCp,
  encounterLevel = "normal",
  ownedFormIds = [],
} = {}, data = {}) {
  const { forms, raids, tool } = unwrap(data);
  const target = (tool.targets ?? []).find((row) => row.bossFormId === targetFormId);
  if (!target || !forms[targetFormId]) throw new RangeError(`Unknown raid target form: ${targetFormId}`);

  const bossTypes = target.bossTypes ?? [forms[targetFormId].primary_type, forms[targetFormId].secondary_type].filter(Boolean);
  const weaknesses = ATTACK_TYPES
    .map((attackingType) => ({
      attackingType,
      effectiveness: Math.round(effectiveness(attackingType, bossTypes[0], bossTypes[1]) * 10000) / 10000,
    }))
    .filter((row) => row.effectiveness > 1)
    .sort((left, right) => (right.effectiveness - left.effectiveness)
      || left.attackingType.localeCompare(right.attackingType));
  const limit = Number.isInteger(tool.counterLimit) && tool.counterLimit > 0 ? tool.counterLimit : 12;
  const regularRows = raids.regular ?? [];
  const shadowRows = raids.shadow ?? [];
  const owned = new Set((ownedFormIds ?? []).filter((formId) => typeof formId === "string"));
  const [bandName, band] = encounterBand(target, encounterLevel);

  return {
    target,
    encounterLevel: bandName,
    encounterBand: band,
    hundoVerdict: hundoVerdict(observedCp, band),
    weatherBoostConditions: [...(target.weatherBoostConditions ?? [])],
    weaknesses,
    regularCounters: counterLane(regularRows, bossTypes, { limit }),
    shadowCounters: counterLane(shadowRows, bossTypes, { limit }),
    ownedCounters: counterLane([...regularRows, ...shadowRows], bossTypes, { limit, owned }),
    caveat: tool.caveat ?? "Counter order is a quick practical guide; live battle conditions can change results.",
  };
}

