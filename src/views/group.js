// Raid Group — the multiplayer marquee. A trainer exports a small "group
// pack" (their name + battle facts only: formId/cp/IVs, never friend codes or
// nicknames) as a JSON file, AirDrops it to the group, and everyone imports
// everyone else's pack. This view renders that export/import flow, the
// member roster, and a per-boss group rollup for the current rotation.
//
// Composes two sibling modules landed in this worktree — no forked scoring,
// storage, or share-envelope logic here:
//   groupSummary()      (group-store.js)    — member/instance counts, share dates
//   groupBossCoverage() (group-analysis.js) — best-6 attribution, group estimate,
//                                              gaps, dedup notes, per boss
// members[] shape (group-store.js's loadGroupMembers output, same shape this
// view receives as a prop): { memberName, exportedAt, roster: { instances, ownedFormCounts } }.
// groupBossCoverage wants { name, roster } instead of { memberName, roster } —
// that rename happens locally below, at the one call site that needs it.
import { escapeHtml, whyLine } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { groupBossCoverage } from "../group-analysis.js";
import { groupSummary } from "../group-store.js";

function daysAgoLabel(iso, now) {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "share date unknown";
  const diffDays = Math.max(0, Math.round((now - date) / 86400000));
  if (diffDays === 0) return "shared today";
  if (diffDays === 1) return "shared 1 day ago";
  return `shared ${diffDays} days ago`;
}

// ── Header / summary ──────────────────────────────────────────────────

function groupSummaryHtml(members, now) {
  if (!members.length) return "";
  const summary = groupSummary(members);
  const shareLine = summary.freshestExportedAt
    ? `<p class="gym-empty">Freshest share: ${escapeHtml(daysAgoLabel(summary.freshestExportedAt, now))}${
      summary.stalestExportedAt !== summary.freshestExportedAt
        ? ` · Stalest share: ${escapeHtml(daysAgoLabel(summary.stalestExportedAt, now))}`
        : ""
    }</p>`
    : "";
  return `<div class="more-section group-summary">
    <p class="status-kicker">Group summary</p>
    <p>${summary.memberCount} member${summary.memberCount === 1 ? "" : "s"} · ${summary.totalInstances} Pokémon shared</p>
    ${shareLine}
  </div>`;
}

// ── Export / import ───────────────────────────────────────────────────

function exportSectionHtml(memberName) {
  return `<div class="more-section group-export">
    <h3>Export my group pack</h3>
    <label class="defense-log-player-name">Your name in the group
      <input type="text" maxlength="40" data-group-member-name value="${escapeHtml(memberName ?? "")}" placeholder="Your trainer name">
    </label>
    <p>One small file, battle facts only — no friend codes, no nicknames. AirDrop it to the group.</p>
    <button type="button" data-action="group-pack-export">Export my group pack</button>
  </div>`;
}

function importWarningsHtml(warnings) {
  if (!warnings?.length) return "";
  return `<ul class="group-import-warnings">${warnings.map((warning) => `<li class="triage-copy-status" role="status">${escapeHtml(warning)}</li>`).join("")}</ul>`;
}

function importSectionHtml(warnings) {
  return `<div class="more-section group-import">
    <h3>Import a group pack</h3>
    <p>Only roster facts come through an import — battle stats plus showcase extras like size and shiny. No friend codes, no nicknames.</p>
    <label class="file-action">Choose group pack file<input type="file" accept="application/json" data-group-pack-input></label>
    ${importWarningsHtml(warnings)}
  </div>`;
}

// ── Member list ────────────────────────────────────────────────────────

function memberRowHtml(member, now) {
  const count = member.roster?.instances?.length ?? 0;
  return `<li class="instance-row" data-group-member-id="${escapeHtml(member.memberName)}">
    <div>
      <h4>${escapeHtml(member.memberName)}</h4>
      <p>${count} Pokémon · ${escapeHtml(daysAgoLabel(member.exportedAt, now))}</p>
    </div>
    <div class="instance-row-actions">
      <button type="button" data-group-member-remove="${escapeHtml(member.memberName)}">Remove</button>
    </div>
  </li>`;
}

function noMembersEmptyHtml() {
  return `<div class="more-section group-empty">
    <p class="status-kicker">No members yet</p>
    <p>Export your group pack above and AirDrop it to your raid group — once someone imports it (or you import theirs), they'll show up here.</p>
  </div>`;
}

function memberListSectionHtml(members, now) {
  return `<div class="more-section group-members">
    <h3>Members (${members.length})</h3>
    ${members.length
      ? `<ul class="instance-list">${members.map((member) => memberRowHtml(member, now)).join("")}</ul>`
      : `<p class="gym-empty">No members yet — export your pack above and AirDrop it to the group.</p>`}
  </div>`;
}

// ── Per-boss group rollup ─────────────────────────────────────────────

function groupEstimateHtml(estimate) {
  if (!estimate?.label) return "";
  const confidence = estimate.confidence
    ? `<span class="party-estimate-confidence">${escapeHtml(estimate.confidence)}</span>` : "";
  return `<div class="party-estimate"><p class="party-estimate-label">${escapeHtml(estimate.label)}</p>${confidence}</div>`;
}

