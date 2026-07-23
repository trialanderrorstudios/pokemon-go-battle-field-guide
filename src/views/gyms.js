import { escapeHtml, ownedStarButton } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { moveLink } from "./move-sheet.js";
import { jargonTerm } from "../glossary.js";
import { buildLeaderboard, exportPlayerLog } from "../gym-defense-log.js";
import { buildDeploymentMap } from "../gym-availability.js";
import { bestInstanceForForm } from "../instances.js";
import { TEAM_SET } from "../storage.js";

// Team (GO): Bulbapedia's "Team (GO)" article — official team colors.
const TEAM_LABELS = Object.freeze({ valor: "Valor", mystic: "Mystic", instinct: "Instinct" });

function teamBadge(team) {
  return TEAM_SET.has(team)
    ? `<span class="team-badge" data-team="${escapeHtml(team)}">${escapeHtml(TEAM_LABELS[team])}</span>`
    : "";
}


function sectionHeading(kicker, title, id) {
  return `<p class="status-kicker">${escapeHtml(kicker)}</p><h2 id="${id}">${escapeHtml(title)}</h2>`;
}


function moveWithElite(moveId, form, kind) {
  const elite = new Set(form?.elite_moves ?? []).has(moveId);
  return moveLink(moveId, { elite, kind });
}


function movePair(row, forms) {
  const form = forms?.[row.formId];
  return `${moveWithElite(row.fastMove, form, "Fast")} + ${moveWithElite(row.chargedMove, form, "Charged")}`;
}


function buildCard(row, index, forms) {
  const id = `gym-build-${index + 1}`;
  return `<li class="gym-card"><article aria-labelledby="${id}">
    ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
    <p class="gym-rank">${index + 1} · ${escapeHtml(row.healingEfficiency)} healing efficiency</p>
    <h3 id="${id}">${escapeHtml(row.pokemon)}</h3>
    <p class="gym-moves"><strong>${movePair(row, forms)}</strong></p>
    <p>${escapeHtml(row.coverage)}</p>
    <details><summary>Low-resource build</summary><p>${escapeHtml(row.build)}</p><p>${escapeHtml(row.budgetReason)}</p></details>
  </article></li>`;
}


function offenseSection(gym, forms) {
  return `<section class="gym-section" aria-labelledby="gym-offense-title">
    ${sectionHeading("Low stardust and Candy", "Build These Six", "gym-offense-title")}
    <p class="gym-intro">Solid Level 35–40 gym attackers with broad coverage; no second charged move is required.</p>
    <ol class="gym-card-list">${(gym.buildTheseSix ?? []).map((row, index) => buildCard(row, index, forms)).join("")}</ol>
    <div class="gym-subsection" aria-labelledby="solo-offense-title">
      <h3 id="solo-offense-title">Solo gym offense</h3>
      <ol class="gym-steps">${(gym.soloOffense ?? []).map((row) => `<li><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.advice)}</p></li>`).join("")}</ol>
    </div>
  </section>`;
}


function staggerSection(gym) {
  const guide = gym.staggerGuide ?? {};
  return `<section class="gym-section" aria-labelledby="gym-stagger-title">
    ${sectionHeading("Coordinated two-player clear", "Two-player stagger", "gym-stagger-title")}
    <p>${escapeHtml(guide.goal)}</p>
    <ol class="gym-steps">${(guide.steps ?? []).map((step) => `<li><strong>${escapeHtml(step.player)}</strong><p>${escapeHtml(step.action)}</p></li>`).join("")}</ol>
    <p class="gym-caveat"><strong>Timing caveat:</strong> ${escapeHtml(guide.caveat)}</p>
  </section>`;
}


