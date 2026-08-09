import { escapeHtml, originLine, ownedStarButton, viewSegments, whyLine } from "./home.js";
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
    <!-- Why THIS one earns a slot was buried in the collapsed details below,
         so the card face showed what it covers but never why it is cheap
         enough to be on a low-resource list at all. -->
    ${whyLine(row.whyRanked)}
    ${originLine(row.origin, row.acquisition)}
    <details><summary>Low-resource build</summary><p>${escapeHtml(row.build)}</p></details>
  </article></li>`;
}


function offenseSection(gym, forms) {
  return `<section class="gym-section" aria-labelledby="gym-offense-title">
    ${sectionHeading("Low stardust and Candy", "Build These Six", "gym-offense-title")}
    <p class="gym-note">Solid Level 35–40 gym attackers with broad coverage; no second charged move is required.</p>
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


// Computed over every gym-eligible form, unlike the curated shortlist below.
// The point of showing lineups (not just a ranking) is that a lineup answers a
// different question: what should a coordinated group actually place, and
// therefore what is worth investing in next.
// Per-move numbers for a defender. basePower is the move's own power and power is
// the STAB-adjusted product; show the base one so a reader can look it up in the
// game, with the bonus called out separately rather than folded in silently.
// An Elite TM is a scarce resource, so naming a better move is only half the
// advice — the other half is whether it is worth spending one. The threshold is
// deliberately blunt: a few percent is not worth a TM you cannot re-earn, a
// third more damage usually is.
function eliteUpgradeLine(row) {
  const elite = row.eliteCharged;
  if (!elite?.move) return "";
  const gain = Number(elite.gainPct);
  // An Elite TM cannot be re-earned on demand, so the verdict matters as much as
  // the number. Blunt thresholds on purpose: a few percent is not worth a scarce
  // item, a quarter more damage usually is.
  const verdict = !Number.isFinite(gain) ? ""
    : gain >= 25 ? `<strong>Worth the TM.</strong> ${gain}% more damage is a real upgrade.`
      : gain >= 10 ? `Worth it only if you have Elite TMs to spare — ${gain}% is noticeable but not decisive.`
        : `Not worth an Elite TM. ${gain}% will not change a gym fight; save it for a raid attacker.`;
  return `<div class="gym-elite-upgrade">
    <p><strong>Elite TM option:</strong> ${moveLink(elite.move, { kind: "Charged" })} —
    the pick above is the best move you can get without one.</p>
    <dl class="gym-move-dps">
      <div><dt>With Elite TM</dt><dd>${elite.score}<span class="gym-dps-sub">weighted score</span></dd></div>
      <div><dt>Without</dt><dd>${elite.obtainableScore}<span class="gym-dps-sub">what you can build now</span></dd></div>
      ${Number.isFinite(gain) ? `<div><dt>Gain</dt><dd>+${gain}%</dd></div>` : ""}
    </dl>
    <p class="gym-elite-verdict">${verdict}</p>
  </div>`;
}


function defenderMoveNumbers(row) {
  const fast = row.moves?.fast;
  const charged = row.moves?.charged;
  if (!fast || !charged) return "";
  const bonus = (move) => (move.stab ? " ×1.2 same-type" : "");
  const threat = row.topThreats?.[0];
  return `<dl class="gym-move-dps" aria-label="Move numbers for ${escapeHtml(row.pokemon)}">
    <div><dt>Fast DPS</dt><dd>${fast.dps} <span class="gym-dps-sub">${fast.basePower ?? fast.power} power${bonus(fast)} / ${fast.durationS}s</span></dd></div>
    <div><dt>Energy</dt><dd>${fast.energyPerSecond}/s</dd></div>
    <div><dt>Charged</dt><dd>${charged.basePower ?? charged.power} power${bonus(charged)} <span class="gym-dps-sub">${charged.energyCost} energy, fires every ${charged.firesEverySeconds}s</span></dd></div>
    ${Number.isFinite(row.cycleDps)
      ? `<div><dt>Cycle DPS</dt><dd>${row.cycleDps}${threat ? ` <span class="gym-dps-sub">into ${escapeHtml(threat)}</span>` : ""}</dd></div>`
      : ""}
  </dl>`;
}