// Gap/dedup strings come out of group-analysis.js as full honest sentences —
// rendered verbatim, same discipline as party.js's gapsHtml.
function gapsHtml(gaps) {
  if (!gaps?.length) return "";
  const chips = gaps.map((gap) => `<span class="party-gap-chip">${escapeHtml(gap)}</span>`).join("");
  return `<div class="party-gaps" aria-label="Group coverage gaps">${chips}</div>`;
}

function dedupNotesHtml(notes) {
  if (!notes?.length) return "";
  return `<ul class="group-advice-list">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}

function bestEntryCardHtml(entry, forms) {
  const { instance, form } = entry;
  const name = form?.name ?? instance?.formId ?? "Unknown";
  return `<li class="party-slot" data-group-best-form-id="${escapeHtml(instance?.formId ?? "")}">
    <article>
      <div class="party-slot-heading">
        ${spriteHtml(instance?.formId, forms, name, form?.primary_type)}
        <div class="party-slot-id">
          ${entry.role ? `<p class="party-role-chip">${escapeHtml(entry.role)}</p>` : ""}
          <h4>${escapeHtml(name)}</h4>
          <p class="group-best-card-member">${escapeHtml(entry.memberName)}</p>
        </div>
      </div>
      <p class="party-slot-stats">CP ${escapeHtml(instance?.cp ?? "—")}</p>
      ${whyLine(entry.why)}
    </article>
  </li>`;
}

function bossRollupCardHtml(boss, forms, coverage) {
  const name = forms?.[boss.formId]?.name ?? boss.formId;
  return `<div class="more-section group-boss-card" data-group-boss-id="${escapeHtml(boss.formId)}">
    <div class="briefing-boss-head">
      ${spriteHtml(boss.formId, forms, name, forms?.[boss.formId]?.primary_type)}
      <div class="briefing-boss-heading">
        <p class="briefing-eyebrow-row">${boss.tier ? `<span class="tier-pill">${escapeHtml(boss.tier)}</span>` : ""}</p>
        <h3>${escapeHtml(name)}</h3>
      </div>
    </div>
    ${groupEstimateHtml(coverage.groupEstimate)}
    ${coverage.best.length ? `<p class="briefing-bring-label">Best 6, attributed</p>
    <ul class="party-slot-list group-best-list" aria-label="Group's best attackers for ${escapeHtml(name)}">
      ${coverage.best.map((entry) => bestEntryCardHtml(entry, forms)).join("")}
    </ul>` : ""}
    ${gapsHtml(coverage.gaps)}
    ${dedupNotesHtml(coverage.dedupNotes)}
  </div>`;
}

function noRotationEmptyHtml() {
  return `<div class="more-section group-empty">
    <p class="status-kicker">No rotation right now</p>
    <p>Once there's a live raid boss, the group's combined coverage for it will show up here.</p>
  </div>`;
}

function answersSectionHtml({
  members, roster, forms, raids, data, currentBosses, memberName,
} = {}) {
  if (!members.length) return noMembersEmptyHtml();
  const bosses = currentBosses?.bosses ?? [];
  if (!bosses.length) return noRotationEmptyHtml();
  // groupBossCoverage's members shape is { name, roster }, not group-store's
  // { memberName, roster } — rename here, at the one call site that needs it.
  const groupMembers = members.map((member) => ({ name: member.memberName, roster: member.roster }));
  const allMembers = (roster?.instances?.length ?? 0) > 0
    ? [...groupMembers, { name: memberName || "You", roster }]
    : groupMembers;
  const cards = bosses
    .map((boss) => {
      const coverage = groupBossCoverage({
        targetFormId: boss.formId, members: allMembers, forms, raids, data,
      });
      // Unknown boss form (not in `forms`) — group-analysis.js's own
      // "can't honestly score this" contract; skip the card, don't crash.
      return coverage ? bossRollupCardHtml(boss, forms, coverage) : "";
    })
    .join("");
  return `<div class="group-answers">
    <p class="status-kicker">This rotation, together</p>
    ${cards}
  </div>`;
}

export function renderGroupView({
  roster = {}, forms = {}, raids = {}, data = {}, currentBosses = {}, members = [], warnings = [], memberName = "", now = new Date(),
} = {}) {
  return `<section class="more-view group-view" aria-labelledby="group-view-title">
    <p class="status-kicker">Raid Group</p>
    <h2 id="group-view-title">Raid Group</h2>
    <p>Combine your group's rosters into one plan for tonight's raids. Everything here comes from packs your group has exported and imported — no live sync, no accounts, no secrets.</p>
    ${groupSummaryHtml(members, now)}
    ${exportSectionHtml(memberName)}
    ${importSectionHtml(warnings)}
    ${memberListSectionHtml(members, now)}
    ${answersSectionHtml({
    members, roster, forms, raids, data, currentBosses, memberName,
  })}
  </section>`;
}
