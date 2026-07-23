import { escapeHtml, ownedStarButton } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { moveLink } from "./move-sheet.js";
import { jargonTerm } from "../glossary.js";
import { buildDeploymentMap } from "../gym-availability.js";
import { bestInstanceForForm } from "../instances.js";
import { TEAM_SET } from "../storage.js";

// Team (GO): Bulbapedia's "Team (GO)" article — official team colors.
// Exported: leaderboard.js's team badge reuses these labels.
export const TEAM_LABELS = Object.freeze({ valor: "Valor", mystic: "Mystic", instinct: "Instinct" });


// Exported: leaderboard.js reuses this for its own section headings.
export function sectionHeading(kicker, title, id) {
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


export function formatDefenseDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}


// Full log/leaderboard/share UI moved to leaderboard.js (its own #leaderboard
// route) — this is just a short pointer card so Gyms visitors know where it
// went, not a duplicate of it.
function leaderboardPointerCard() {
  return `<section class="gym-section" aria-labelledby="gym-leaderboard-pointer-title">
    ${sectionHeading("Manual, honest tracking", "Gym Defense Leaderboard", "gym-leaderboard-pointer-title")}
    <p class="gym-intro">Track your gym defenses — longest hold, total time, and a friend leaderboard — on its own page.</p>
    <p><a class="safe-escape" href="./#leaderboard">Go to Leaderboard →</a></p>
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
  rosterInstances = [],
  now = Date.now(),
  trainerTeam = null,
} = {}) {
  const deploymentMap = buildDeploymentMap(defenseLog, now);
  return `<div class="gyms-view">
    <p class="gym-tricks-seed"><a class="safe-escape" href="./#tricks">See gym tricks →</a></p>
    ${renderPlacementCoach({ placementResult, ownedIndex, overallIndex, rosterInstances, deploymentMap })}
    ${offenseSection(gym, forms)}
    ${staggerSection(gym)}
    ${defenseSection(gym, forms, ownedFormIds, trainerTeam)}
    ${motivationSection()}
    ${ownedDefenderEditor(gym.defenders, ownedFormIds)}
    ${leaderboardPointerCard()}
  </div>`;
}
