import { escapeHtml } from "./home.js";
import { jargonTerm } from "../glossary.js";
import { moveLink } from "./move-sheet.js";
import { stableRosterJson } from "../storage.js";
import { renderCollectionView } from "./collection.js";
import { luckyOwnedFormIdSet, shinyOwnedFormIdSet } from "../collection.js";


export const MORE_LISTS = Object.freeze({
  budget: Object.freeze({ title: "Budget Attackers", group: "Investment" }),
  megas: Object.freeze({ title: "Megas, Primals & Super Megas", group: "Collection" }),
  future: Object.freeze({ title: "Future-Proof Investments", group: "Investment" }),
  coverage: Object.freeze({ title: "Type Coverage Planner", group: "Collection" }),
  collection: Object.freeze({ title: "Living Dex Collection", group: "Collection" }),
});


function titleCase(value) {
  return String(value ?? "").toLowerCase().split("_")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}


function listRows(listId, data) {
  if (listId === "budget") return data.budgets?.raid ?? [];
  if (listId === "megas") return megaPriorityRows(data.megasPrimals ?? []);
  if (listId === "future") return futureImpactRows(data.futureProof ?? []);
  if (listId === "coverage") return data.coveragePlanner ?? [];
  return [];
}


function groupedImpactRows(rows, { availabilityFirst = false } = {}) {
  const grouped = new Map();
  for (const row of rows) {
    if (!row?.formId) continue;
    if (!grouped.has(row.formId)) grouped.set(row.formId, []);
    grouped.get(row.formId).push(row);
  }
  const tierOrder = { "S+": 0, S: 1, A: 2, B: 3, C: 4 };
  const availabilityOrder = { available: 0, permanent: 0, rotation_unknown: 1, unavailable: 2 };
  return [...grouped.values()].map((entries) => {
    const ranked = [...entries].sort((left, right) =>
      (tierOrder[left.investmentTier] ?? 9) - (tierOrder[right.investmentTier] ?? 9)
      || Number(left.rank ?? 99) - Number(right.rank ?? 99)
      || String(left.attackingType).localeCompare(String(right.attackingType)));
    const types = [...new Set(entries.map((row) => row.attackingType))].sort();
    return {
      ...ranked[0],
      impactTypes: types,
      impactBestRank: Math.min(...entries.map((row) => Number(row.rank ?? 99))),
      impactAverageRank: entries.reduce((sum, row) => sum + Number(row.rank ?? 99), 0) / entries.length,
    };
  }).sort((left, right) =>
    (availabilityFirst
      ? (availabilityOrder[left.availabilityStatus] ?? 1) - (availabilityOrder[right.availabilityStatus] ?? 1)
      : 0)
    || (tierOrder[left.investmentTier] ?? 9) - (tierOrder[right.investmentTier] ?? 9)
    || right.impactTypes.length - left.impactTypes.length
    || left.impactBestRank - right.impactBestRank
    || left.impactAverageRank - right.impactAverageRank
    || left.pokemon.localeCompare(right.pokemon))
    .map((row, index) => ({ ...row, impactPriority: index + 1 }));
}


export function megaPriorityRows(rows = []) {
  return groupedImpactRows(rows, { availabilityFirst: true });
}


export function futureImpactRows(rows = []) {
  return groupedImpactRows(rows);
}