function defenderCard(row, forms, ownedFormIds) {
  const owned = new Set(ownedFormIds ?? []).has(row.formId);
  return `<li class="gym-card${owned ? " is-owned" : ""}"><article>
    ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
    <p class="gym-rank">${escapeHtml(row.defenseTier)}-tier defender</p>
    <h3>${escapeHtml(row.pokemon)}</h3>
    <p><strong>${movePair(row, forms)}</strong></p>
    <p><strong>Weak to:</strong> ${escapeHtml((row.weaknesses ?? []).join(", "))}</p>
    <p>${escapeHtml(row.placementValue)}</p>
    <p class="gym-why-line">${escapeHtml(row.whyLine)}</p>
    ${ownedStarButton({ formId: row.formId, name: row.pokemon, owned, route: "gyms" })}
    <span class="owned-count">${owned ? "Owned" : "Not owned"}</span>
    <details><summary>Motivation and solo counters</summary>
      <p><strong>Motivation:</strong> ${escapeHtml(row.motivationNote)}</p>
      ${(row.soloCounters ?? []).map((counter) => `<p>${escapeHtml(counter.pokemon)} · ${movePair(counter, forms)}</p>`).join("")}
    </details>
  </article></li>`;
}


// Motivation and coin mechanics: motivation/berry rules from Niantic's own
// gym-battles support page (data/sources/raw/official-gym-battles.html —
// "All Berries provide the same increase in motivation, with the exception
// of the Golden Razz Berry, which fully restores motivation"). The 1
// coin/10 minutes, 50-coin daily cap, paid-on-return rule isn't in that
// archived page; it's Niantic's long-standing, widely documented Defender
// Bonus rule (Pokémon GO Help Center, "Earning the Defender Bonus").
function motivationSection() {
  return `<section class="gym-section" aria-labelledby="gym-motivation-title">
    ${sectionHeading("Why defenders don't hold forever", "Motivation and CP decay", "gym-motivation-title")}
    <p>Every defender has ${jargonTerm("motivation", "motivation")} — a meter that falls both from time passing and from losing battles. As it falls, ${jargonTerm("cp-decay", "CP decay")} makes the defender easier for attackers to beat. At zero motivation, the defender leaves the gym the next time it loses a battle.</p>
    <p>Feeding a defending Pokémon a Berry restores motivation. Razz, Nanab, and Pinap Berries all restore the same amount; a Golden Razz Berry fully restores motivation in one feed.</p>
    <p>Defending pays PokéCoins: 1 coin per 10 minutes a Pokémon holds a gym, capped at 50 coins per day account-wide. Coins are paid out when a defender is knocked out and returns to you.</p>
  </section>`;
}


// You can only drop a defender into a gym your own team already controls
// (or an uncontested neutral one) — a rival-team gym has to be knocked to
// neutral first. Source: Bulbapedia's "Gym (GO)" article.
function ownTeamGymNote(trainerTeam) {
  return TEAM_SET.has(trainerTeam)
    ? `You can only deploy a defender into a gym Team ${escapeHtml(TEAM_LABELS[trainerTeam])} already controls (or an open, neutral one) — a rival-team gym has to be knocked to neutral first.`
    : `You can only deploy a defender into a gym your own team already controls (or an open, neutral one) — a rival-team gym has to be knocked to neutral first.`;
}

function defenseSection(gym, forms, ownedFormIds, trainerTeam) {
  const warnings = (gym.placementWarnings ?? []).map((warning) => `<aside class="gym-warning">
    <strong>${escapeHtml(warning.message)}</strong><p>${escapeHtml(warning.recommendation)}</p>
  </aside>`).join("");
  return `<section class="gym-section" aria-labelledby="gym-defense-title">
    ${sectionHeading("Break the attacker's flow", "Defender placement", "gym-defense-title")}
    <p class="gym-intro">Alternate weaknesses and consider motivation decay; defense delays attackers but cannot guarantee a hold.</p>
    <p class="gym-team-note">${ownTeamGymNote(trainerTeam)}</p>
    <p class="gym-iv-note">IV spread for a defender: favor Defense and Stamina over Attack. There's no CP cap to work around here, but higher Attack IV only inflates CP — and higher CP decays motivation faster — without adding any staying power.</p>
    ${warnings}
    <ul class="gym-card-list">${(gym.defenders ?? []).map((row) => defenderCard(row, forms, ownedFormIds)).join("")}</ul>
  </section>`;
}


function atIndex(rows, index) {
  if (!rows.length) return null;
  const normalized = ((Number(index) || 0) % rows.length + rows.length) % rows.length;
  return rows[normalized];
}


