// Canonical Pokémon GO type-effectiveness table. Every feature that needs a
// weakness/resistance/multiplier answer derives it from here — do not
// hand-author a second copy of these tables anywhere else in the app.

export const ATTACK_TYPES = Object.freeze([
  "Bug", "Dark", "Dragon", "Electric", "Fairy", "Fighting", "Fire", "Flying", "Ghost",
  "Grass", "Ground", "Ice", "Normal", "Poison", "Psychic", "Rock", "Steel", "Water",
]);

const SUPER = {
  Bug: ["Dark", "Grass", "Psychic"], Dark: ["Ghost", "Psychic"], Dragon: ["Dragon"],
  Electric: ["Flying", "Water"], Fairy: ["Dark", "Dragon", "Fighting"],
  Fighting: ["Dark", "Ice", "Normal", "Rock", "Steel"], Fire: ["Bug", "Grass", "Ice", "Steel"],
  Flying: ["Bug", "Fighting", "Grass"], Ghost: ["Ghost", "Psychic"],
  Grass: ["Ground", "Rock", "Water"], Ground: ["Electric", "Fire", "Poison", "Rock", "Steel"],
  Ice: ["Dragon", "Flying", "Grass", "Ground"], Normal: [], Poison: ["Fairy", "Grass"],
  Psychic: ["Fighting", "Poison"], Rock: ["Bug", "Fire", "Flying", "Ice"],
  Steel: ["Fairy", "Ice", "Rock"], Water: ["Fire", "Ground", "Rock"],
};
const RESISTED = {
  Bug: ["Fairy", "Fighting", "Fire", "Flying", "Ghost", "Poison", "Steel"],
  Dark: ["Dark", "Fairy", "Fighting"], Dragon: ["Steel"], Electric: ["Dragon", "Electric", "Grass"],
  Fairy: ["Fire", "Poison", "Steel"], Fighting: ["Bug", "Fairy", "Flying", "Poison", "Psychic"],
  Fire: ["Dragon", "Fire", "Rock", "Water"], Flying: ["Electric", "Rock", "Steel"], Ghost: ["Dark"],
  Grass: ["Bug", "Dragon", "Fire", "Flying", "Grass", "Poison", "Steel"], Ground: ["Bug", "Grass"],
  Ice: ["Fire", "Ice", "Steel", "Water"], Normal: ["Rock", "Steel"],
  Poison: ["Ghost", "Ground", "Poison", "Rock"], Psychic: ["Psychic", "Steel"],
  Rock: ["Fighting", "Ground", "Steel"], Steel: ["Electric", "Fire", "Steel", "Water"],
  Water: ["Dragon", "Grass", "Water"],
};
const DOUBLE_RESISTED = {
  Dragon: ["Fairy"], Electric: ["Ground"], Fighting: ["Ghost"], Ghost: ["Normal"],
  Ground: ["Flying"], Normal: ["Ghost"], Poison: ["Steel"], Psychic: ["Dark"],
};

// 6 decimal places, not 4: 0.390625 (double-resisted) needs all six to stay exact.
function round(value) {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

// defenderTypes is 1-2 type names (nullish entries, e.g. a mono-type
// Pokémon's missing secondary type, are ignored).
export function effectivenessOf(attackType, defenderTypes) {
  let multiplier = 1;
  for (const defendingType of (defenderTypes ?? []).filter(Boolean)) {
    if (DOUBLE_RESISTED[attackType]?.includes(defendingType)) multiplier *= 0.390625;
    else if (SUPER[attackType]?.includes(defendingType)) multiplier *= 1.6;
    else if (RESISTED[attackType]?.includes(defendingType)) multiplier *= 0.625;
  }
  return multiplier;
}

function ratedTypes(defenderTypes, keep) {
  return ATTACK_TYPES
    .map((type) => ({ type, multiplier: round(effectivenessOf(type, defenderTypes)) }))
    .filter((row) => keep(row.multiplier));
}

// [{ type, multiplier }] for attacking types that hit defenderTypes for
// more than neutral damage (1.6x super effective, 2.56x double weakness),
// strongest first.
export function weaknessesOf(defenderTypes) {
  return ratedTypes(defenderTypes, (multiplier) => multiplier > 1)
    .sort((left, right) => right.multiplier - left.multiplier || left.type.localeCompare(right.type));
}

// [{ type, multiplier }] for attacking types that defenderTypes shrugs off
// (0.625x resisted, 0.390625x double resisted), most-resisted first.
export function resistancesOf(defenderTypes) {
  return ratedTypes(defenderTypes, (multiplier) => multiplier < 1)
    .sort((left, right) => left.multiplier - right.multiplier || left.type.localeCompare(right.type));
}
