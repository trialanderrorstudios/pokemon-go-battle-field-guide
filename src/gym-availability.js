// Gym availability logic: track deployed Pokémon and exclude them from
// roster views, badge them in raid counters. Deployment is honest: only
// exact instance-id matches count; free-text entries in the defense log
// can't be matched to roster instances, so they're never badged.

export function buildDeploymentMap(log, now = Date.now()) {
  // Map formId → { deployed: true, elapsedMs, gym, entryId } for exact instance matches
  const deployed = new Map();
  for (const entry of log?.entries ?? []) {
    if (entry.endedAt) continue; // Completed entries are not deployed
    if (!entry.instanceId) continue; // Free-text entries are never matched
    deployed.set(entry.instanceId, {
      deployed: true,
      elapsedMs: Math.max(0, now - new Date(entry.startedAt).getTime()),
      gym: entry.gymName,
      entryId: entry.id,
    });
  }
  return deployed;
}

// ponytail: geo cache is local only, keyed by gym name, with lazy expiry
// (no timestamp check, just whatever's the latest entry). Simpler than
// staleness enforcement for a manual-tracking app.
export function getCachedGymCoords(storage, gymName) {
  try {
    const key = `gym-geo:${gymName}`;
    const cached = storage?.getItem?.(key);
    if (!cached) return null;
    const { lat, lng } = JSON.parse(cached);
    return { lat, lng };
  } catch {
    return null;
  }
}

export function setCachedGymCoords(storage, gymName, lat, lng) {
  try {
    const key = `gym-geo:${gymName}`;
    storage?.setItem?.(key, JSON.stringify({ lat, lng }));
  } catch {
    // Storage can be unavailable — just skip caching.
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2)
    + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find the nearest cached gym within 150m, or null if none qualify.
// Used on "I dropped a defender" to preselect a likely candidate.
// For tests, pass explicit gymNames array; for production, pass null to enumerate.
export function findNearestCachedGym(storage, lat, lng, maxMeters = 150, gymNames = null) {
  const allCached = [];
  const regex = /^gym-geo:(.+)$/;

  let gymsToCheck = gymNames ?? [];
  if (!gymNames && typeof Storage !== "undefined" && storage instanceof Storage) {
    // ponytail: enumerate localStorage keys if storage is the real thing
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      const match = regex.exec(key);
      if (match) gymsToCheck.push(match[1]);
    }
  }

  for (const gymName of gymsToCheck) {
    const coords = getCachedGymCoords(storage, gymName);
    if (coords) allCached.push({ gymName, ...coords });
  }

  let best = null;
  for (const { gymName, lat: cachedLat, lng: cachedLng } of allCached) {
    const distance = haversineMeters(lat, lng, cachedLat, cachedLng);
    if (distance <= maxMeters) {
      if (!best || distance < best.distance) {
        best = { gymName, distance };
      }
    }
  }
  return best?.gymName ?? null;
}

// Recent gyms: scoop the last 5 unique gym names from active + completed entries
export function getRecentGymNames(log, maxRecent = 5) {
  const seen = new Set();
  const recent = [];
  for (let i = (log?.entries ?? []).length - 1; i >= 0 && recent.length < maxRecent; i--) {
    const { gymName } = log.entries[i];
    if (!seen.has(gymName)) {
      seen.add(gymName);
      recent.push(gymName);
    }
  }
  return recent;
}

// Smart default for defender: the roster's top-ranked defender that is
// NOT currently deployed (not in the deploymentMap). Returns the formId
// or null.
export function getTopAvailableDefender(suggestions = [], deploymentMap = new Map()) {
  for (const suggestion of suggestions) {
    if (!deploymentMap.has(suggestion.instanceId ?? suggestion.formId)) {
      return suggestion.formId ?? suggestion.instanceId;
    }
  }
  return null;
}