// Jump links for the Defending view, which is five long sections deep. Plain
// in-page anchors, not JS scroll handlers: the browser already does this, and a
// hash link keeps working if the script fails — the failure mode this app has
// been bitten by twice. Each section gets a matching "Back to top" so a reader
// forty defenders down is one tap from the list of sections.
const DEFEND_SECTIONS = Object.freeze([
  ["gym-lineups-title", "Starting lineups"],
  ["gym-ranking-title", "Defender ranking"],
  ["gym-defense-title", "Placement notes"],
  ["gym-motivation-title", "Motivation"],
  ["gym-owned-defenders-title", "What you own"],
]);


function sectionNav() {
  const links = DEFEND_SECTIONS
    .map(([id, label]) => `<li><a href="#${id}">${escapeHtml(label)}</a></li>`)
    .join("");
  return `<nav class="gym-section-nav" id="gym-top" aria-label="Jump to a section">
    <ul>${links}</ul>
  </nav>`;
}


export function backToTop() {
  return `<p class="gym-back-to-top"><a href="#gym-top">↑ Back to top</a></p>`;
}


function lineupSection(gym, forms, lineupShape = "clean", ownedFormIds = [], ownedOnly = false) {
  // Two strategies, not one ranked list. "Clean" is stronger when you can
  // build it; "chain breakers" is what a second account or a friend's thinner
  // roster can actually field, and burying it below five clean options hides
  // the answer most people need.
  const breaker = lineupShape === "breaker";
  const lineups = (breaker ? gym.chainBreakerLineups : gym.startingLineups) ?? [];
  const ranking = gym.defenderRanking ?? [];
  if (!lineups.length && !ranking.length) return "";

  const shapeTabs = `<div class="pvp-controls" aria-label="Lineup strategy">
    <fieldset><legend>Lineup shape</legend>
      <button type="button" data-lineup-shape="clean" aria-pressed="${!breaker}">No shared weakness</button>
      <button type="button" data-lineup-shape="breaker" aria-pressed="${breaker}">Chain breakers</button>
    </fieldset>
  </div>
  <p class="gym-note">${breaker
    ? "Two walls that share a weakness, with something between them that resists it — the attacker cannot walk straight through. Use these when you do not have three unrelated walls to hand."
    : "Nothing here is super-effective against more than one member, so no single attacker gets a free run. Strongest when you can build it."}</p>`;

  const lineupCards = lineups.map((lineup, index) => `<li class="gym-card"><article>
    <p class="gym-rank">Option ${index + 1}</p>
    <ol class="gym-lineup-order">${lineup.members.map((member) => `<li>
      ${spriteHtml(member.formId, forms, member.pokemon, forms?.[member.formId]?.primary_type)}
      <strong>${escapeHtml(member.pokemon)}</strong>
      <span class="gym-rank-n">#${member.rank}</span>
      <p class="gym-moves">${moveLink(member.bestFastMove, { kind: "Fast" })} + ${moveLink(member.bestChargedMove, { kind: "Charged" })}</p>
      ${whyLine(member.whyRanked)}
    </li>`).join("")}</ol>
    ${(lineup.chainBreaks ?? []).map((brk) => whyLine(
      `${brk.breaker} breaks the ${brk.type} chain between ${brk.between[0]} and ${brk.between[1]} — an attacker cannot walk straight through.`
    )).join("")}
    <p><strong>Shared weakness:</strong> ${lineup.sharedWeaknesses.length
      ? `${escapeHtml(lineup.sharedWeaknesses.join(", "))} — one attacker type pressures more than one slot`
      : "none — no single attacking type is super-effective against more than one member"}</p>
  </article></li>`).join("");

  // The two selection rules, stated once for the section rather than repeated on
  // fifty rows. The per-row lines below show the numbers that instantiate them,
  // which is the part that transfers: learn the rule, read any defender yourself.
  const defenderRules = `<details class="gym-rules">
    <summary>How a defending moveset is chosen</summary>
    <p><strong>Fast move — highest DPS whose type answers your worst weakness.</strong>
    DPS is power ÷ duration, times 1.2 if the move matches the Pokémon's own type.
    Where two are close, the one that is super-effective against the attackers who
    actually come for this defender wins: Snorlax's only weakness is Fighting, and
    Psychic hits Fighting for 1.6x, which is why Zen Headbutt beats Lick.</p>
    <p><strong>Charged move — damage per second of real time, not per energy.</strong>
    Divide the move's power by how long a full cycle takes: the fast moves needed
    to pay for it, plus its own animation. A big move that costs 100 energy and
    animates for 4s does less over time than a cheap one landing every ~6s, which
    is why Body Slam beats Outrage despite Outrage having more raw power.</p>
    <p>Both figures assume a Level 40 defender with 15 attack IV, and neither
    models berry feeding, motivation decay, or dodging.</p>
  </details>`;

  // 50, not 25: a second account or a friend's roster rarely has the top 25,
  // and a ranking that stops before the Pokemon you actually own is a ranking
  // you cannot act on.
  const ownedSet = new Set(ownedFormIds ?? []);
  // Owned-only filters the full ranking, not the display-capped top 50: the
  // whole reason the cap went from 25 to 50 (see above) was that owned
  // Pokemon land past a shallow cutoff, so a filter that only searched the
  // already-truncated slice would defeat its own purpose.
  const displayRanking = ownedOnly ? ranking.filter((row) => ownedSet.has(row.formId)) : ranking.slice(0, 50);
  const ownedOnlyToggle = `<div class="placement-controls" aria-label="Defender ranking filter">
    <button type="button" data-gym-owned-only aria-pressed="${ownedOnly}">Owned only</button>
  </div>`;
  // Tier, placement value, motivation and solo counters used to live on a
  // separate curated card list rendered below the ranking (defenderCard, now
  // removed) — the same Pokemon shown twice with different framing. assemble.py
  // already attaches those curated fields onto the matching ranked row
  // (curated_by_form loop in assemble.py), so render them here instead.
  const rankRows = displayRanking.map((row) => {
    const owned = ownedSet.has(row.formId);
    return `<li class="gym-rank-row gym-rank-card${owned ? " is-owned" : ""}"><article aria-labelledby="gym-rank-${row.rank}">
    <div class="gym-rank-head">
      ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
      <span class="gym-rank-n">#${row.rank}</span>
      <strong id="gym-rank-${row.rank}">${escapeHtml(row.pokemon)}</strong>
      <span class="gym-rank-score">${row.score}</span>
      ${row.curatedTier
        ? `<span class="gym-rank-tier" title="Hand-curated tier, not computed">${escapeHtml(row.curatedTier)}-tier <span class="acq-flag">curated</span></span>`
        : `<span class="gym-rank-untiered" title="Rank and score are computed for every eligible Pokémon; letter tiers exist only for the twelve hand-graded ones">not hand-graded</span>`}
      ${ownedStarButton({ formId: row.formId, name: row.pokemon, owned, route: "gyms" })}
    </div>
    <p class="gym-moves">${moveLink(row.bestFastMove, { kind: "Fast" })} + ${moveLink(row.bestChargedMove, { kind: "Charged" })}</p>
    ${row.weaknesses?.length ? `<p><strong>Weak to:</strong> ${escapeHtml(row.weaknesses.join(", "))}</p>` : ""}
    ${whyLine(row.whyRanked)}
    <details class="gym-rank-more">
      <summary>Move numbers, origin and full reasoning</summary>
      ${defenderMoveNumbers(row)}
      ${eliteUpgradeLine(row)}
      ${originLine(row.origin, row.acquisition)}
      ${whyLine(row.fastWhy, "Fast:")}
      ${whyLine(row.chargedWhy, "Charged:")}
      ${whyLine(row.moveNote)}
      ${(row.placementValue || row.motivationNote || row.soloCounters?.length) ? `
        <p class="gym-curated-label">Hand-curated notes <span class="acq-flag">not computed</span></p>
        ${whyLine(row.placementValue, "Placement:")}
        ${whyLine(row.motivationNote, "Motivation:")}
        ${row.soloCounters?.length ? `<p class="why-line"><strong>Solo counters:</strong> ${row.soloCounters.map((counter) => `${escapeHtml(counter.pokemon)} (${movePair(counter, forms)})`).join(", ")}</p>` : ""}
      ` : ""}
    </details>
  </article></li>`;
  }).join("");

  return `<section class="gym-section" aria-labelledby="gym-lineups-title">
    ${sectionHeading("Coordinated opening", "Starting lineups", "gym-lineups-title")}
    ${shapeTabs}
    <p class="gym-note">Three accounts dropping one each. Each option avoids a single attacking type sweeping the whole set, and no Pokémon anchors more than two options — so these are genuinely different things to invest toward, not one answer reshuffled.</p>
    <ul class="gym-card-list">${lineupCards}</ul>
    ${sectionHeading("Computed, not curated", "Defender ranking", "gym-ranking-title")}
    <p class="gym-curated-note">Rank and score are computed for every eligible Pokémon, so a row with no
      letter tier is not worse than one with an A — it simply is not among the twelve anyone hand-graded.
      Who is on this list and in what order is computed over every eligible
      Pokémon. A dozen rows also carry hand-researched notes — tier, placement, motivation, solo counters —
      marked <span class="acq-flag">curated</span> where they appear. Those are editorial judgement, not
      output of the model.</p>
    <p class="gym-note">${escapeHtml(gym.rankingMethodology ?? "")}</p>
    ${defenderRules}
    ${ownedOnlyToggle}
    ${displayRanking.length
      ? `<ol class="gym-rank-list">${rankRows}</ol>`
      : `<p class="gym-empty">No ranked defender is marked owned yet. <button type="button" data-gym-owned-only aria-pressed="${ownedOnly}">Show all defenders</button></p>`}
    <p class="gym-note">${escapeHtml(gym.defenderLevelNote ?? "")}</p>
  ${backToTop()}
  </section>`;
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
  ${backToTop()}
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

// Per-Pokemon detail (tier, placement value, motivation, solo counters) lives
// on the defender ranking rows now — see lineupSection — so this section is
// just the placement guidance that applies across every defender, not a
// second list of the same Pokemon with different framing.
function defenseSection(gym, trainerTeam) {
  const warnings = (gym.placementWarnings ?? []).map((warning) => `<aside class="gym-warning">
    <strong>${escapeHtml(warning.message)}</strong><p>${escapeHtml(warning.recommendation)}</p>
  </aside>`).join("");
  return `<section class="gym-section" aria-labelledby="gym-defense-title">
    ${sectionHeading("Break the attacker's flow", "Defender placement", "gym-defense-title")}
    <p class="gym-note">Alternate weaknesses and consider motivation decay; defense delays attackers but cannot guarantee a hold.</p>
    <p class="gym-note">${ownTeamGymNote(trainerTeam)}</p>
    <p class="gym-note">IV spread for a defender: favor Defense and Stamina over Attack. There's no CP cap to work around here, but higher Attack IV only inflates CP — and higher CP decays motivation faster — without adding any staying power.</p>
    ${warnings}
  ${backToTop()}
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
  ${backToTop()}
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
    <p class="gym-note">Track your gym defenses — longest hold, total time, and a friend leaderboard — on its own page.</p>
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
  view = "attack",
  lineupControls = "",
  lineupShape = "clean",
  ownedOnly = false,
} = {}) {
  const deploymentMap = buildDeploymentMap(defenseLog, now);
  const defending = view === "defend";
  // Two unrelated jobs share this route: breaking a gym and holding one. Split
  // them so neither answer is nine sections deep.
  const tabs = viewSegments("Gym view", "gyms", [
    ["", "Attacking"],
    ["defend", "Defending"],
  ], defending ? "defend" : "");
  const body = defending
    ? `${sectionNav()}
    ${lineupControls}
    ${renderPlacementCoach({ placementResult, ownedIndex, overallIndex, rosterInstances, deploymentMap })}
    ${lineupSection(gym, forms, lineupShape, ownedFormIds, ownedOnly)}
    ${defenseSection(gym, trainerTeam)}
    ${motivationSection()}
    ${ownedDefenderEditor(gym.defenders, ownedFormIds)}`
    : `${offenseSection(gym, forms)}
    ${staggerSection(gym)}`;
  return `<div class="gyms-view">
    <p class="gym-tricks-seed"><a class="safe-escape" href="./#basics/tricks" data-route="basics" data-view="tricks">See gym tricks →</a></p>
    ${tabs}
    ${body}
    ${leaderboardPointerCard()}
  </div>`;
}
