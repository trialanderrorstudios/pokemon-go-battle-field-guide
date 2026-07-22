// Move-level facts (type, fast/charged, power, energy, duration) come from
// the release's methodology.raidDps.moveCatalog — real published Game Master
// numbers, not invented ones. This module only buckets those numbers into an
// honest one-line role and joins move usage to the local roster.

// A "turn" is 500ms in Pokemon GO's move-timing model; DPT/EPT (damage/energy
// per turn) are the standard community metrics this bucketing is based on.
// Thresholds below are calibrated against this release's own moveCatalog (72
// fast moves: EPT ranges 3.0-10.0, DPT ranges 0-7.0, and the two trade off
// against each other), not generic PvP-community defaults — those don't
// discriminate against PvE stats and previously left 71/72 moves in one
// bucket.
const TURN_MS = 500;

export function moveRoleLabel(entry) {
  if (!entry || !Number.isFinite(entry.power) || !Number.isFinite(entry.energyDelta) || !Number.isFinite(entry.durationMs)) {
    return "Move details are not documented in this release.";
  }
  const turns = Math.max(1, entry.durationMs / TURN_MS);
  const damagePerTurn = entry.power / turns;
  if (entry.slot === "fast") {
    const energyPerTurn = entry.energyDelta / turns;
    if (energyPerTurn >= 6) return "Fast energy generator — spam it to fuel the charged move.";
    if (damagePerTurn >= 6.5) return "Hard-hitting fast move — solid chip damage every turn.";
    return "Balanced fast move — steady energy and damage.";
  }
  const energyCost = Math.abs(entry.energyDelta);
  if (energyCost <= 35) return "Cheap charged move — fire it often.";
  // Raid bosses and gym defenders don't have shields (that's a PvP-only
  // mechanic against another trainer), so this can't reference one.
  if (energyCost >= 90) return "Big charged move — slow to charge, so save it for a real opening.";
  return "Mid-cost charged move — a reliable follow-up hit.";
}


function addUse(index, moveId, formId, pokemon, context) {
  if (!moveId || !formId) return;
  if (!index.has(moveId)) index.set(moveId, []);
  const uses = index.get(moveId);
  if (!uses.some((use) => use.formId === formId)) uses.push({ formId, pokemon, context });
}


// Built from the "optimal" raid movesets (not the practical/legal ones) and
// the PvP rank-1 movesets — both already labeled "optimal" by their own data,
// so "which owned Pokemon use this move well" doesn't need a second opinion.
export function buildMoveIndex(raids = {}, pvp = {}) {
  const index = new Map();
  for (const row of [...(raids.regular ?? []), ...(raids.shadow ?? [])]) {
    addUse(index, row.optimalFastMove, row.formId, row.pokemon, "raid");
    addUse(index, row.optimalChargedMove, row.formId, row.pokemon, "raid");
  }
  for (const rows of Object.values(pvp ?? {})) {
    for (const row of rows ?? []) {
      addUse(index, row.fastMove, row.formId, row.pokemon, "pvp");
      for (const chargedMove of row.chargedMoves ?? []) addUse(index, chargedMove, row.formId, row.pokemon, "pvp");
    }
  }
  return index;
}


export function ownedMoveUsers(moveId, moveIndex, ownedFormIds = []) {
  const owned = new Set(ownedFormIds);
  return (moveIndex.get(moveId) ?? []).filter((use) => owned.has(use.formId));
}