// Exact roster instance for this owned candidate is actively holding a gym
// right now — badge it instead of pretending it's freely available. Honest
// per gym-availability.js's instance-matching contract: only a candidate
// resolved to a real roster instanceId can ever be flagged here.
function deployedBadge(candidate) {
  if (!candidate?.deployment) return "";
  return `<p class="budget-verdict">Already defending ${escapeHtml(candidate.deployment.gym)} — ${escapeHtml(formatDefenseDuration(candidate.deployment.elapsedMs))}</p>`;
}


function recommendationCard(candidate, label, lane, index, count) {
  const recommendation = candidate
    ? `<h3>${escapeHtml(candidate.pokemon)}</h3>
      <p class="placement-score">Score ${escapeHtml(candidate.score)} · option ${index + 1} of ${count}</p>
      <p>${escapeHtml(candidate.rationale)}</p>
      <p><strong>Weak to:</strong> ${escapeHtml((candidate.weaknesses ?? []).join(", ") || "None listed")}</p>
      <p><strong>Resists repeated:</strong> ${escapeHtml((candidate.resistsCommon ?? []).join(", ") || "None")}</p>
      ${deployedBadge(candidate)}`
    : `<p class="gym-empty">${lane === "owned" ? "Mark an eligible defender as owned to fill this lane." : "No eligible defender remains."}</p>`;
  return `<article class="placement-lane" aria-labelledby="placement-${lane}-title">
    <p class="status-kicker">Independent recommendation lane</p>
    <h3 id="placement-${lane}-title">${escapeHtml(label)}</h3>
    ${recommendation}
    <div class="placement-controls">
      <button type="button" data-lane="${lane}" data-direction="previous" aria-label="Previous ${escapeHtml(label)} alternative">Previous alternative</button>
      <button type="button" data-lane="${lane}" data-direction="next" aria-label="Next ${escapeHtml(label)} alternative">Next alternative</button>
    </div>
  </article>`;
}


function ownedDefenderEditor(defenders, ownedFormIds) {
  const owned = new Set(ownedFormIds ?? []);
  return `<section class="gym-section" aria-labelledby="gym-owned-defenders-title">
    ${sectionHeading("Local roster", "Edit Owned Defenders", "gym-owned-defenders-title")}
    <p>Mark the exact defender forms you own so the Placement Coach can rank practical choices from your roster.</p>
    <fieldset class="placement-controls">
      <legend>Placement-eligible defender forms</legend>
      ${(defenders ?? []).map((row) => {
        const isOwned = owned.has(row.formId);
        return `<button type="button" class="owned-star${isOwned ? " is-owned" : ""}" data-owned-form-id="${escapeHtml(row.formId)}" data-owned-route="gyms" aria-pressed="${isOwned}" aria-label="I own ${escapeHtml(row.pokemon)}"><span aria-hidden="true">${isOwned ? "★" : "☆"}</span> ${escapeHtml(row.pokemon)} · ${escapeHtml(row.formId)}</button>`;
      }).join("")}
    </fieldset>
  </section>`;
}


// Owned candidates are ranked by formId only; badging needs the exact roster
// instance behind that formId (deployment is tracked per instanceId, not per
// form) — bestInstanceForForm resolves the same way the rest of the app
// already does (raid counter cards, coach.js) rather than forking a new lookup.
function withDeploymentBadges(rows, rosterInstances, deploymentMap) {
  if (!deploymentMap?.size) return rows;
  return rows.map((row) => {
    const instance = bestInstanceForForm(rosterInstances, row.formId);
    const deployment = instance ? deploymentMap.get(instance.id) : null;
    return deployment ? { ...row, deployment } : row;
  });
}


