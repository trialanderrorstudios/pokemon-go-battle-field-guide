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
    fastMove ? `${escapeHtml(titleCase(fastMove))}${eliteFast ? ' <small class="elite-tm">Elite Fast TM</small>' : ""}` : "",
    chargedMove ? `${escapeHtml(titleCase(chargedMove))}${eliteCharged ? ' <small class="elite-tm">Elite Charged TM</small>' : ""}` : "",
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
  const definition = MORE_LISTS[listId];
  if (!definition) return renderMore(data);
  const rows = listRows(listId, data);
  return `<section class="more-list-view" data-more-list-view="${escapeHtml(listId)}" aria-labelledby="more-list-title">
    <a class="safe-escape" href="./#more">Back to More</a>
    <p class="status-kicker">${escapeHtml(definition.group)} guide · ${rows.length} entries</p>
    <h1 id="more-list-title">${escapeHtml(definition.title)}</h1>
    ${listId === "future" ? '<p class="pvp-summary">Priority order favors S+ investment, multi-type coverage, and practical type rank. It does not compare raw DPS across unrelated types.</p>' : ""}
    ${listId === "megas" ? '<p class="pvp-summary">Only one Mega/Primal can be active at a time. This deduplicated priority order favors availability and rotation status, S+ investment, multi-type coverage, and practical type rank.</p>' : ""}
    <ul class="more-card-list">${rows.map((row) => (
      listId === "coverage" ? coverageListCard(row) : attackerListCard(row, listId)
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
    <h3>Release notes</h3>
    ${releaseNotes.length ? `<ul>${releaseNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "<p>No release notes loaded.</p>"}
  </section>`;
}


function ownedCounts(roster = {}) {
  const provided = roster.ownedFormCounts ?? {};
  return Object.fromEntries((roster.ownedFormIds ?? []).map((formId) => [
    formId,
    Number.isInteger(provided[formId]) && provided[formId] > 0 ? provided[formId] : 1,
  ]));
}


function rosterSection(data) {
  const counts = ownedCounts(data.roster);
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
  const cards = rows.map((form) => {
    const count = counts[form.form_id] ?? 0;
    const types = [form.primary_type, form.secondary_type].filter(Boolean).join(" / ");
    return `<li class="roster-row" data-form-id="${escapeHtml(form.form_id)}">
      <div><h3>${escapeHtml(form.name)}</h3><p>${escapeHtml(types)} · ${escapeHtml(form.form_id)}</p></div>
      <div class="roster-stepper" aria-label="Copy quantity for ${escapeHtml(form.name)}">
        <button type="button" data-roster-quantity-form-id="${escapeHtml(form.form_id)}" data-direction="decrease" aria-label="Remove one ${escapeHtml(form.name)} copy"${count === 0 ? " disabled" : ""}>−</button>
        <output aria-label="${count} copies of ${escapeHtml(form.name)}">${count}</output>
        <button type="button" data-roster-quantity-form-id="${escapeHtml(form.form_id)}" data-direction="increase" aria-label="Add one ${escapeHtml(form.name)} copy"${count >= 999 ? " disabled" : ""}>+</button>
      </div>
    </li>`;
  }).join("");
  const empty = query
    ? "No exact forms match this search."
    : "Your roster is empty. Search for a Pokémon to add the first copy.";
  const exactForms = Object.keys(counts).length;
  return `<section class="more-section roster-section" aria-labelledby="more-roster-title">
    <p class="status-kicker">Local collection</p><h2 id="more-roster-title">My Roster</h2>
    <p><strong>${exactForms} exact form${exactForms === 1 ? "" : "s"} · ${totalCopies} total ${totalCopies === 1 ? "copy" : "copies"}</strong></p>
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
    ${rosterSection(data)}
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
