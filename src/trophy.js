// Trophy case (fun item 2): the roster's brag-worthy instances, sorted into
// shelves. Pure data layer — web/src/views/trophy.js is the only renderer.
// Shelf membership is per-instance, not exclusive: an XXL hundo lands on
// BOTH the hundos shelf and the giants shelf, same as a shiny that's also
// lucky shows up on both of those in collection.js's badges.
//
// Each entry composes showcaseEstimate() (showcase.js) rather than
// re-deriving any of its height/weight/IV math — a trophy card that has a
// showcase estimate shows it, one that doesn't (no recorded size, or no
// baseline for the form) just omits it.
import { showcaseEstimate } from "./showcase.js";

function ivSum(ivs) {
  const complete = [ivs?.atk, ivs?.def, ivs?.sta].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 15,
  );
  return complete ? ivs.atk + ivs.def + ivs.sta : null;
}

function byCpDesc(entries) {
  return [...entries].sort((left, right) => (right.instance.cp ?? 0) - (left.instance.cp ?? 0));
}

export function trophyCase({ roster, forms } = {}) {
  const shelves = {
    hundos: [], shinies: [], luckies: [], giants: [], minis: [],
  };
  for (const instance of roster?.instances ?? []) {
    const form = forms?.[instance?.formId];
    if (!form) continue; // dangling/unreleased formId — never guess a shelf entry
    const entry = { form, instance, estimate: showcaseEstimate(form, instance) };
    if (ivSum(instance.ivs) === 45) shelves.hundos.push(entry);
    if (instance.isShiny) shelves.shinies.push(entry);
    if (instance.isLucky) shelves.luckies.push(entry);
    if (instance.sizeClass === "xxl") shelves.giants.push(entry);
    if (instance.sizeClass === "xxs") shelves.minis.push(entry);
  }
  const ordered = Object.fromEntries(
    Object.entries(shelves).map(([key, entries]) => [key, byCpDesc(entries)]),
  );
  const counts = Object.fromEntries(
    Object.entries(ordered).map(([key, entries]) => [key, entries.length]),
  );
  return { ...ordered, counts };
}