export function renderPlacementCoach({
  placementResult, ownedIndex = 0, overallIndex = 0, rosterInstances = [], deploymentMap = new Map(),
} = {}) {
  const result = placementResult ?? {};
  const ownedRows = withDeploymentBadges(result.ownedAlternatives ?? [], rosterInstances, deploymentMap);
  const overallRows = result.overallAlternatives ?? [];
  const safeOwnedIndex = ownedRows.length ? ((Number(ownedIndex) || 0) % ownedRows.length + ownedRows.length) % ownedRows.length : 0;
  const safeOverallIndex = overallRows.length ? ((Number(overallIndex) || 0) % overallRows.length + overallRows.length) % overallRows.length : 0;
  const warnings = (result.lineupWarnings ?? []).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `<section class="gym-section placement-coach" aria-labelledby="placement-coach-title">
    ${sectionHeading("Two independent lanes", "Placement Coach", "placement-coach-title")}
    <p>Choose defenders already in the gym, then compare an owned option with the unrestricted best placement.</p>
    ${warnings ? `<aside class="gym-warning"><strong>Weakness-chain warnings</strong><ul>${warnings}</ul></aside>` : ""}
    <div class="placement-lanes">
      ${recommendationCard(atIndex(ownedRows, safeOwnedIndex), "Best From Your Roster", "owned", safeOwnedIndex, ownedRows.length)}
      ${recommendationCard(atIndex(overallRows, safeOverallIndex), "Best Overall", "overall", safeOverallIndex, overallRows.length)}
    </div>
  </section>`;
}


function formatDefenseDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}


