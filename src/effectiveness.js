// ponytail: type-effectiveness tables live in raid-target.js (already
// exported as ATTACK_TYPES/effectiveness() and used by views/home.js) —
// reuse them instead of a second drift-prone copy. placement.js's own
// SUPER/RESISTED/DOUBLE_RESISTED are still unexported and owned by a
// parallel round-1 refactor, so this stays pointed at raid-target.js.
import { ATTACK_TYPES, effectiveness } from "./raid-target.js";

export function typeEffectiveness(attackingType, form) {
  return effectiveness(attackingType, form.primary_type, form.secondary_type);
}


export function weaknessesOf(form) {
  return new Set(ATTACK_TYPES.filter((attackingType) => typeEffectiveness(attackingType, form) > 1));
}


// Coverage note for a small lineup (e.g. a PvP trio): flags a type every
// member is weak to, falling back to a majority-shared type, falling back to
// "no shared weakness".
export function coverageNote(forms) {
  const usable = (forms ?? []).filter(Boolean);
  if (usable.length < 2) return "";
  const weaknessSets = usable.map(weaknessesOf);
  const sharedByAll = ATTACK_TYPES.filter((type) => weaknessSets.every((set) => set.has(type)));
  if (sharedByAll.length) {
    return `Your trio is all weak to ${sharedByAll.join(", ")}.`;
  }
  const counts = Object.fromEntries(ATTACK_TYPES.map((type) => [
    type, weaknessSets.filter((set) => set.has(type)).length,
  ]));
  const majority = ATTACK_TYPES
    .filter((type) => counts[type] >= 2)
    .sort((left, right) => counts[right] - counts[left] || left.localeCompare(right));
  if (majority.length) {
    const article = /^[AEIOU]/.test(majority[0]) ? "an" : "a";
    return `${counts[majority[0]]} of your ${usable.length} share ${article} ${majority[0]} weakness.`;
  }
  return "No shared weaknesses across your trio — solid type coverage.";
}
