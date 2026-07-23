// Fast-move-count math for PvP matchups ("N Counters -> Power-Up Punch").
// Energy numbers come from methodology.pvpMoveCatalog — parsed from
// pvpoke-moves.json in src/pogo_encyclopedia/pvp_moves.py, which closes the
// round-6 data gap (docs/move-counts-spike.md: the raid-only moveCatalog
// only covered 93/135 real PvP moves). Same ceil(cost / gain) arithmetic
// that module and raid.py's raid DPS cycles both already use.
export function fastMoveCount(fastMoveId, chargedMoveId, pvpMoveCatalog = {}) {
  const fast = pvpMoveCatalog?.[fastMoveId];
  const charged = pvpMoveCatalog?.[chargedMoveId];
  if (!fast?.energyGain || !charged?.energy) return null;
  return Math.max(1, Math.ceil(charged.energy / fast.energyGain));
}

// One count per charged move for a given fast move, honestly dropping any
// charged move whose energy data isn't in this release's catalog rather
// than guessing.
export function moveCountsFor(fastMoveId, chargedMoveIds = [], pvpMoveCatalog = {}) {
  return (chargedMoveIds ?? [])
    .map((chargedMoveId) => ({ chargedMoveId, count: fastMoveCount(fastMoveId, chargedMoveId, pvpMoveCatalog) }))
    .filter((entry) => entry.count !== null);
}