function defenseLeaderboardTable(rows) {
  if (!rows.length) {
    return `<p class="gym-empty">No defenders logged yet — drop one below to start the board.</p>`;
  }
  return `<div class="table-scroll"><table class="defense-leaderboard">
    <thead><tr><th>Player</th><th>Longest defense</th><th>Total defense time</th><th>Active now</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeHtml(row.playerName)} ${teamBadge(row.team)}</td>
      <td>${escapeHtml(formatDefenseDuration(row.longestMs))}${row.longestPokemon ? ` · ${escapeHtml(row.longestPokemon)}` : ""}</td>
      <td>${escapeHtml(formatDefenseDuration(row.totalMs))}</td>
      <td>${row.active.length}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}


function completeDefenseForm(completeDraft = {}) {
  return `<div class="defense-log-form" data-defense-log-complete-form>
    <label>Ended<input type="datetime-local" data-defense-log-complete-end value="${escapeHtml(completeDraft.endedAt ?? "")}"></label>
    <label>Coins earned (optional)<input type="number" min="0" step="1" inputmode="numeric" data-defense-log-complete-coins value="${escapeHtml(completeDraft.coins ?? "")}"></label>
    <div class="placement-controls">
      <button type="button" data-action="defense-log-complete">Save</button>
      <button type="button" data-action="defense-log-cancel-complete">Cancel</button>
    </div>
  </div>`;
}


function activeDefendersSection(rows, draft) {
  const active = rows.flatMap((row) => row.active.map((entry) => ({ ...entry, playerName: row.playerName, team: row.team })));
  if (!active.length) return `<p class="gym-empty">No defenders currently up.</p>`;
  return `<ul class="gym-card-list">${active.map((entry) => `<li class="gym-card" data-defense-entry-id="${escapeHtml(entry.id)}">
    <p class="gym-rank">${escapeHtml(entry.playerName)} ${teamBadge(entry.team)}</p>
    <p><strong>${escapeHtml(entry.pokemon)}</strong> · ${escapeHtml(entry.gymName)}</p>
    <p>Holding for ${escapeHtml(formatDefenseDuration(entry.elapsedMs))}</p>
    ${entry.isLocal ? (draft.completingId === entry.id
      ? completeDefenseForm(draft.completeDraft)
      : `<div class="placement-controls">
          <button type="button" data-action="defense-log-open-complete" data-defense-entry-id="${escapeHtml(entry.id)}">It came back</button>
          <button type="button" data-action="defense-log-delete" data-defense-entry-id="${escapeHtml(entry.id)}">Delete</button>
        </div>`) : ""}
  </li>`).join("")}</ul>`;
}


// Local-only, manual gym defense tracking (round 7): "I dropped a defender" /
// "it came back" entries, a longest/total/active leaderboard across the
// local player plus any imported friends, and a copy-paste share block —
// see web/src/gym-defense-log.js for the data model and format.
export function renderDefenseLog({ log, now = Date.now(), draft = {}, trainerTeam = null } = {}) {
  const safeLog = log ?? { localPlayerName: "You", entries: [] };
  const rows = buildLeaderboard(safeLog, now, trainerTeam);
  const message = draft.message ?? "";
  return `<section class="gym-section" aria-labelledby="gym-defense-log-title">
    ${sectionHeading("Manual, honest tracking", "Gym Defense Leaderboard", "gym-defense-log-title")}
    <p class="gym-intro">Pokémon GO doesn't expose gym-hold data to apps — this board is only as accurate as what you and your friends type in.</p>
    ${message ? `<aside class="gym-warning" role="alert"><p>${escapeHtml(message)}</p></aside>` : ""}
    <label class="defense-log-player-name">Your name on the board
      <input type="text" maxlength="40" data-defense-log-player-name value="${escapeHtml(safeLog.localPlayerName)}">
    </label>
    ${defenseLeaderboardTable(rows)}
    <h3>Active defenders</h3>
    ${activeDefendersSection(rows, draft)}
    <h3>Drop a defender</h3>
    ${(draft.recentGyms ?? []).length > 0 ? `<p class="defense-log-recents">Quick pick: ${(draft.recentGyms ?? []).map((gym) => `<button type="button" class="chip" data-action="defense-log-quick-gym" data-gym="${escapeHtml(gym)}">${escapeHtml(gym)}</button>`).join(" ")}</p>` : ""}
    ${draft.autoPickNote ? `<p class="defense-log-autopick-note">${escapeHtml(draft.autoPickNote)}</p>` : ""}
    <div class="defense-log-form">
      <label>Pokémon<input type="text" maxlength="60" data-defense-log-pokemon value="${escapeHtml(draft.pokemon ?? "")}"></label>
      <label>Gym name<input type="text" maxlength="80" data-defense-log-gym value="${escapeHtml(draft.gymName ?? "")}"></label>
      <button type="button" data-action="defense-log-use-location" title="Use your location to find nearby gyms"${draft.geoLoading ? ' disabled' : ''}>Use my location${draft.geoLoading ? '...' : ''}</button>
      <label>Start time<input type="datetime-local" data-defense-log-start value="${escapeHtml(draft.startedAt ?? "")}"></label>
      <button type="button" data-action="defense-log-start">I dropped a defender</button>
    </div>
    <h3>Send your leaderboard to a friend</h3>
    <p>Copy-and-paste: send the text below, they paste it into "Import a friend's leaderboard" below in their own app.</p>
    <button type="button" data-action="defense-log-toggle-share" aria-expanded="${Boolean(draft.shareOpen)}">${draft.shareOpen ? "Hide my leaderboard text" : "Show my leaderboard text"}</button>
    ${draft.shareOpen ? `<pre class="roster-share-text">${escapeHtml(exportPlayerLog(safeLog, trainerTeam))}</pre>
    <button type="button" data-action="defense-log-copy-share">Copy to clipboard</button>` : ""}
    <h3>Import a friend's leaderboard</h3>
    <div class="defense-log-form">
      <label>Paste a friend's leaderboard text<textarea rows="4" data-defense-log-import-text>${escapeHtml(draft.importText ?? "")}</textarea></label>
      <button type="button" data-action="defense-log-import">Import</button>
    </div>
  </section>`;
}


export function renderGyms({
  gym = {},
  forms = {},
  placementResult,
  ownedFormIds = [],
  ownedIndex = 0,
  overallIndex = 0,
  defenseLog,
  defenseLogDraft = {},
  rosterInstances = [],
  now = Date.now(),
  trainerTeam = null,
} = {}) {
  const deploymentMap = buildDeploymentMap(defenseLog, now);
  return `<div class="gyms-view">
    ${renderPlacementCoach({ placementResult, ownedIndex, overallIndex, rosterInstances, deploymentMap })}
    ${offenseSection(gym, forms)}
    ${staggerSection(gym)}
    ${defenseSection(gym, forms, ownedFormIds, trainerTeam)}
    ${motivationSection()}
    ${ownedDefenderEditor(gym.defenders, ownedFormIds)}
    ${renderDefenseLog({ log: defenseLog, now, draft: defenseLogDraft, trainerTeam })}
  </div>`;
}
