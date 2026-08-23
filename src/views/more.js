import { escapeHtml } from "./home.js";
import { jargonTerm } from "../glossary.js";
import { moveLink } from "./move-sheet.js";
import { stableRosterJson } from "../storage.js";
import { renderCollectionView } from "./collection.js";
import { SHOP_GUIDE } from "../shop-guide.js";
import { CAPABILITY_GUIDE } from "../capability-guide.js";
import { SHELL_CHANGELOG } from "../shell-changelog.js";
import { renderPurgeView } from "./purge.js";
import { renderDupesView } from "./dupes.js";
import { renderPowerupView } from "./powerup.js";
import { renderTradePlannerView } from "./trade-planner.js";
import { renderTrophyView } from "./trophy.js";
import { renderJournalView } from "./journal.js";
import { renderMasteryView } from "./mastery.js";
import { computeTypeMastery } from "../type-mastery.js";
import { renderCompareView } from "./compare.js";
import { compareForms } from "../compare.js";
import { renderBuddyView } from "./buddy.js";
import { renderXlView } from "./xl.js";
import { renderEliteTmView } from "./elitetm.js";
import { renderGroupView } from "./group.js";
import { loadGroupMembers } from "../group-store.js";
import { luckyOwnedFormIdSet, shinyOwnedFormIdSet } from "../collection.js";
import { formatFriendCode, friendCodeQrMatrix, isValidFriendCode } from "../friend-codes.js";


