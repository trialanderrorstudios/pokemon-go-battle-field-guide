// Purge-string builder: turns the roster into a conservative "safe to
// transfer" plan plus copy-paste in-game search strings, so a bulk transfer
// pass can happen inside Pokémon GO itself instead of one-by-one in this app.
//
// SCOPE: this module only ever sees { roster, forms } — no raid/PvP/gym
// value data. Without that signal there is no honest way to judge a single
// copy of a species as "not worth keeping", so this stays conservative by
// construction:
//   - Every roster.instances entry (a copy the player bothered to enter
//     exact CP/IVs for) is ALWAYS a keep. A recorded instance is a
//     deliberate keep, not a candidate.
//   - The only transfer candidates are extra star-only copies of a species
//     (ownedFormCounts > 1) that carry none of the KEEP flags below — the
//     first copy of every species is always kept too.
// This is a suggestion list, not a verdict: see purge.js's header copy.
import { toSearchName } from "./game-search.js";

// SEARCH STRING LENGTH: the in-game inventory search field's exact character
// cap is not verified to this app's normal two-independent-source standard —
// only one source (pogocleanup.com, "200 characters") states a number, and
// the one corroborating lead (a Google Android Support Community thread
// suggesting the real cap is device/OS-dependent) returned HTTP 410 and
// could not be recovered by any means tried (checked 2026-08-13). Rather
// than bake in the single-sourced 200, this targets a conservative budget
// with headroom below it — same honest-sourcing posture as
// RENAME_MAX_LENGTH (rename-string.js) and SEARCH_NAME_CHUNK_SIZE
// (game-search.js).
// ponytail: bump toward 200 once the real limit is confirmed on-device.
export const PURGE_SEARCH_CHAR_BUDGET = 150;

const KEEP_TAGS = new Set(["legendary", "mythical", "trade-value"]);

function formTags(form) {
  return new Set((form?.tags ?? []).map((tag) => String(tag).toLowerCase()));
}

function tradeBaitReason(form) {
  const tags = formTags(form);
  if (tags.has("legendary") || tags.has("mythical")) {
    return "Legendary/Mythical — trade bait, transferring forces a lucky trade to get another.";
  }
  if (tags.has("trade-value")) return "Tagged trade-value — trade bait.";
  return null;
}

// One reason per detailed instance — most-notable flag wins, falling back to
// "you recorded this" since that alone is always enough to keep it.
function instanceKeepReason(instance, form) {
  const ivs = instance?.ivs;
  const ivSum = ivs && [ivs.atk, ivs.def, ivs.sta].every(Number.isInteger)
    ? ivs.atk + ivs.def + ivs.sta
    : null;
  if (ivSum !== null && ivSum >= 41) return `Hundo or near-hundo — IV sum ${ivSum}/45.`;
  if (instance.isShiny) return "Shiny.";
  if (instance.isLucky) return "Lucky.";
  const tradeBait = tradeBaitReason(form);
  if (tradeBait) return tradeBait;
  if (instance.sizeClass === "xxs" || instance.sizeClass === "xxl") {
    return `${instance.sizeClass.toUpperCase()} size — showcase-worthy.`;
  }
  if (instance.buddyLevel === "best") return "Best Buddy.";
  if (instance.buddyLevel) return `Buddy progress (${instance.buddyLevel}).`;
  if (instance.canDynamax || instance.canGigantamax) return "Flagged for Dynamax/Gigantamax.";
  return "You recorded details for this copy — treated as a deliberate keep.";
}

function speciesKeepReason(formId, form, roster) {
  if ((roster.favorites ?? []).includes(formId)) return "Favorited.";
  if ((roster.shinyOwnedFormIds ?? []).includes(formId)) return "Shiny owned of this species.";
  if ((roster.luckyOwnedFormIds ?? []).includes(formId)) return "Lucky owned of this species.";
  return tradeBaitReason(form);
}

// Each chunk is self-contained (no AND across separate pastes, per the
// operator research) and stays under the char budget, except a single name
// longer than the whole budget on its own — never split mid-name.
function chunkSearchNames(names, budget = PURGE_SEARCH_CHAR_BUDGET) {
  const chunks = [];
  let current = [];
  for (const name of names) {
    const candidate = [...current, name];
    if (current.length && candidate.join(",").length > budget) {
      chunks.push(current.join(","));
      current = [name];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current.join(","));
  return chunks;
}

export function buildPurgePlan({ roster = {}, forms = {} } = {}) {
  const keeps = [];
  const transfers = [];

  for (const instance of roster.instances ?? []) {
    const form = forms[instance.formId] ?? null;
    keeps.push({
      kind: "instance",
      id: instance.id,
      formId: instance.formId,
      name: form?.name ?? instance.formId,
      reason: instanceKeepReason(instance, form),
    });
  }

  const detailedFormIds = new Set((roster.instances ?? []).map((instance) => instance.formId));
  for (const formId of roster.ownedFormIds ?? []) {
    if (detailedFormIds.has(formId)) continue; // already represented by a detailed instance above
    const form = forms[formId] ?? null;
    const name = form?.name ?? formId;
    const count = roster.ownedFormCounts?.[formId] ?? 1;
    const flaggedReason = speciesKeepReason(formId, form, roster);

    if (flaggedReason) {
      keeps.push({ kind: "species", formId, name, count, reason: flaggedReason });
      continue;
    }
    if (count <= 1) {
      keeps.push({
        kind: "species", formId, name, count,
        reason: "Only copy of this species on record — kept to protect your dex.",
      });
      continue;
    }
    keeps.push({
      kind: "species", formId, name, count: 1,
      reason: `Kept 1 of ${count} copies of this species.`,
    });
    transfers.push({
      kind: "species", formId, name, count: count - 1,
      reason: `${count - 1} extra unflagged cop${count - 1 === 1 ? "y" : "ies"} beyond your first — no shiny/lucky/favorite/trade-bait flag on this species.`,
    });
  }

  const searchNames = [...new Set(
    transfers.map((row) => toSearchName(row.name)).filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
  const searchStrings = chunkSearchNames(searchNames);
  // toSearchName() fails closed on names it can't verify in the in-game
  // grammar — those candidates must surface as an honest "not included"
  // note, never vanish (same excludedCount affordance game-search.js's own
  // buildSearchQuery ships for exactly this reason; review catch).
  const unmappableNames = [...new Set(
    transfers.filter((row) => !toSearchName(row.name)).map((row) => row.name),
  )].sort((left, right) => left.localeCompare(right));

  return { keeps, transfers, searchStrings, unmappableNames };
}
