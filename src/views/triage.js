import { GLOSSARY, jargonTerm } from "../glossary.js";
import { triageSummaryCardData } from "../share-card.js";
import { spriteHtml } from "../sprites.js";
import { TRIAGE_BUCKETS } from "../triage.js";
import { buildSearchQuery } from "../game-search.js";
import { RENAME_MAX_LENGTH, batchRenameStrings } from "../rename-string.js";
import { escapeHtml } from "./home.js";


export const TRIAGE_PAGE_SIZE = 60;
export const TRIAGE_WINDOW_SIZE = TRIAGE_PAGE_SIZE * 2;
const TRIAGE_BUCKET_SET = new Set(TRIAGE_BUCKETS);
const GLOSSARY_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(${[...GLOSSARY]
    .sort((left, right) => right.term.length - left.term.length)
    .map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);
const GLOSSARY_ID_BY_TERM = new Map(GLOSSARY.map((entry) => [entry.term.toLocaleLowerCase(), entry.id]));


export function createTriageViewState(filters = {}) {
  return {
    filter: TRIAGE_BUCKET_SET.has(filters.filter) ? filters.filter : "KEEP",
    offset: Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : 0,
    limit: Number.isInteger(filters.limit) && filters.limit >= TRIAGE_WINDOW_SIZE
      ? TRIAGE_WINDOW_SIZE
      : TRIAGE_PAGE_SIZE,
    copyStatus: filters.copyStatus === "success" || filters.copyStatus === "failure"
      ? filters.copyStatus
      : "",
    renameCopyStatus: filters.renameCopyStatus === "success" || filters.renameCopyStatus === "failure"
      ? filters.renameCopyStatus
      : "",
    explainerOpen: Boolean(filters.explainerOpen),
    shareStatus: typeof filters.shareStatus === "string" ? filters.shareStatus : "",
    searchCopyId: typeof filters.searchCopyId === "string" ? filters.searchCopyId : "",
    searchCopyStatus: filters.searchCopyStatus === "success" || filters.searchCopyStatus === "failure"
      ? filters.searchCopyStatus
      : "",
  };
}


export function setTriageFilter(state, filter) {
  return createTriageViewState({
    filter,
    offset: 0,
    limit: TRIAGE_PAGE_SIZE,
    copyStatus: "",
    explainerOpen: state?.explainerOpen,
  });
}


export function advanceTriageView(state) {
  const current = createTriageViewState(state);
  return current.limit < TRIAGE_WINDOW_SIZE
    ? { ...current, limit: TRIAGE_WINDOW_SIZE }
    : { ...current, offset: current.offset + TRIAGE_PAGE_SIZE };
}


export function retreatTriageView(state) {
  const current = createTriageViewState(state);
  return { ...current, offset: Math.max(0, current.offset - TRIAGE_PAGE_SIZE) };
}


function matchingEntries(result, filter) {
  return (result?.entries ?? []).filter((entry) => entry.buckets?.includes(filter));
}


function wrapJargon(value) {
  const text = String(value ?? "");
  let offset = 0;
  let html = "";
  for (const match of text.matchAll(GLOSSARY_PATTERN)) {
    html += escapeHtml(text.slice(offset, match.index));
    const label = match[0];
    html += jargonTerm(GLOSSARY_ID_BY_TERM.get(label.toLocaleLowerCase()), label);
    offset = match.index + label.length;
  }
  return html + escapeHtml(text.slice(offset));
}


function bucketBadges(entry) {
  const buckets = entry.buckets ?? [entry.bucket];
  return buckets.filter((bucket, index) => TRIAGE_BUCKET_SET.has(bucket) && buckets.indexOf(bucket) === index)
    .map((bucket) => `<span class="triage-badge" data-triage-bucket="${bucket}">${bucket}</span>`)
    .join("");
}


function powerUpLine(entry) {
  if (!entry.invest || !entry.powerUp) return "";
  if (entry.powerUp.status === "unrated") {
    return `<p class="triage-invest-cost">${wrapJargon(entry.powerUp.reason)}</p>`;
  }
  const regularCandy = entry.powerUp.candy ?? entry.powerUp.regular?.candy;
  const xlCandy = entry.powerUp.xlCandy ?? entry.powerUp.xl?.candy;
  const stardust = entry.powerUp.stardust
    ?? ((entry.powerUp.regular?.stardust ?? 0) + (entry.powerUp.xl?.stardust ?? 0));
  if (![entry.powerUp.fromLevel, entry.powerUp.toLevel, regularCandy, xlCandy, stardust]
    .every(Number.isFinite)) {
    return '<p class="triage-invest-cost">Exact power-up cost is unavailable for this copy.</p>';
  }
  return `<p class="triage-invest-cost">Level ${escapeHtml(entry.powerUp.fromLevel)} → ${escapeHtml(entry.powerUp.toLevel)}: ${escapeHtml(regularCandy.toLocaleString("en-US"))} ${jargonTerm("candy", "Candy")} + ${escapeHtml(xlCandy.toLocaleString("en-US"))} ${jargonTerm("candy", "XL Candy")} + ${escapeHtml(stardust.toLocaleString("en-US"))} total ${jargonTerm("stardust", "Stardust")}</p>
  ${entry.powerUp.capNote ? `<p class="triage-invest-cap">${escapeHtml(entry.powerUp.capNote)}</p>` : ""}`;
}


function entryRow(entry, forms) {
  const form = entry.form ?? forms?.[entry.formId] ?? {};
  const name = entry.name ?? form.name ?? entry.formId;
  const nickname = entry.instance?.nickname?.trim();
  const cp = Number.isFinite(entry.instance?.cp) ? `CP ${entry.instance.cp}` : "CP not recorded";
  const instanceId = entry.instance?.id;
  return `<li class="triage-entry"${instanceId ? ` data-instance-id="${escapeHtml(instanceId)}"` : ""}>
    <article>
      <button type="button" class="triage-entry-open" data-open-instance-sheet-form-id="${escapeHtml(entry.formId)}" data-instance-sheet-return-route="triage"${instanceId ? ` data-open-instance-sheet-instance-id="${escapeHtml(instanceId)}"` : ""} aria-label="Open ${escapeHtml(nickname || name)} details">
        ${spriteHtml(entry.formId, forms, name, form.primary_type)}
        <span class="triage-entry-identity"><strong>${escapeHtml(name)}</strong>${nickname ? `<span>${escapeHtml(nickname)}</span>` : ""}<span>${escapeHtml(cp)}</span></span>
        <span class="triage-badges">${bucketBadges(entry)}</span>
      </button>
      ${entry.assumedStats ? '<p class="triage-assumed">Assumed stats · add CP and appraisal details for an exact verdict.</p>' : ""}
      <p class="triage-because">${wrapJargon(entry.because)}</p>
      ${powerUpLine(entry)}
    </article>
  </li>`;
}


export function candyTransferText(result) {
  return matchingEntries(result, "CANDY").map((entry) => {
    const name = entry.name ?? entry.form?.name ?? entry.formId;
    const nickname = entry.instance?.nickname?.trim();
    const cp = Number.isFinite(entry.instance?.cp) ? entry.instance.cp : "not recorded";
    return `${name}${nickname ? ` (${nickname})` : ""} — CP ${cp}`;
  }).join("\n");
}


function entryName(entry) {
  return entry.name ?? entry.form?.name ?? entry.formId;
}

export function candySearchNames(result) {
  return matchingEntries(result, "CANDY").map(entryName);
}

export function keepPvpSearchNames(result) {
  return [...matchingEntries(result, "KEEP"), ...matchingEntries(result, "PVP")].map(entryName);
}


function guideCard(showGuide) {
  if (!showGuide) return "";
  return `<aside class="triage-guide card" role="note">
    <p class="triage-guide-copy">Triage turns your imported box into a short, safe cleanup plan. Start with KEEP and PVP, spend only on INVEST, and review every CANDY suggestion in Pokémon GO before transferring anything.</p>
    <div class="triage-guide-actions">
      <button type="button" data-action="open-triage-explainer">How buckets are decided</button>
      <button type="button" data-action="dismiss-triage-guide">Got it</button>
    </div>
  </aside>`;
}


function explainer(open) {
  return `<details class="triage-explainer card"${open ? " open" : ""}>
    <summary>How buckets are decided</summary>
    <dl>
      <div><dt>KEEP</dt><dd>Useful for raids, leagues, or as your best relevant copy.</dd></div>
      <div><dt>INVEST</dt><dd>A KEEP pick that the budget guide or Weekly Coach says is worth resources now.</dd></div>
      <div><dt>PVP</dt><dd>A detailed copy with strong stats for Great or Ultra League.</dd></div>
      <div><dt>CANDY</dt><dd>A safely weaker duplicate or a form outside the current battle guides. Check in-game before transferring.</dd></div>
      <div><dt>UNRATED</dt><dd>The guide lacks enough data to make a safe call.</dd></div>
    </dl>
  </details>`;
}


function candyTools(result, state) {
  const payload = candyTransferText(result);
  if (!payload) return "";
  const status = state.copyStatus === "success"
    ? '<p class="triage-copy-status" role="status">Copied transfer checklist to the clipboard.</p>'
    : state.copyStatus === "failure"
      ? `<p class="triage-copy-status" role="status">Could not copy automatically — select and copy this list.</p><textarea data-triage-copy-fallback readonly rows="6">${escapeHtml(payload)}</textarea>`
      : "";
  return `<section class="triage-copy card" aria-labelledby="triage-copy-title">
    <h3 id="triage-copy-title">Transfer checklist</h3>
    <p>Copy names and CP to use as a manual checklist in Pokémon GO. Nothing is transferred automatically.</p>
    <button type="button" data-action="copy-triage-candy">Copy transfer list</button>
    ${status}
  </section>`;
}


// Batch rename plan for KEEP/PVP: one line per entry with an encodable
// instance, "Name — RENAMESTRING (CP nnn)", so the operator has a written
// checklist while typing each rename into Pokémon GO's pencil-icon field by
// hand — nothing here renames anything automatically.
export function renamePlanText(result, filter) {
  return batchRenameStrings(matchingEntries(result, filter)).map(({ entry, name, value }) => {
    const cp = Number.isFinite(entry.instance?.cp) ? entry.instance.cp : "not recorded";
    return `${name} — ${value} (CP ${cp})`;
  }).join("\n");
}

function renameTools(result, state) {
  const rows = batchRenameStrings(matchingEntries(result, state.filter));
  if (!rows.length) return "";
  const payload = renamePlanText(result, state.filter);
  const status = state.renameCopyStatus === "success"
    ? '<p class="triage-copy-status" role="status">Copied rename plan to the clipboard.</p>'
    : state.renameCopyStatus === "failure"
      ? `<p class="triage-copy-status" role="status">Could not copy automatically — select and copy this list.</p><textarea data-triage-copy-fallback readonly rows="6">${escapeHtml(payload)}</textarea>`
      : "";
  return `<section class="triage-copy card" aria-labelledby="triage-rename-title">
    <h3 id="triage-rename-title">Rename plan (${rows.length})</h3>
    <p>Each string encodes the league (G/U/M), exact IVs (Attack/Defense/Stamina as hex), and — when ranked — this copy's PVP quality % and species meta rank, in ${RENAME_MAX_LENGTH} characters or fewer. Rename in-game (tap the Pokémon → pencil icon) so the search bridge above finds these keepers again later.</p>
    <button type="button" data-action="copy-triage-rename-plan">Copy rename plan</button>
    ${status}
  </section>`;
}


// Shared by the CANDY and KEEP/PVP search-string sections below: one
// "Copy Part N" button per chunk, with the same clipboard-then-textarea
// fallback as the transfer checklist above (data-triage-copy-fallback is
// the same selector app.js already wires a fallback-select behavior to).
function searchChunkButtons(chunks, groupId, state) {
  return chunks.map((chunk, index) => {
    const chunkId = `${groupId}:${index}`;
    const label = chunks.length > 1 ? `Copy part ${index + 1} of ${chunks.length}` : "Copy this list";
    if (state.searchCopyId !== chunkId) {
      return `<div><button type="button" data-action="copy-triage-search-chunk" data-search-chunk-id="${chunkId}" data-search-chunk-payload="${escapeHtml(chunk)}">${label}</button></div>`;
    }
    const status = state.searchCopyStatus === "success"
      ? '<p class="triage-copy-status" role="status">Copied to the clipboard.</p>'
      : `<p class="triage-copy-status" role="status">Could not copy automatically — select and copy this list.</p><textarea data-triage-copy-fallback readonly rows="3">${escapeHtml(chunk)}</textarea>`;
    return `<div><button type="button" data-action="copy-triage-search-chunk" data-search-chunk-id="${chunkId}" data-search-chunk-payload="${escapeHtml(chunk)}">${label}</button>${status}</div>`;
  }).join("");
}

function searchExcludedNote(excludedCount) {
  if (!excludedCount) return "";
  return `<p class="triage-invest-cost">${excludedCount} ${excludedCount === 1 ? "Pokémon isn't" : "Pokémon aren't"} included — their names (regional forms, other special forms, or Nidoran's ♀/♂ symbol) aren't verified to paste and match correctly in-game. Find those by hand.</p>`;
}

function candySearchSection(result, state) {
  const { chunks, excludedCount } = buildSearchQuery(candySearchNames(result));
  if (!chunks.length) return "";
  return `<section class="triage-copy card" aria-labelledby="triage-candy-search-title">
    <h3 id="triage-candy-search-title">Select these in-game for transfer</h3>
    <p>Paste into the search field in your in-game Pokémon list (the magnifying glass), review what comes up, then transfer by hand — nothing here transfers automatically.</p>
    ${searchExcludedNote(excludedCount)}
    ${searchChunkButtons(chunks, "candy", state)}
  </section>`;
}

function keepPvpSearchSection(result, state) {
  const { chunks, excludedCount } = buildSearchQuery(keepPvpSearchNames(result));
  if (!chunks.length) return "";
  return `<section class="triage-copy card" aria-labelledby="triage-keep-search-title">
    <h3 id="triage-keep-search-title">Tag these as keepers</h3>
    <p>Paste into the in-game search field to bring up your Keep and PvP picks together, then long-press one to enter multi-select, tap the rest of the list, and apply a tag to all of them at once — search can filter by that tag afterward.</p>
    ${searchExcludedNote(excludedCount)}
    ${searchChunkButtons(chunks, "keeppvp", state)}
  </section>`;
}


export function renderTriage({
  result = {}, forms = {}, state: rawState, showGuide = false, weakLaneCount = 0,
} = {}) {
  const state = createTriageViewState(rawState);
  const allEntries = result.entries ?? [];
  if (!allEntries.length) {
    return `<section class="triage-view" aria-labelledby="triage-title">
      <p class="status-kicker">Your box, one decision at a time</p><h2 id="triage-title">Triage My Box</h2>
      ${guideCard(showGuide)}
      <div class="triage-empty card"><p>Import your Pokémon first — More → Import</p><a class="safe-escape" href="./#more" data-route="more">Open More to import</a></div>
      ${explainer(state.explainerOpen)}
    </section>`;
  }
  const matches = matchingEntries(result, state.filter);
  const visible = matches.slice(state.offset, state.offset + state.limit);
  const rangeStart = visible.length ? state.offset + 1 : 0;
  const rangeEnd = state.offset + visible.length;
  const hasPrevious = state.offset > 0;
  const hasNext = rangeEnd < matches.length;
  const counts = result.counts ?? {};
  const shareCard = triageSummaryCardData(counts);
  const shareStatus = state.shareStatus === "downloaded"
    ? '<p class="triage-copy-status" role="status">Downloaded your triage card.</p>'
    : state.shareStatus === "shared"
      ? '<p class="triage-copy-status" role="status">Shared your triage card.</p>'
      : state.shareStatus === "unavailable"
        ? '<p class="triage-copy-status" role="status">Could not share or download the card on this device.</p>'
        : "";
  return `<section class="triage-view" aria-labelledby="triage-title">
    <p class="status-kicker">Your box, one decision at a time</p><h2 id="triage-title">Triage My Box</h2>
    ${guideCard(showGuide)}
    ${weakLaneCount > 0 ? `<p class="triage-gap-teaser"><a class="safe-escape" href="./#buildnext" data-route="buildnext">${weakLaneCount} attacking type${weakLaneCount === 1 ? "" : "s"} your box doesn't cover well &rarr; Build Next</a></p>` : ""}
    <div class="triage-filters" role="group" aria-label="Triage result filter">
      ${TRIAGE_BUCKETS.map((bucket) => `<button type="button" data-triage-filter="${bucket}" aria-pressed="${state.filter === bucket}">${bucket} <span>${escapeHtml(counts[bucket] ?? 0)}</span></button>`).join("")}
    </div>
    ${shareCard ? `<button type="button" class="triage-share-card" data-action="share-triage-summary-card">Share my triage card</button>${shareStatus}` : ""}
    ${state.filter === "CANDY" ? candyTools(result, state) : ""}
    ${state.filter === "CANDY" ? candySearchSection(result, state) : ""}
    ${state.filter === "KEEP" || state.filter === "PVP" ? keepPvpSearchSection(result, state) : ""}
    ${state.filter === "KEEP" || state.filter === "PVP" ? renameTools(result, state) : ""}
    <p class="triage-window-status">Showing ${visible.length ? `${rangeStart}–${rangeEnd}` : "0"} of ${matches.length}</p>
    <ul class="triage-list">${visible.map((entry) => entryRow(entry, forms)).join("")}</ul>
    ${hasPrevious ? '<button type="button" class="triage-show-more" data-triage-previous>Previous 60</button>' : ""}
    ${hasNext ? '<button type="button" class="triage-show-more" data-triage-show-more>Next 60</button>' : ""}
    ${!matches.length ? '<p class="triage-no-matches card">No Pokémon are in this bucket.</p>' : ""}
    ${explainer(state.explainerOpen)}
  </section>`;
}