export const MORE_LISTS = Object.freeze({
  budget: Object.freeze({ title: "Budget Attackers", group: "Investment" }),
  megas: Object.freeze({ title: "Megas, Primals & Super Megas", group: "Collection" }),
  future: Object.freeze({ title: "Future-Proof Investments", group: "Investment" }),
  coverage: Object.freeze({ title: "Type Coverage Planner", group: "Collection" }),
  collection: Object.freeze({ title: "Pokédex — Living Dex", group: "Collection" }),
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


// Every More sub-view is a real route now, so its escape link is an ordinary
// router link — no string-matched back handler, no manual scroll reset.
const BACK_TO_MORE = '<a class="safe-escape" href="./#more" data-route="more" data-view="">Back to More</a>';


export function renderMoreList(listId, data = {}) {
  if (listId === "collection") return renderCollectionView(data);
  const definition = MORE_LISTS[listId];
  if (!definition) return renderMore(data);
  const rows = listRows(listId, data);
  return `<section class="more-list-view" data-more-list-view="${escapeHtml(listId)}" aria-labelledby="more-list-title">
    ${BACK_TO_MORE}
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


// route/view come straight off the hash so the router owns the click, the
// scroll reset and aria-current without every row hand-writing the attributes.
function menuLink(href, label) {
  const [route, view = ""] = href.slice("./#".length).split("/");
  return `<li><a href="${href}" data-route="${route}" data-view="${view}">${escapeHtml(label)}</a></li>`;
}


function menuSection({ id, kicker, title, links }) {
  return `<section class="more-section" aria-labelledby="more-menu-${id}-title">
    <p class="status-kicker">${escapeHtml(kicker)}</p><h2 id="more-menu-${id}-title">${escapeHtml(title)}</h2>
    <ul class="more-menu-list">${links.map(([href, label]) => menuLink(href, label)).join("")}</ul>
  </section>`;
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
    <h3>Feedback</h3>
    <p>Every "Helpful?" thumbs tap is stored on this device only, never sent anywhere. Export the raw list if you want to review or share it yourself.</p>
    <button type="button" data-action="feedback-export">Export feedback JSON</button>
    <h3>Release notes</h3>
    ${releaseNotes.length ? `<ul>${releaseNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "<p>No release notes loaded.</p>"}
  </section>`;
}


// Lives with the roster, not with the app/release plumbing: importing a Poke
// Genie CSV is a roster edit, and it belongs where the roster is edited.
function rosterTransferSection(data) {
  return `<section class="more-section" aria-labelledby="more-transfer-title">
    <p class="status-kicker">Bulk edits, still local</p><h2 id="more-transfer-title">Roster import and export</h2>
    <p>Roster JSON stays on this device. Imports are strictly validated before replacing your local roster.</p>
    <label class="file-action">Choose roster JSON<input type="file" accept="application/json,.json" data-action="roster-import"></label>
    <button type="button" data-action="roster-export">Export roster JSON</button>
    <p>Import a Poke Genie CSV export to bulk-add ownership, CP, and IVs. This app doesn't import moves yet, so add those afterward via "Add details" on My Roster.</p>
    <p><strong>${escapeHtml(pokeGenieImportStatus(data.roster?.preferences?.pokeGenieImport))}</strong></p>
    <label class="file-action">Choose Poke Genie CSV<input type="file" accept="text/csv,.csv" data-action="poke-genie-import"></label>
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
    <div class="roster-danger-zone">
      <p><strong>Bulk remove by pattern</strong> — a regular expression matched (case-insensitive) against each saved Pokémon's nickname and species name. Preview always comes first; nothing deletes until you confirm the exact list.</p>
      ${bulkRemoveCard(data.bulkRemove, data.roster, data.forms)}
      <p><strong>Clear roster data</strong> — removes every owned mark, shiny/lucky flag, and saved Pokémon on this device. Gym log, streaks, and display prefs stay. Export a backup first if in doubt.</p>
      <button type="button" class="roster-clear-btn" data-action="clear-roster-data">Clear all roster data</button>
    </div>
  </section>`;
}

// Preview-then-confirm bulk removal (operator ask 2026-08-12: "bulk clean
// out ... based on regex"). The preview IS the safety: the confirm button
// names the exact count and the list shows what dies, so a pattern typo is
// visible before anything is destroyed.
function bulkRemoveCard(bulkRemove, roster, forms) {
  const state = bulkRemove ?? { pattern: "", error: "", matches: null };
  const matches = state.matches;
  const previewList = Array.isArray(matches) && matches.length
    ? `<ul class="bulk-remove-list">${matches.slice(0, 20).map((match) => `<li>${escapeHtml(match.label)}</li>`).join("")}</ul>
      ${matches.length > 20 ? `<p class="bulk-remove-note">…and ${matches.length - 20} more.</p>` : ""}
      <button type="button" class="roster-clear-btn" data-action="bulk-remove-confirm">Remove these ${matches.length} Pokémon</button>`
    : "";
  const emptyNote = Array.isArray(matches) && !matches.length
    ? `<p class="bulk-remove-note">No saved Pokémon match that pattern.</p>` : "";
  return `<div class="bulk-remove-card">
    <label class="bulk-remove-label">Pattern
      <input type="text" autocapitalize="none" autocorrect="off" spellcheck="false" value="${escapeHtml(state.pattern ?? "")}" data-bulk-remove-pattern placeholder="e.g. ^transfer|bidoof">
    </label>
    <button type="button" data-action="bulk-remove-preview">Preview matches</button>
    ${state.error ? `<p class="bulk-remove-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
    ${previewList}
    ${emptyNote}
  </div>`;
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


// Inline <svg> built straight from the QR module grid — no data: URI, no
// <img>, so it needs nothing from the CSP's img-src beyond what markup
// already gets. Margin of 2 modules matches the quiet zone the build-time
// share-qr.svg (scripts/generate-share-qr.py) already uses.
function friendCodeQrSvg(matrix, label) {
  const size = matrix.length;
  const margin = 2;
  const total = size + margin * 2;
  const rects = matrix.flatMap((row, r) => row.map((dark, c) => (
    dark ? `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>` : ""
  ))).filter(Boolean).join("");
  return `<svg class="share-qr" viewBox="0 0 ${total} ${total}" role="img" aria-label="${escapeHtml(label)}">
    <g fill="#000">${rects}</g>
  </svg>`;
}


function friendRow(friend) {
  return `<li class="instance-row" data-friend-id="${escapeHtml(friend.id)}">
    <div><h4>${escapeHtml(friend.name)}</h4><p>${escapeHtml(formatFriendCode(friend.code))}</p></div>
    <div class="instance-row-actions">
      <button type="button" data-copy-friend-code-id="${escapeHtml(friend.id)}">Copy</button>
      <button type="button" data-edit-friend-id="${escapeHtml(friend.id)}">Edit</button>
      <button type="button" data-delete-friend-id="${escapeHtml(friend.id)}">Delete</button>
    </div>
  </li>`;
}


// Manual entry only: the game doesn't expose friend codes to third-party
// apps. Everything here (your code, the friend list) stays on this device.
function friendCodesSection(data) {
  const myCode = data.friendCodeInput ?? "";
  const draft = data.friendDraft ?? { editingId: null, name: "", code: "" };
  const friends = data.friends ?? [];
  const matrix = isValidFriendCode(myCode) ? friendCodeQrMatrix(myCode) : null;
  return `<section class="more-section" aria-labelledby="more-friend-codes-title">
    <p class="status-kicker">Trade, gift, and battle together</p><h2 id="more-friend-codes-title">Friend Codes</h2>
    <p>In-game: Menu &gt; Friends &gt; Add Friend, then enter or scan a 12-digit code.</p>
    <h3>My code</h3>
    <label class="defense-log-player-name">Your 12-digit friend code
      <input type="text" inputmode="numeric" autocomplete="off" maxlength="14" data-my-friend-code value="${escapeHtml(formatFriendCode(myCode))}" placeholder="0000 0000 0000">
    </label>
    ${data.friendCodeError ? `<p class="instance-sheet-error" role="alert">${escapeHtml(data.friendCodeError)}</p>` : ""}
    ${matrix ? `
    <button type="button" data-action="copy-my-friend-code">Copy my code</button>
    ${friendCodeQrSvg(matrix, `QR code for friend code ${formatFriendCode(myCode)}`)}` : ""}
    ${data.friendCodesMessage ? `<p class="triage-copy-status" role="status">${escapeHtml(data.friendCodesMessage)}</p>` : ""}
    <h3>Friends (${friends.length})</h3>
    ${friends.length
      ? `<ul class="instance-list">${friends.map(friendRow).join("")}</ul>`
      : `<p class="pvp-empty">No friends saved yet.</p>`}
    <p><a class="safe-escape" href="./#more/trades" data-route="more" data-view="trades">See a dex gap with a friend &rarr;</a></p>
    <h3>${draft.editingId ? "Edit" : "Add"} a friend</h3>
    <label class="defense-log-player-name">Name
      <input type="text" maxlength="40" data-friend-draft-name value="${escapeHtml(draft.name ?? "")}">
    </label>
    <label class="defense-log-player-name">12-digit code
      <input type="text" inputmode="numeric" autocomplete="off" maxlength="14" data-friend-draft-code value="${escapeHtml(formatFriendCode(draft.code ?? ""))}" placeholder="0000 0000 0000">
    </label>
    ${draft.error ? `<p class="instance-sheet-error" role="alert">${escapeHtml(draft.error)}</p>` : ""}
    <div class="app-actions">
      ${draft.editingId ? `<button type="button" data-action="cancel-friend-draft">Cancel</button>` : ""}
      <button type="button" data-action="save-friend-draft">${draft.editingId ? "Save changes" : "Add friend"}</button>
    </div>
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


// #more is a menu, not a page: one screen of links. Everything it used to
// render inline lives at its own route now, so the 13.9-screen scroll — and
// the ?list= content swap that never hit the router's scroll reset — are gone.
function renderMoreMenu() {
  return `<div class="more-view more-menu">
    ${menuSection({
      id: "you",
      kicker: "Your data, on this device",
      title: "Your stuff",
      links: [
        ["./#more/roster", "My Roster"],
        ["./#more/group", "Raid Group"],
        ["./#more/settings", "Settings"],
        ["./#triage", "My Box"],
        ["./#triage/candy", "Candy Planner"],
        ["./#basics", "Learn"],
      ],
    })}
    ${menuSection({
      // Leaderboard, Rocket and Eggs are surviving routes the nav has no slot
      // for. Without a row here their only entrance is a launcher card ~10
      // screens down Home, which is the buried-route problem this menu exists
      // to end.
      id: "surfaces",
      kicker: "Routes the bottom nav has no room for",
      title: "Also here",
      links: [
        ["./#leaderboard", "Gym Leaderboard"],
        ["./#rocket", "Team GO Rocket"],
        ["./#eggs", "Egg Pool"],
      ],
    })}
    ${menuSection({
      id: "library",
      kicker: "Spend Stardust and Candy deliberately",
      title: "Library",
      links: [
        ...["budget", "future", "megas", "coverage", "collection"]
          .map((listId) => [`./#more/${listId}`, MORE_LISTS[listId].title]),
        ["./#more/shopguide", "Shop & Storage Value Guide"],
        ["./#more/purge", "Purge Planner — transfer search strings"],
        ["./#more/dupes", "Duplicate Advisor"],
        ["./#more/powerup", "Power-Up Planner"],
        ["./#more/tradeplanner", "Trade Planner"],
        ["./#more/trophy", "Hundo Wall — trophy case"],
        ["./#more/journal", "Field Journal — streak, recap, log"],
        ["./#more/mastery", "Type Mastery — attacker bench strength"],
        ["./#more/compare", "Compare — two Pokémon head-to-head"],
        ["./#more/buddyplanner", "Best Buddy Planner"],
        ["./#more/xladvisor", "XL Advisor — is level 50 worth it?"],
        ["./#more/elitetm", "Elite TM Planner — where to spend them"],
      ],
    })}
    ${menuSection({
      id: "build",
      kicker: "Where this data came from",
      title: "This build",
      links: [
        ["./#more/capabilities", "What this app can do"],
        ["./#more/changelog", "Version history — patch notes"],
        ["./#more/delta", "What changed"],
        ["./#more/about", "About this build"],
      ],
    })}
  </div>`;
}


// Static reference page — hand-curated coin/storage guidance (shop-guide.js),
// every claim carrying its confidence label and source names inline. No
// chunk dependency: renders on first paint like the menu itself.
function shopGuideView() {
  const claim = (entry) => `<p>${escapeHtml(entry.text)}</p>
    <p class="shop-guide-meta"><span class="acq-flag">${escapeHtml(entry.label)}</span> ${escapeHtml(entry.source)}</p>`;
  return `<div class="more-view">
    ${BACK_TO_MORE}
    <section class="more-section" aria-labelledby="shop-guide-title">
      <p class="status-kicker">Spend coins deliberately · verified ${escapeHtml(SHOP_GUIDE.lastVerified)}</p>
      <h2 id="shop-guide-title">Shop &amp; Storage Value Guide</h2>
      ${claim(SHOP_GUIDE.freeCoins)}
      <h3>Coin priority — best value first</h3>
      <ol class="shop-guide-priorities">
        ${SHOP_GUIDE.priorities.map((row) => `<li><strong>${escapeHtml(row.item)}</strong> — ${escapeHtml(row.verdict)}</li>`).join("")}
      </ol>
      <p class="shop-guide-meta"><span class="acq-flag">community consensus</span> GamePress coin guides · Pokémon GO Hub</p>
      <h3>Storage — how much to shoot for</h3>
      ${claim(SHOP_GUIDE.storage.upgradeCost)}
      ${claim(SHOP_GUIDE.storage.caps)}
      ${SHOP_GUIDE.storage.targets.map((target) => `<p><strong>${escapeHtml(target.who)}:</strong> ${escapeHtml(target.text)}</p>
        <p class="shop-guide-meta"><span class="acq-flag">${escapeHtml(target.label)}</span> ${escapeHtml(target.source)}</p>`).join("")}
      <h3>Boxes</h3>
      ${claim(SHOP_GUIDE.boxes)}
      <h3>Remote Raid Passes</h3>
      ${claim(SHOP_GUIDE.remotePasses)}
      <h3>Buying coins</h3>
      ${claim(SHOP_GUIDE.webStore)}
    </section>
  </div>`;
}


// Capability tour — hand-maintained feature list (capability-guide.js).
function capabilitiesView() {
  return `<div class="more-view">
    ${BACK_TO_MORE}
    <section class="more-section" aria-labelledby="capabilities-title">
      <p class="status-kicker">The tour · updated ${escapeHtml(CAPABILITY_GUIDE.updated)}</p>
      <h2 id="capabilities-title">What this app can do</h2>
      <p>${escapeHtml(CAPABILITY_GUIDE.intro)}</p>
      ${CAPABILITY_GUIDE.sections.map((section) => `<h3>${escapeHtml(section.title)}</h3>
        <ul class="capability-list">
          ${section.items.map((item) => `<li><strong>${escapeHtml(item.name)}</strong> <span class="capability-where">${escapeHtml(item.where)}</span><br>${escapeHtml(item.what)}</li>`).join("")}
        </ul>`).join("")}
    </section>
  </div>`;
}


// Patch notes per shell revision (shell-changelog.js — hand-maintained,
// one entry per APP_SHELL_REVISION bump).
function changelogView() {
  const group = (label, items) => (items?.length
    ? `<p class="changelog-kind">${label}</p><ul class="changelog-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "");
  return `<div class="more-view">
    ${BACK_TO_MORE}
    <section class="more-section" aria-labelledby="changelog-title">
      <p class="status-kicker">Patch notes, newest first</p>
      <h2 id="changelog-title">Version history</h2>
      ${SHELL_CHANGELOG.map((entry) => `<div class="changelog-entry">
        <h3>${escapeHtml(entry.rev)} <span class="changelog-date">${escapeHtml(entry.date)}</span></h3>
        ${group("Added", entry.added)}
        ${group("Tweaked", entry.tweaked)}
        ${group("Removed", entry.removed)}
      </div>`).join("")}
    </section>
  </div>`;
}


export function renderMore(data = {}) {
  const view = data.view ?? "";
  if (view === "changelog") return changelogView();
  if (view === "capabilities") return capabilitiesView();
  if (view === "shopguide") return shopGuideView();
  if (view === "purge") return `<div class="more-view">${BACK_TO_MORE}${renderPurgeView(data)}</div>`;
  if (view === "dupes") return `<div class="more-view">${BACK_TO_MORE}${renderDupesView(data)}</div>`;
  if (view === "group") {
    const loaded = loadGroupMembers(data.storageObject ?? null);
    return `<div class="more-view">${BACK_TO_MORE}${renderGroupView({
      roster: data.roster, forms: data.forms, raids: data.raids, data,
      currentBosses: data.currentBosses, members: loaded.members,
      warnings: [...(loaded.warnings ?? []), ...(data.groupMessage ? [data.groupMessage] : [])],
      memberName: data.groupMemberName ?? "",
    })}</div>`;
  }
  if (view === "mastery") return `<div class="more-view">${BACK_TO_MORE}${renderMasteryView({
    mastery: computeTypeMastery({ roster: data.roster, forms: data.forms, raidRows: data.raids }),
    forms: data.forms,
  })}</div>`;
  if (view === "elitetm") return `<div class="more-view">${BACK_TO_MORE}${renderEliteTmView({
    roster: data.roster, forms: data.forms, raidRows: data.raids,
  })}</div>`;
  if (view === "xladvisor") return `<div class="more-view">${BACK_TO_MORE}${renderXlView({
    roster: data.roster, forms: data.forms, raidRows: data.raids, pvpRows: data.pvp,
    currentBosses: data.currentBosses,
  })}</div>`;
  if (view === "buddyplanner") return `<div class="more-view">${BACK_TO_MORE}${renderBuddyView({
    roster: data.roster, forms: data.forms, raidRows: data.raids, pvpRows: data.pvp,
    currentBosses: data.currentBosses,
  })}</div>`;
  if (view === "compare") {
    const sel = data.compareSelection ?? {};
    const comparison = sel.formIdA && sel.formIdB
      ? compareForms(sel.formIdA, sel.formIdB, {
        forms: data.forms, raidRows: data.raids, pvpRows: data.pvp, gymRows: data.gym, roster: data.roster,
      })
      : null;
    return `<div class="more-view">${BACK_TO_MORE}${renderCompareView({ comparison, forms: data.forms, selection: sel })}</div>`;
  }
  if (view === "journal") return `<div class="more-view">${BACK_TO_MORE}${renderJournalView({
    ...(data.journal ?? {}),
    currentBosses: data.currentBosses,
    forms: data.forms,
  })}</div>`;
  if (view === "trophy") return `<div class="more-view">${BACK_TO_MORE}${renderTrophyView({
    roster: data.roster, forms: data.forms,
    journal: data.journal, bestStreak: data.journal?.streak?.best ?? 0,
  })}</div>`;
  if (view === "tradeplanner") return `<div class="more-view">${BACK_TO_MORE}${renderTradePlannerView({
    roster: data.roster, forms: data.forms, friends: data.friends ?? [],
  })}</div>`;
  if (view === "powerup") return `<div class="more-view">${BACK_TO_MORE}${renderPowerupView({
    roster: data.roster, forms: data.forms, raids: data.raids,
    currentBosses: data.currentBosses, trainerLevel: data.trainerProfile?.level ?? null,
  })}</div>`;
  if (MORE_LISTS[view]) return renderMoreList(view, data);
  if (view === "roster") {
    return `<div class="more-view">
      ${BACK_TO_MORE}
      ${rosterSection(data)}
      ${rosterTransferSection(data)}
      ${rosterShareSection(data)}
      ${friendCodesSection(data)}
    </div>`;
  }
  if (view === "settings") {
    return `<div class="more-view">
      ${BACK_TO_MORE}
      ${trainerProfileSection(data)}
      ${displaySection(data)}
      ${pushSection(data)}
    </div>`;
  }
  if (view === "about") {
    return `<div class="more-view">
      ${BACK_TO_MORE}
      ${dataSection(data)}
      ${appSection(data)}
      ${backupSection(data)}
      ${diagnosticsSection(data)}
      ${shareSection()}
    </div>`;
  }
  return renderMoreMenu();
}