function attackerListCard(row, listId) {
  const usesOptimalFast = Boolean(row.optimalFastMove);
  const usesOptimalCharged = Boolean(row.optimalChargedMove);
  const fastMove = usesOptimalFast ? row.optimalFastMove : row.fastMove;
  const chargedMove = usesOptimalCharged ? row.optimalChargedMove : row.chargedMove;
  const eliteFast = usesOptimalFast ? row.optimalEliteFastTM : row.eliteFastTM;
  const eliteCharged = usesOptimalCharged ? row.optimalEliteChargedTM : row.eliteChargedTM;
  const movePair = [
    fastMove ? moveLink(fastMove, { elite: eliteFast, kind: "Fast" }) : "",
    chargedMove ? moveLink(chargedMove, { elite: eliteCharged, kind: "Charged" }) : "",
  ].filter(Boolean).join(" + ");
  const isPriorityList = listId === "future" || listId === "megas";
  const priority = isPriorityList ? ` data-impact-priority="${row.impactPriority}"` : "";
  const meta = isPriorityList
    ? `Priority #${row.impactPriority} · Covers: ${(row.impactTypes ?? [row.attackingType]).join(", ")} · best practical rank #${row.impactBestRank}`
    : `${row.attackingType} · practical rank #${row.rank}`;
  return `<li class="more-list-card"${priority} data-form-id="${escapeHtml(row.formId)}"><article>
    <p class="more-list-meta">${escapeHtml(meta)}</p>
    <h3>${escapeHtml(row.pokemon)}</h3>
    <p><strong>${movePair}</strong></p>
    <dl class="more-card-facts">
      <div><dt>Investment</dt><dd>${escapeHtml(row.investmentTier)} · ${escapeHtml(row.recommendation)}</dd></div>
      <div><dt>Budget</dt><dd>${escapeHtml(row.budgetValue)} · ${escapeHtml(row.resourceBurden)}</dd></div>
      <div><dt>Future-proof</dt><dd>${escapeHtml(row.futureProof)}</dd></div>
      <div><dt>Availability</dt><dd>${escapeHtml(row.availability)}</dd></div>
    </dl>
  </article></li>`;
}


function coverageListCard(row) {
  const ranks = Object.entries(row.ranks ?? {})
    .map(([type, rank]) => `${type} #${rank}`).join(" · ");
  return `<li class="more-list-card" data-form-id="${escapeHtml(row.formId)}"><article>
    <h3>${escapeHtml(row.pokemon)}</h3>
    <p><strong>Covers:</strong> ${escapeHtml((row.covers ?? []).join(", "))}</p>
    <p>${escapeHtml(ranks)}</p>
  </article></li>`;
}


export function renderMoreList(listId, data = {}) {
  if (listId === "collection") return renderCollectionView(data);
  const definition = MORE_LISTS[listId];
  if (!definition) return renderMore(data);
  const rows = listRows(listId, data);
  return `<section class="more-list-view" data-more-list-view="${escapeHtml(listId)}" aria-labelledby="more-list-title">
    <a class="safe-escape" href="./#more">Back to More</a>
    <p class="status-kicker">${escapeHtml(definition.group)} guide · ${rows.length} entries</p>
    <h2 id="more-list-title">${escapeHtml(definition.title)}</h2>
    ${listId === "future" ? '<p class="pvp-summary">Priority order favors S+ investment, multi-type coverage, and practical type rank. It does not compare raw DPS across unrelated types.</p>' : ""}
    ${listId === "megas" ? `<p class="pvp-summary">Only one ${jargonTerm("mega", "Mega")}/${jargonTerm("primal", "Primal")} can be active at a time. This deduplicated priority order favors availability and rotation status, S+ investment, multi-type coverage, and practical type rank.</p>` : ""}
    ${rows.length
      ? `<ul class="more-card-list">${rows.map((row) => (
        listId === "coverage" ? coverageListCard(row) : attackerListCard(row, listId)
      )).join("")}</ul>`
      : `<p class="pvp-empty">Nothing qualifies for this list in the current release yet.</p>`}
  </section>`;
}


function routeCard(listId) {
  const definition = MORE_LISTS[listId];
  return `<a class="more-route-card" href="./?list=${escapeHtml(listId)}#more" data-more-list="${escapeHtml(listId)}">
    <span>${escapeHtml(definition.group)}</span><strong>${escapeHtml(definition.title)}</strong><small>Open full list</small>
  </a>`;
}


function sourceCard(source) {
  return `<li class="source-card">
    <h3>${escapeHtml(source.sourceId)}</h3>
    <p><strong>Retrieved:</strong> ${escapeHtml(source.retrievedAt)}</p>
    <p><strong>SHA-256:</strong> <code>${escapeHtml(source.sha256)}</code></p>
    <p><strong>Status:</strong> ${escapeHtml(source.status)} · ${escapeHtml(source.bytes)} bytes</p>
    <p class="source-path">${escapeHtml(source.path)}</p>
  </li>`;
}


