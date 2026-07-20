import { escapeHtml } from "./home.js";


export const MORE_LISTS = Object.freeze({
  budget: Object.freeze({ title: "Budget Attackers", group: "Investment" }),
  megas: Object.freeze({ title: "Megas, Primals & Super Megas", group: "Collection" }),
  future: Object.freeze({ title: "Future-Proof Investments", group: "Investment" }),
  coverage: Object.freeze({ title: "Type Coverage Planner", group: "Collection" }),
});


function titleCase(value) {
  return String(value ?? "").toLowerCase().split("_")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}


function listRows(listId, data) {
  if (listId === "budget") return data.budgets?.raid ?? [];
  if (listId === "megas") return data.megasPrimals ?? [];
  if (listId === "future") return data.futureProof ?? [];
  if (listId === "coverage") return data.coveragePlanner ?? [];
  return [];
}


function attackerListCard(row) {
  const movePair = [row.optimalFastMove ?? row.fastMove, row.optimalChargedMove ?? row.chargedMove]
    .filter(Boolean).map(titleCase).join(" + ");
  return `<li class="more-list-card" data-form-id="${escapeHtml(row.formId)}"><article>
    <p class="more-list-meta">${escapeHtml(row.attackingType)} · practical rank #${escapeHtml(row.rank)}</p>
    <h3>${escapeHtml(row.pokemon)}</h3>
    <p><strong>${escapeHtml(movePair)}</strong></p>
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
  const definition = MORE_LISTS[listId];
  if (!definition) return renderMore(data);
  const rows = listRows(listId, data);
  return `<section class="more-list-view" data-more-list-view="${escapeHtml(listId)}" aria-labelledby="more-list-title">
    <a class="safe-escape" href="./#more">Back to More</a>
    <p class="status-kicker">${escapeHtml(definition.group)} guide · ${rows.length} entries</p>
    <h1 id="more-list-title">${escapeHtml(definition.title)}</h1>
    <ul class="more-card-list">${rows.map((row) => (
      listId === "coverage" ? coverageListCard(row) : attackerListCard(row)
    )).join("")}</ul>
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
      <ul class="source-list">${sources.map(sourceCard).join("")}</ul>
    </details>
  </section>`;
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
    <h3>Release notes</h3>
    ${releaseNotes.length ? `<ul>${releaseNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "<p>No release notes loaded.</p>"}
  </section>`;
}


export function renderMore(data = {}) {
  if (MORE_LISTS[data.listId]) return renderMoreList(data.listId, data);
  return `<div class="more-view">
    <a class="safe-escape" href="./#more">Back to More</a>
    <section class="more-section" aria-labelledby="more-investment-title">
      <p class="status-kicker">Spend Stardust and Candy deliberately</p><h2 id="more-investment-title">Investment</h2>
      <div class="more-route-grid">${routeCard("budget")}${routeCard("future")}</div>
    </section>
    <section class="more-section" aria-labelledby="more-collection-title">
      <p class="status-kicker">Build broad practical coverage</p><h2 id="more-collection-title">Collection</h2>
      <div class="more-route-grid">${routeCard("megas")}${routeCard("coverage")}</div>
    </section>
    ${dataSection(data)}
    ${appSection(data)}
  </div>`;
}