function methodologyRows(meta, methodology) {
  const raidDps = methodology?.raidDps ?? {};
  const raidDpsFacts = [
    ["Raid DPS target defense", raidDps.assumptions?.targetDefense],
    ["Raid DPS formula", raidDps.version ?? meta?.methodologyVersions?.raidDps],
    ["Raid DPS sources", (raidDps.sourceRefs ?? []).join(", ")],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join("");
  const versions = Object.entries(meta?.methodologyVersions ?? {})
    .map(([name, version]) => `<li><strong>${escapeHtml(titleCase(name))}:</strong> ${escapeHtml(version)}</li>`)
    .join("");
  const decisions = Object.entries(methodology?.movesetDecisions ?? {})
    .map(([id, decision]) => `<li><strong>${escapeHtml(id)}:</strong> ${escapeHtml(decision?.rationale ?? decision?.decision ?? "Reviewed canonical decision")}</li>`)
    .join("");
  return `<ul class="method-list">${raidDpsFacts}${versions}${decisions}</ul>`;
}


function dataSection(data) {
  const sources = data.sources?.sources ?? [];
  const cutoff = data.sources?.asOf ?? data.meta?.asOf ?? data.release?.dataCutoff ?? "unknown";
  return `<section class="more-section" aria-labelledby="more-data-title">
    <p class="status-kicker">Frozen evidence packet</p><h2 id="more-data-title">Data</h2>
    <p><strong>Data cutoff:</strong> ${escapeHtml(cutoff)}</p>
    <div class="claim-grid">
      <article><h3>Do Claim</h3><p>${escapeHtml(data.release?.doClaim ?? data.honesty?.doClaim)}</p></article>
      <article><h3>Do Not Claim</h3><p>${escapeHtml(data.release?.doNotClaim ?? data.honesty?.doNotClaim)}</p></article>
    </div>
    <h3>Methodology</h3>${methodologyRows(data.meta, data.methodology)}
    <details class="source-details"><summary>Sources and digests (${sources.length})</summary>
      <p class="rotation-credit">This week's raid bosses and events are synced from ScrapedDuck, a maintained mirror of LeekDuck.com.</p>
      <ul class="source-list">${sources.map(sourceCard).join("")}</ul>
    </details>
  </section>`;
}


function pokeGenieImportStatus(pokeGenieImport) {
  const importedAt = pokeGenieImport?.importedAt;
  const parsed = typeof importedAt === "string" ? new Date(importedAt) : null;
  if (!parsed || Number.isNaN(parsed.valueOf())) return "No Poke Genie import yet.";
  const date = parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const rowCount = Number.isInteger(pokeGenieImport.rowCount) ? pokeGenieImport.rowCount : 0;
  return `Last import: ${date} · ${rowCount} Pokémon${rowCount === 1 ? "" : "s"}.`;
}


function appSection(data) {
  const releaseNotes = data.release?.releaseNotes ?? [];
  const update = data.update ?? {};
  const updateAction = update.status === "update_available" && update.candidate
    ? `<button type="button" data-action="apply-update">Update to ${escapeHtml(update.candidate.dataCutoff)}</button>`
    : "";
  const rollbackAction = update.previousReleaseId
    ? `<button type="button" data-action="rollback-release">Roll back data</button>`
    : "";
  return `<section class="more-section" aria-labelledby="more-app-title">
    <p class="status-kicker">Install, transfer, and release</p><h2 id="more-app-title">App</h2>
    <p><strong>Release:</strong> ${escapeHtml(data.release?.releaseId ?? "Not loaded")}</p>
    <p><strong>App shell:</strong> ${escapeHtml(data.release?.shellRevision ?? "Unknown")}</p>
    <p aria-label="Release update status">${escapeHtml(update.label ?? "Update status unavailable")}</p>
    <div class="app-actions" aria-label="Install and update controls">
      <button type="button" data-action="install-app">Install app</button>
      <button type="button" data-action="check-update">Check for update</button>
      ${updateAction}${rollbackAction}
    </div>
    <h3>Roster import and export</h3>
    <p>Roster JSON stays on this device. Imports are strictly validated before replacing your local roster.</p>
    <label class="file-action">Choose roster JSON<input type="file" accept="application/json,.json" data-action="roster-import"></label>
    <button type="button" data-action="roster-export">Export roster JSON</button>
    <p>Import a Poke Genie CSV export to bulk-add ownership, CP, and IVs. This app doesn't import moves yet, so add those afterward via "Add details" on My Roster.</p>
    <p><strong>${escapeHtml(pokeGenieImportStatus(data.roster?.preferences?.pokeGenieImport))}</strong></p>
    <label class="file-action">Choose Poke Genie CSV<input type="file" accept="text/csv,.csv" data-action="poke-genie-import"></label>
    <h3>Feedback</h3>
    <p>Every "Helpful?" thumbs tap is stored on this device only, never sent anywhere. Export the raw list if you want to review or share it yourself.</p>
    <button type="button" data-action="feedback-export">Export feedback JSON</button>
    <h3>Release notes</h3>
    ${releaseNotes.length ? `<ul>${releaseNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "<p>No release notes loaded.</p>"}
  </section>`;
}


const TEXT_SIZE_LABELS = Object.freeze({ S: "Small", M: "Medium", L: "Large" });
const THEME_LABELS = Object.freeze({ auto: "Auto", light: "Light", dark: "Dark" });
const TEAM_LABELS = Object.freeze({ valor: "Valor", mystic: "Mystic", instinct: "Instinct" });

// Optional and skippable: every feature that reads this degrades to today's
// ungated/badge-free behavior when the card is left blank.
function trainerProfileSection(data) {
  const profile = data.trainerProfile ?? { level: null, team: null, name: "" };
  return `<section class="more-section" aria-labelledby="more-trainer-title">
    <p class="status-kicker">Optional — used to gate advice to what you can reach</p><h2 id="more-trainer-title">Trainer profile</h2>
    <p>The game doesn't share this — you tell us. Skip any of it; power-up advice and team badges just stay as they are today until you fill it in.</p>
    <label class="defense-log-player-name">Trainer level
      <input type="number" min="1" max="50" step="1" inputmode="numeric" data-trainer-level value="${escapeHtml(profile.level ?? "")}">
    </label>
    <h3>Team</h3>
    <div class="app-actions" role="group" aria-label="Team">
      ${Object.entries(TEAM_LABELS).map(([team, label]) => (
        `<button type="button" data-trainer-team="${team}" aria-pressed="${team === profile.team}">${label}</button>`
      )).join("")}
    </div>
    <label class="defense-log-player-name">Trainer name (optional)
      <input type="text" maxlength="40" data-trainer-name value="${escapeHtml(profile.name ?? "")}">
    </label>
    <label class="defense-log-player-name">Your Stardust (optional — also editable on Raid Target)
      <input inputmode="numeric" data-stardust-input data-stardust-route="more" value="${data.stardust === null || data.stardust === undefined ? "" : escapeHtml(data.stardust)}">
    </label>
  </section>`;
}

function displaySection(data) {
  const current = Object.hasOwn(TEXT_SIZE_LABELS, data.textSize) ? data.textSize : "M";
  const currentTheme = Object.hasOwn(THEME_LABELS, data.theme) ? data.theme : "auto";
  return `<section class="more-section" aria-labelledby="more-display-title">
    <p class="status-kicker">Ergonomics</p><h2 id="more-display-title">Text size</h2>
    <div class="app-actions" role="group" aria-label="Text size">
      ${Object.entries(TEXT_SIZE_LABELS).map(([size, label]) => (
        `<button type="button" data-text-size="${size}" aria-pressed="${size === current}">${label}</button>`
      )).join("")}
    </div>
    <h3>Theme</h3>
    <div class="app-actions" role="group" aria-label="Theme">
      ${Object.entries(THEME_LABELS).map(([theme, label]) => (
        `<button type="button" data-theme-choice="${theme}" aria-pressed="${theme === currentTheme}">${label}</button>`
      )).join("")}
    </div>
  </section>`;
}


function backupSection(data) {
  const preview = data.backupImportPreview;
  const nudge = data.backupNudge && !preview ? `
    <div class="fallback-section whats-new-card" role="note">
      <p><strong>Back up your data?</strong></p>
      <p>You haven't backed up in a while (or ever). A backup is one JSON file with your roster, gym log, drill/feedback stats, and display prefs — nothing else, no secrets.</p>
      <button type="button" data-action="backup-export">Back up my data</button>
      <button type="button" data-action="dismiss-backup-nudge">Not now</button>
    </div>` : "";
  const previewCard = preview ? `
    <div class="fallback-section" role="note" aria-live="polite">
      <p><strong>Backup preview</strong></p>
      <ul>
        <li>Exported: ${escapeHtml(preview.summary.exportedAt)}</li>
        <li>App version: ${escapeHtml(preview.summary.appShellRevision ?? "unknown")}</li>
        <li>${preview.summary.ownedFormCount} owned form${preview.summary.ownedFormCount === 1 ? "" : "s"}, ${preview.summary.instanceCount} roster detail${preview.summary.instanceCount === 1 ? "" : "s"}</li>
        <li>${preview.summary.defenseLogEntryCount} gym log entr${preview.summary.defenseLogEntryCount === 1 ? "y" : "ies"}</li>
      </ul>
      <p><strong>Merge</strong> adds this backup's data into what's already on this device (newest wins on matching entries; this device's last-opened tab and PvP filter settings are overwritten by the backup's). <strong>Replace</strong> overwrites this device's data with the backup.</p>
      <button type="button" data-action="backup-restore-merge">Merge into this device</button>
      <button type="button" data-action="backup-restore-replace">Replace this device's data</button>
      <button type="button" data-action="backup-restore-cancel">Cancel</button>
    </div>` : "";
  return `<section class="more-section" aria-labelledby="more-backup-title">
    <p class="status-kicker">One file, all your data</p><h2 id="more-backup-title">Backup and restore</h2>
    <p>No secrets live in this app. A backup bundles your roster (instances, stars, counts), gym defense log, drill streaks, feedback thumbs, and display prefs into one JSON file that stays yours. (Cached gym map coordinates aren't included — they rebuild automatically as you use the gym log.)</p>
    <p>Cross-device: export on your phone, AirDrop (or email) the file over, then restore it on your tablet.</p>
    ${nudge}
    <button type="button" data-action="backup-export">Back up my data</button>
    <label class="file-action">Choose backup file<input type="file" accept="application/json,.json" data-action="backup-import"></label>
    ${previewCard}
  </section>`;
}


function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function storageEstimateText(estimate) {
  if (estimate === null || estimate === undefined) return "Checking storage usage…";
  if (estimate === false) return "Not available in this browser.";
  const usage = Number(estimate.usage);
  const quota = Number(estimate.quota);
  if (!Number.isFinite(usage) || !Number.isFinite(quota)) return "Not available in this browser.";
  return `${formatBytes(usage)} used of ${formatBytes(quota)} available`;
}

function diagnosticsEntryCard({ entry, index }) {
  const when = new Date(entry.ts).toLocaleString();
  return `<li class="source-card">
    <h3>${escapeHtml(entry.message)}</h3>
    <p><strong>When:</strong> ${escapeHtml(when)} · <strong>Route:</strong> ${escapeHtml(entry.route)}</p>
    <p><strong>Shell:</strong> ${escapeHtml(entry.shellRevision)} · <strong>Release:</strong> ${escapeHtml(entry.releaseId)}</p>
    ${entry.stackHead ? `<pre class="roster-share-text">${escapeHtml(entry.stackHead)}</pre>` : ""}
    <button type="button" data-action="copy-diagnostics-entry" data-diagnostics-index="${index}">Copy this entry</button>
  </li>`;
}

// "Which build am I on" — local-only crash log for support conversations.
// Nothing here leaves the device except via the explicit copy actions.
function diagnosticsSection(data) {
  const diagnostics = data.diagnostics ?? {};
  const entries = diagnostics.entries ?? [];
  // Newest first for display, but each card keeps the original storage index
  // so copy/clear actions still address the right ring-buffer entry.
  const indexed = entries.map((entry, index) => ({ entry, index })).reverse();
  const selfRepairText = diagnostics.selfRepairAt
    ? new Date(diagnostics.selfRepairAt).toLocaleString()
    : "Never triggered on this device.";
  const status = diagnostics.copyStatus === "success"
    ? '<p class="triage-copy-status" role="status">Copied to the clipboard.</p>'
    : diagnostics.copyStatus === "failure"
      ? `<p class="triage-copy-status" role="status">Could not copy automatically — select and copy this text.</p><textarea data-diagnostics-copy-fallback readonly rows="6">${escapeHtml(diagnostics.copyPayload ?? "")}</textarea>`
      : "";
  return `<section class="more-section" aria-labelledby="more-diagnostics-title">
    <p class="status-kicker">Which build am I on</p><h2 id="more-diagnostics-title">Diagnostics</h2>
    <p>Local-only error log for support conversations. Nothing here is sent anywhere; copy or clear it yourself.</p>
    <ul class="method-list">
      <li><strong>Shell revision:</strong> ${escapeHtml(data.release?.shellRevision ?? "Unknown")}</li>
      <li><strong>Release:</strong> ${escapeHtml(data.release?.releaseId ?? "Unknown")}</li>
      <li><strong>Storage usage:</strong> ${escapeHtml(storageEstimateText(diagnostics.storageEstimate))}</li>
      <li><strong>Service worker:</strong> ${escapeHtml(diagnostics.swControllerState ?? "unsupported")}</li>
      <li><strong>Last self-repair:</strong> ${escapeHtml(selfRepairText)}</li>
      <li><strong>Loaded data chunks:</strong> ${escapeHtml((diagnostics.loadedChunks ?? []).join(", ") || "none")}</li>
    </ul>
    <div class="app-actions">
      <button type="button" data-action="copy-diagnostics-all">Copy all entries</button>
      <button type="button" data-action="clear-diagnostics">Clear all</button>
    </div>
    ${status}
    ${entries.length
      ? `<ul class="source-list">${indexed.map(diagnosticsEntryCard).join("")}</ul>`
      : `<p class="pvp-empty">No errors captured yet.</p>`}
  </section>`;
}


const PUSH_STATE_LABELS = Object.freeze({
  unsupported: "Not supported in this browser",
  default: "Not requested yet",
  denied: "Blocked — re-enable in browser site settings",
  granted: "Enabled",
});

// Dev-flag-only stub: no relay exists (docs/push-notifications-spike.md),
// so this never shows for a normal visitor. Enable via
// localStorage.setItem('pogo-push-flag-dev', '1') and reload.
function pushSection(data) {
  if (!data.pushFlag) return "";
  const state = data.pushPermission ?? "unsupported";
  return `<section class="more-section" aria-labelledby="more-push-title">
    <p class="status-kicker">Dev flag — no relay is live</p><h2 id="more-push-title">Push notifications</h2>
    <p>${escapeHtml(PUSH_STATE_LABELS[state] ?? PUSH_STATE_LABELS.unsupported)}</p>
    ${state === "default" ? `<button type="button" data-action="request-push-permission">Enable push</button>` : ""}
  </section>`;
}

function shareSection() {
  return `<section class="more-section" aria-labelledby="more-share-title">
    <p class="status-kicker">Tell a friend</p><h2 id="more-share-title">Share this app</h2>
    <p>Scan this code on another phone to open the Battle Field Guide.</p>
    <img class="share-qr" src="./icons/share-qr.svg" alt="QR code that opens the Battle Field Guide" width="220" height="220">
  </section>`;
}


// No zero-dep QR encoder in this repo (round 2 shipped a build-time app-link
// QR only, not a runtime encoder for arbitrary text) — this shares the
// roster the same way import already accepts: plain JSON, copy-and-paste.
function rosterShareSection(data) {
  const open = Boolean(data.rosterShareOpen);
  return `<section class="more-section" aria-labelledby="more-roster-share-title">
    <p class="status-kicker">Send your roster to a friend</p><h2 id="more-roster-share-title">Share your roster as text</h2>
    <p>No in-app QR reader here yet, so this is copy-and-paste: send the text below to a friend, and they paste it into their own "Choose roster JSON" import.</p>
    <button type="button" data-action="toggle-roster-share" aria-expanded="${open}">${open ? "Hide roster text" : "Show roster text"}</button>
    ${open ? `
    <pre class="roster-share-text">${escapeHtml(stableRosterJson(data.roster ?? {}))}</pre>
    <button type="button" data-action="copy-roster-share">Copy to clipboard</button>
    <p class="roster-share-privacy">This stays on your device until you copy or send it yourself.</p>` : ""}
  </section>`;
}


function ownedCounts(roster = {}) {
  const provided = roster.ownedFormCounts ?? {};
  return Object.fromEntries((roster.ownedFormIds ?? []).map((formId) => [
    formId,
    Number.isInteger(provided[formId]) && provided[formId] > 0 ? provided[formId] : 1,
  ]));
}


// A form's shiny/lucky flag is "forced" true when a detailed instance says
// so — the dex-list quick-toggle can't turn that off (it would be a lie),
// so it renders disabled in that state instead of a clickable off switch.
function instanceForcedFormIds(instances, key) {
  return new Set((instances ?? []).filter((instance) => instance[key]).map((instance) => instance.formId));
}


function rosterSection(data) {
  const counts = ownedCounts(data.roster);
  const shinyOwned = shinyOwnedFormIdSet(data.roster ?? {});
  const luckyOwned = luckyOwnedFormIdSet(data.roster ?? {});
  const shinyForced = instanceForcedFormIds(data.roster?.instances, "isShiny");
  const luckyForced = instanceForcedFormIds(data.roster?.instances, "isLucky");
  const query = String(data.rosterQuery ?? "").trim().toLocaleLowerCase();
  const rows = Object.values(data.forms ?? {}).filter((form) => {
    if (!query) return counts[form.form_id] > 0;
    return [form.name, form.form_id, form.primary_type, form.secondary_type]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(query);
  }).sort((left, right) => left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  }) || left.form_id.localeCompare(right.form_id)).slice(0, 50);
  const totalCopies = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const instanceCounts = (data.roster?.instances ?? []).reduce((byForm, instance) => {
    byForm[instance.formId] = (byForm[instance.formId] ?? 0) + 1;
    return byForm;
  }, {});
  const cards = rows.map((form) => {
    const count = counts[form.form_id] ?? 0;
    const types = [form.primary_type, form.secondary_type].filter(Boolean).join(" / ");
    const detailCount = instanceCounts[form.form_id] ?? 0;
    const isShiny = shinyOwned.has(form.form_id);
    const isLucky = luckyOwned.has(form.form_id);
    const shinyDisabled = shinyForced.has(form.form_id) ? ' disabled title="Set by a shiny instance — edit that instance to change it"' : "";
    const luckyDisabled = luckyForced.has(form.form_id) ? ' disabled title="Set by a lucky instance — edit that instance to change it"' : "";
    return `<li class="roster-row" data-form-id="${escapeHtml(form.form_id)}">
      <div><h3>${escapeHtml(form.name)}</h3><p>${escapeHtml(types)} · ${escapeHtml(form.form_id)}</p></div>
      <div class="roster-stepper" aria-label="Copy quantity for ${escapeHtml(form.name)}">
        <button type="button" data-roster-quantity-form-id="${escapeHtml(form.form_id)}" data-direction="decrease" aria-label="Remove one ${escapeHtml(form.name)} copy"${count === 0 ? " disabled" : ""}>−</button>
        <output aria-label="${count} copies of ${escapeHtml(form.name)}">${count}</output>
        <button type="button" data-roster-quantity-form-id="${escapeHtml(form.form_id)}" data-direction="increase" aria-label="Add one ${escapeHtml(form.name)} copy"${count >= 999 ? " disabled" : ""}>+</button>
      </div>
      <div class="roster-collection-flags" role="group" aria-label="Shiny and lucky for ${escapeHtml(form.name)}">
        <button type="button" class="collection-flag-toggle" data-shiny-toggle-form-id="${escapeHtml(form.form_id)}" aria-pressed="${isShiny}"${shinyDisabled}>${isShiny ? "★ Shiny" : "☆ Shiny"}</button>
        <button type="button" class="collection-flag-toggle" data-lucky-toggle-form-id="${escapeHtml(form.form_id)}" aria-pressed="${isLucky}"${luckyDisabled}>${isLucky ? "🍀 Lucky" : "Lucky"}</button>
      </div>
      <button type="button" class="roster-add-details" data-open-instance-sheet-form-id="${escapeHtml(form.form_id)}">${detailCount ? `Details (${detailCount})` : "Add details"}</button>
    </li>`;
  }).join("");
  const empty = query
    ? "No exact forms match this search."
    : "Your roster is empty. Search for a Pokémon to add the first copy.";
  const exactForms = Object.keys(counts).length;
  return `<section class="more-section roster-section" aria-labelledby="more-roster-title">
    <p class="status-kicker">Local collection</p><h2 id="more-roster-title">My Roster</h2>
    <p><strong>${exactForms} exact form${exactForms === 1 ? "" : "s"} · ${totalCopies} total ${totalCopies === 1 ? "copy" : "copies"}</strong> <span class="owned-chip">Owned: ${exactForms}</span></p>
    <p>Counts describe exact-form copies only; they do not claim battle-ready levels or moves.</p>
    <label class="roster-search">Search any Pokémon, form, or type
      <input type="search" data-roster-search value="${escapeHtml(data.rosterQuery ?? "")}" autocomplete="off">
    </label>
    <ul class="roster-list">${cards || `<li class="gym-empty">${escapeHtml(empty)}</li>`}</ul>
  </section>`;
}


export function renderMore(data = {}) {
  if (MORE_LISTS[data.listId]) return renderMoreList(data.listId, data);
  return `<div class="more-view">
    <a class="safe-escape" href="./#more">Back to More</a>
    <section class="more-section" aria-labelledby="more-basics-title">
      <p class="status-kicker">New to Pokémon GO battles?</p><h2 id="more-basics-title">Battle Basics</h2>
      <a class="safe-escape" href="./#basics">Read the plain-language basics</a>
      <a class="safe-escape" href="./#glossary">See every term in the Glossary</a>
    </section>
    ${trainerProfileSection(data)}
    ${displaySection(data)}
    ${pushSection(data)}
    ${rosterSection(data)}
    <section class="more-section triage-route-callout" aria-labelledby="more-triage-title">
      <p class="status-kicker">Turn your roster into decisions</p><h2 id="more-triage-title">Triage My Box</h2>
      <p>See what to keep, power up, use in leagues, or review for transfer.</p>
      <a class="safe-escape" href="./#triage" data-route="triage">Open Triage My Box</a>
    </section>
    ${rosterShareSection(data)}
    <section class="more-section" aria-labelledby="more-investment-title">
      <p class="status-kicker">Spend ${jargonTerm("stardust", "Stardust")} and ${jargonTerm("candy", "Candy")} deliberately</p><h2 id="more-investment-title">Investment</h2>
      <div class="more-route-grid">${routeCard("budget")}${routeCard("future")}</div>
    </section>
    <section class="more-section" aria-labelledby="more-collection-title">
      <p class="status-kicker">Build broad practical coverage</p><h2 id="more-collection-title">Collection</h2>
      <div class="more-route-grid">${routeCard("megas")}${routeCard("coverage")}${routeCard("collection")}</div>
    </section>
    ${dataSection(data)}
    ${appSection(data)}
    ${backupSection(data)}
    ${diagnosticsSection(data)}
    ${shareSection()}
  </div>`;
}
