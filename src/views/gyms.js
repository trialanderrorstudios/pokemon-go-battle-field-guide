import { escapeHtml, originLine, ownedStarButton, viewSegments, whyLine } from "./home.js";
import { spriteHtml } from "../sprites.js";
import { displayMoveName, moveLink } from "./move-sheet.js";
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


// form.elite_moves lumps Community Day classics in with genuinely restricted
// moves — Blast Burn sits in the same list as Thunder Cage. Badging on raw
// membership told readers their Blast Burn Charizard needed an Elite TM, which
// is false for anyone who evolved during the event (i.e. most people) and is a
// worse error than the one this wave fixed. When the row carries a researched
// availabilityClass, trust it; when it does not, fall back to the old behaviour.
// One rule, applied per slot, from the researched class — not from raw
// form.elite_moves membership, which is wrong in BOTH directions. It lumps
// Community Day classics (Blast Burn, Frenzy Plant, Hydro Cannon) in with
// genuinely restricted moves, and it MISSES permanently-unobtainable ones that
// live in PvPoke's legacyMoves instead (Mega Mewtwo X's Counter), which
// rendered as freely available.
function moveWithElite(moveId, form, kind, availabilityClass) {
  const restricted = availabilityClass === "eliteOnly" || availabilityClass === "eventOnly";
  const elite = availabilityClass
    ? restricted
    : new Set(form?.elite_moves ?? []).has(moveId);
  return moveLink(moveId, { elite, kind });
}


function movePair(row, forms) {
  const form = forms?.[row.formId];
  // Fall back to the row-level class where per-slot is absent, then to the old
  // membership behaviour where neither is shipped.
  const fastCls = row.fastAvailabilityClass ?? row.availabilityClass;
  const chargedCls = row.chargedAvailabilityClass ?? row.availabilityClass;
  return `${moveWithElite(row.fastMove, form, "Fast", fastCls)} + ${moveWithElite(row.chargedMove, form, "Charged", chargedCls)}`;
}


// A caught shadow is forced onto Frustration until a Charged TM is spent on it (see
// shadowUpgradeLine below); Frustration also has no move-sheet catalog entry, so the normal
// moveLink button would tap through to a sheet reading "Unknown, Fast move". Show it as plain,
// unlinked text with the same locked badge the shadow-upgrade block uses instead.
function chargedMoveDisplay(moveId) {
  if (moveId === "FRUSTRATION") {
    return `${escapeHtml(displayMoveName(moveId))} <small class="elite-tm">Locked</small>`;
  }
  return moveLink(moveId, { kind: "Charged" });
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


// A team member's fast/charged pair carries its own eliteFastTM/eliteChargedTM/
// eventOnlyFastTM/eventOnlyChargedTM/availabilityClass flags in the data
// (gym.attackTeams) rather than needing a form lookup. Event-only moves (not
// obtainable via any TM — Zacian's Behemoth Blade) get the same warning badge
// as Elite-TM moves since moveLink only knows the "Elite" wording; a
// communityDayClassic headline is never scare-labelled, since the raid meta
// assumes every serious player already has it.
function moveAvailabilityBadge(moveId, { kind, elite, eventOnly, availabilityClass }) {
  if (availabilityClass === "communityDayClassic") return moveLink(moveId, { kind });
  if (elite) return moveLink(moveId, { kind, elite: true });
  if (eventOnly) return `${moveLink(moveId, { kind })} <small class="elite-tm">Event-only move</small>`;
  return moveLink(moveId, { kind });
}

function attackTeamMemberMoves(member) {
  const cls = member.availabilityClass;
  const fast = moveAvailabilityBadge(member.fastMove, { kind: "Fast", elite: member.eliteFastTM, eventOnly: member.eventOnlyFastTM, availabilityClass: cls });
  const charged = moveAvailabilityBadge(member.chargedMove, { kind: "Charged", elite: member.eliteChargedTM, eventOnly: member.eventOnlyChargedTM, availabilityClass: cls });
  return `${fast} + ${charged}`;
}

function attackTeamMemberCard(member, forms) {
  return `<li class="gym-card"><article>
    ${spriteHtml(member.formId, forms, member.pokemon, forms?.[member.formId]?.primary_type ?? member.attackingType)}
    <h4>${escapeHtml(member.pokemon)}</h4>
    ${member.investmentTier ? `<p class="gym-rank">${escapeHtml(member.investmentTier)} investment</p>` : ""}
    <p class="gym-moves">${attackTeamMemberMoves(member)}</p>
    <p>${escapeHtml(member.role)}</p>
    ${member.noObtainableAlternative ? `<p class="gym-warning-note">No obtainable ${escapeHtml(member.attackingType)} moveset exists for this Pokémon — this is its only option, Elite TM or not.</p>` : ""}
    ${member.answers?.length ? `<p class="gym-note"><strong>Best answer to:</strong> ${member.answers.map((answer) => `${escapeHtml(answer.pokemon)} (#${answer.defenderRank}, ${answer.effDps} eff DPS)`).join(", ")}</p>` : ""}
    ${whyLine(member.whyRanked)}
  </article></li>`;
}

// Budget/mid/premium are three genuinely different builds, not one ranking
// truncated at different depths — eligibilityNote says what each one costs to
// build in its own words (budget: cost-constrained, same list as Build These
// Six, explicitly NOT the six best attackers available; mid: no
// Megas/legendaries; premium: anything, one Mega cap), so it renders as the
// tier's own headline, right where a reader meets the member list, rather
// than a caption.
function attackTeamTierSection(tier, forms) {
  return `<div class="gym-subsection" aria-labelledby="gym-team-${escapeHtml(tier.id)}-title">
    <h3 id="gym-team-${escapeHtml(tier.id)}-title">${escapeHtml(tier.title)}</h3>
    <p class="gym-note">${escapeHtml(tier.eligibilityNote)}</p>
    <ol class="gym-card-list">${(tier.members ?? []).map((member) => attackTeamMemberCard(member, forms)).join("")}</ol>
    ${tier.coverageGaps?.length ? `<p class="gym-warning-note"><strong>No super-effective team answer:</strong> ${escapeHtml(tier.coverageGaps.join(", "))}</p>` : ""}
  </div>`;
}

function attackTeamsSection(gym, forms) {
  const attackTeams = gym.attackTeams;
  if (!attackTeams?.tiers?.length) return "";
  return `<section class="gym-section" aria-labelledby="gym-attack-teams-title">
    ${sectionHeading("Six defenders, one team at a time", "Gym-attacking teams", "gym-attack-teams-title")}
    <p class="gym-note">${escapeHtml(attackTeams.methodology ?? "")}</p>
    <p class="gym-note">Which moves need an Elite TM, aren't obtainable via any TM, or are a Community Day
      classic every serious player already has is a <span class="acq-flag">hand-researched</span> classification.</p>
    ${attackTeams.tiers.map((tier) => attackTeamTierSection(tier, forms)).join("")}
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
// quarter more damage usually is.
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
  // A percentage alone doesn't answer "does it move up" — a tier band crossing does. Ursaluna
  // gains 3.6% and stays B-tier either way, which is a clearer argument against spending a
  // scarce, non-re-earnable TM than the percentage by itself.
  const tierNote = elite.tier === row.tier
    ? ` It stays ${escapeHtml(row.tier)} tier either way (rank ${row.rank} → ${elite.rank}).`
    : ` It moves from ${escapeHtml(row.tier)} tier to ${escapeHtml(elite.tier)} tier (rank ${row.rank} → ${elite.rank}).`;
  // Community Day moves are NOT Elite-TM-gated for most people: anyone who
  // evolved during the event has Meteor Mash or Hydro Cannon already. Badging
  // them the same as Thunder Cage overstates what the upgrade costs, which is
  // the mirror of the defect this wave set out to fix. Three shipped rows are
  // in this class (Metagross, Primarina, Blastoise).
  const communityDay = elite.availabilityClass === "communityDayClassic";
  const label = communityDay ? "Community Day move" : "Elite TM option";
  const without = communityDay
    ? "the pick above is the best move you can get without it."
    : "the pick above is the best move you can get without one.";
  return `<div class="gym-elite-upgrade">
    <p><strong>${label}:</strong> ${moveLink(elite.move, { kind: "Charged", elite: !communityDay })} —
    ${without}</p>
    <dl class="gym-move-dps">
      <div><dt>${communityDay ? "With it" : "With Elite TM"}</dt><dd>${elite.score}<span class="gym-dps-sub">rank #${elite.rank}, ${escapeHtml(elite.tier)} tier</span></dd></div>
      <div><dt>Without</dt><dd>${elite.obtainableScore}<span class="gym-dps-sub">rank #${row.rank}, ${escapeHtml(row.tier)} tier — what you can build now</span></dd></div>
      ${Number.isFinite(gain) ? `<div><dt>Gain</dt><dd>+${gain}%</dd></div>` : ""}
    </dl>
    <p class="gym-elite-verdict">${verdict}${tierNote}</p>
  </div>`;
}


// Same shape as eliteUpgradeLine (a dl of with/without numbers plus a verdict paragraph), but
// inverted framing: the headline pick above IS the forced default (a caught shadow starts with
// no charged move and defaults to Frustration — see gym_ranking.py's charged_pool_override),
// and the "upgrade" is the real charged move a Charged TM would unlock. That TM is only handed
// out during a Team GO Rocket takeover event — a scarcity claim this dataset does not derive, so
// it carries the same "not computed" badge as every other hand-researched note on this page
// (acq-flag; see the curated-notes block below).
function shadowUpgradeLine(row) {
  const shadow = row.shadowCharged;
  if (!shadow?.move) return "";
  const gain = Number(shadow.gainPct);
  const tierNote = shadow.tier === row.tier
    ? `It stays ${escapeHtml(row.tier)} tier either way (rank ${row.rank} → ${shadow.rank}) — real damage, but not a tier change.`
    : `It moves from ${escapeHtml(row.tier)} tier to ${escapeHtml(shadow.tier)} tier (rank ${row.rank} → ${shadow.rank}).`;
  return `<div class="gym-elite-upgrade">
    <p><strong>Locked to Frustration.</strong> A caught shadow has no charged move of its own and
    defaults to Frustration until a Charged TM is spent on it, which only happens during a Team
    GO Rocket takeover event <span class="acq-flag">not computed</span>.</p>
    <p>With one, it could carry ${moveLink(shadow.move, { kind: "Charged" })} instead.</p>
    <dl class="gym-move-dps">
      <div><dt>With Charged TM</dt><dd>${shadow.score}<span class="gym-dps-sub">rank #${shadow.rank}, ${escapeHtml(shadow.tier)} tier</span></dd></div>
      <div><dt>Locked to Frustration</dt><dd>${shadow.obtainableScore}<span class="gym-dps-sub">rank #${row.rank}, ${escapeHtml(row.tier)} tier</span></dd></div>
      ${Number.isFinite(gain) ? `<div><dt>Gain</dt><dd>+${gain}%</dd></div>` : ""}
    </dl>
    <p class="gym-shadow-verdict">${tierNote}</p>
  </div>`;
}


function defenderMoveNumbers(row) {
  const fast = row.moves?.fast;
  const charged = row.moves?.charged;
  if (!fast || !charged) return "";
  const bonus = (move) => (move.stab ? " ×1.2 same-type" : "");
  const threat = row.topThreats?.[0];
  // A zero-power fast move (Yawn, Splash) still banks energy for the charged hit — it isn't
  // broken data, but "Fast DPS 0" sitting next to a real Cycle DPS reads like one unless the
  // row says why. See whyRanked (rendered above this block) for the full explanation.
  const zeroPowerNote = fast.dps === 0 && fast.energyPerSecond > 0
    ? ` <span class="gym-dps-sub">no direct fast damage — its energy funds Cycle DPS below</span>`
    : "";
  return `<dl class="gym-move-dps" aria-label="Move numbers for ${escapeHtml(row.pokemon)}">
    <div><dt>Fast DPS</dt><dd>${fast.dps} <span class="gym-dps-sub">${fast.basePower ?? fast.power} power${bonus(fast)} / ${fast.durationS}s</span>${zeroPowerNote}</dd></div>
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
  ["placement-coach-title", "Placement Coach"],
  ["gym-lineups-title", "Starting lineups"],
  ["gym-ranking-title", "Defender ranking"],
  ["gym-bands-title", "Band spotlight"],
  ["gym-shadow-title", "Shadow defenders"],
  ["gym-defense-title", "Placement notes"],
  ["gym-motivation-title", "Motivation"],
  ["gym-owned-defenders-title", "What you own"],
]);


function sectionNav() {
  const links = DEFEND_SECTIONS
    .map(([id, label]) => `<li><a href="#${id}">${escapeHtml(label)}</a></li>`)
    .join("");
  // id="gym-top" lives on the .gyms-view wrapper (see renderGyms), not here — this
  // nav sits below the tabs and the "gym tricks" link, so anchoring to it left
  // "Back to top" one screen short of the actual top.
  return `<nav class="gym-section-nav" aria-label="Jump to a section">
    <ul>${links}</ul>
  </nav>`;
}


export function backToTop() {
  return `<p class="gym-back-to-top"><a href="#gym-top">↑ Back to top</a></p>`;
}


// Placeholder for a section body deferred until its <details> first opens.
// The matching outer element also carries data-lazy="<id>" (see the lazy*
// call sites below) so app.js's capture-phase 'toggle' listener knows to call
// buildLazyGymBody(id, ...) and drop the result straight into this div — no
// registry to keep in sync, the id alone is enough to rebuild the same HTML
// buildLazyGymBody would have produced at render time.
function lazyGymPlaceholder() {
  return `<div class="gym-lazy-body"></div>`;
}

const TIER_CHUNK_SIZE = 25;
const TIER_CHUNK_THRESHOLD = 40;

// Solo counters moved from a hand-curated passthrough to a computed field
// (see gym.soloCountersMethod) but keep the same {pokemon, fastMove,
// chargedMove, formId} shape movePair() already reads, plus investmentTier —
// shown so a reader sees what a "best answer" costs to build, not just that
// it's a fast pick. "computed" replaces the old "not computed" flag: this is
// the opposite claim from the hand-curated block it used to live inside.
function soloCountersLine(row, forms) {
  if (!row.soloCounters?.length) return "";
  const counters = row.soloCounters.map((counter) => {
    const tier = counter.investmentTier ? `, ${escapeHtml(counter.investmentTier)} investment` : "";
    return `${escapeHtml(counter.pokemon)} (${movePair(counter, forms)}${tier})`;
  }).join(", ");
  return `<p class="why-line"><strong>Best answers:</strong> ${counters} <span class="acq-flag">computed</span></p>`;
}

// The body of a ranked row's "Move numbers, origin and full reasoning"
// details — factored out of renderRankRow so both the eager render and the
// on-demand lazy rebuild (buildLazyGymBody) produce byte-identical output
// from one place.
function rankMoreBody(row, forms) {
  return `${defenderMoveNumbers(row)}
      ${eliteUpgradeLine(row)}
      ${shadowUpgradeLine(row)}
      ${originLine(row.origin, row.acquisition)}
      ${whyLine(row.fastWhy, "Fast:")}
      ${whyLine(row.chargedWhy, "Charged:")}
      ${whyLine(row.moveNote)}
      ${soloCountersLine(row, forms)}
      ${(row.placementValue || row.motivationNote) ? `
        <p class="gym-curated-label">Hand-curated notes <span class="acq-flag">not computed</span></p>
        ${whyLine(row.placementValue, "Placement:")}
        ${whyLine(row.motivationNote, "Motivation:")}
      ` : ""}`;
}

// Hoisted out of lineupSection (was a closure over `forms`) so
// buildLazyGymBody can rebuild one lead group's option cards on demand
// instead of only at initial render — same reason renderRankRow below was
// hoisted. Five options per lead means a reader could mistake #5 for a
// reshuffle of #1 instead of a real quality decline — show the lineup's own
// score, and how far behind the group's best option it is, so the ordering
// reads as honest rather than interchangeable picks.
function lineupCard(lineup, optionNumber, bestScore, forms) {
  const gap = optionNumber > 1 && Number.isFinite(bestScore) && bestScore > 0
    ? ` <span class="gym-dps-sub">${(100 * (bestScore - lineup.lineupScore) / bestScore).toFixed(0)}% behind option 1</span>`
    : "";
  return `<li class="gym-card"><article>
    <p class="gym-rank">Option ${optionNumber} · score ${lineup.lineupScore}${gap}</p>
    <ol class="gym-lineup-order">${lineup.members.map((member) => `<li>
      ${spriteHtml(member.formId, forms, member.pokemon, forms?.[member.formId]?.primary_type)}
      <strong>${escapeHtml(member.pokemon)}</strong>
      <span class="gym-rank-n">#${member.rank}</span>
      <p class="gym-moves">${moveLink(member.bestFastMove, { kind: "Fast" })} + ${chargedMoveDisplay(member.bestChargedMove)}</p>
      ${whyLine(member.whyRanked)}
    </li>`).join("")}</ol>
    ${(lineup.chainBreaks ?? []).map((brk) => whyLine(
      `${brk.breaker} breaks the ${brk.type} chain between ${brk.between[0]} and ${brk.between[1]} — an attacker cannot walk straight through.`
    )).join("")}
    <p><strong>Shared weakness:</strong> ${lineup.sharedWeaknesses.length
      ? `${escapeHtml(lineup.sharedWeaknesses.join(", "))} — one attacker type pressures more than one slot`
      : "none — no single attacking type is super-effective against more than one member"}</p>
  </article></li>`;
}

// A lead group's option cards, grid-friendly at any count — factored out so
// both the eager render and buildLazyGymBody's on-demand rebuild produce
// byte-identical output from one place (same rationale as rankMoreBody).
function leadOptionsHtml(lineups, forms) {
  const bestScore = lineups[0]?.lineupScore;
  return `<ul class="gym-card-list">${lineups.map((lineup, i) => lineupCard(lineup, i + 1, bestScore, forms)).join("")}</ul>`;
}

// Hoisted out of lineupSection (was a closure over forms/ownedSet) so
// buildLazyGymBody can call it too, for a tier/chunk built on demand instead
// of at initial render. `lazy` defers the row's OWN inner .gym-rank-more —
// independent of whether the tier around it is open or closed — because
// otherwise the eagerly-open S tier (or an owned-only filter matching many
// rows) still builds every row's full reasoning block up front, and that
// block is most of a row's bytes.
function renderRankRow(row, forms, ownedSet, lazy) {
  const owned = ownedSet.has(row.formId);
  const moreLazyId = `more|normal|${row.formId}`;
  return `<li class="gym-rank-row gym-rank-card${owned ? " is-owned" : ""}"><article aria-labelledby="gym-rank-${row.rank}">
    <div class="gym-rank-head">
      ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
      <span class="gym-rank-n">#${row.rank}</span>
      <strong id="gym-rank-${row.rank}">${escapeHtml(row.pokemon)}</strong>
      <span class="gym-rank-score">${row.score}</span>
      ${row.curatedTier
        ? `<span class="gym-rank-tier" title="Hand-curated tier, not computed">${escapeHtml(row.curatedTier)}-tier <span class="acq-flag">curated</span></span>`
        : ""}
      ${ownedStarButton({ formId: row.formId, name: row.pokemon, owned, route: "gyms" })}
    </div>
    <p class="gym-moves">${moveLink(row.bestFastMove, { kind: "Fast" })} + ${chargedMoveDisplay(row.bestChargedMove)}</p>
    ${row.weaknesses?.length ? `<p><strong>Weak to:</strong> ${escapeHtml(row.weaknesses.join(", "))}</p>` : ""}
    ${row.resists?.length ? `<p><strong>Resists:</strong> ${escapeHtml(row.resists.join(", "))}</p>` : ""}
    ${whyLine(row.whyRanked)}
    <details class="gym-rank-more"${lazy ? ` data-lazy="${escapeHtml(moreLazyId)}"` : ""}>
      <summary>Move numbers, origin and full reasoning</summary>
      ${lazy ? lazyGymPlaceholder() : rankMoreBody(row, forms)}
    </details>
  </article></li>`;
}

function tierRowsHtml(rows, forms, ownedSet, lazy) {
  return `<ol class="gym-rank-list">${rows.map((row) => renderRankRow(row, forms, ownedSet, lazy)).join("")}</ol>`;
}

// Shared by the eager render (a force-open tier — S, or any tier under an
// owned-only filter) and buildLazyGymBody (a closed tier, built the first
// time its <details> opens). `totalRanked` is the section's overall
// ranking.length, needed for the chunk intro sentence.
function buildTierSectionBody(tier, rows, forms, ownedSet, lazy, totalRanked) {
  const chunks = [];
  if (rows.length > TIER_CHUNK_THRESHOLD) {
    for (let i = 0; i < rows.length; i += TIER_CHUNK_SIZE) chunks.push(rows.slice(i, i + TIER_CHUNK_SIZE));
  }
  if (chunks.length <= 1) return tierRowsHtml(rows, forms, ownedSet, lazy);
  // ponytail: chunks build in full as soon as their parent tier opens — no
  // shipped tier currently exceeds TIER_CHUNK_THRESHOLD (largest today is 26
  // of 40), so a second lazy layer here has no live payoff yet. Give a chunk
  // its own data-lazy (same mechanism, chunk index is already a unique
  // suffix on the tier's lazy id) if a future refresh piles rows past the
  // threshold again.
  return `<p class="gym-note">${tier} tier is the rest of the shipped top ${totalRanked} defenders —
      every row in it still out-ranked every eligible Pokémon that isn't on this list. Split below
      by rank so you can open the range you care about instead of the whole tier at once.</p>
    ${chunks.map((chunk) => {
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      const scoreHigh = Math.max(first.score, last.score);
      const scoreLow = Math.min(first.score, last.score);
      return `<details class="gym-tier-section">
        <summary>Ranks ${first.rank}–${last.rank} · scores ${scoreHigh}–${scoreLow}</summary>
        ${tierRowsHtml(chunk, forms, ownedSet, lazy)}
      </details>`;
    }).join("")}`;
}


function lineupSection(gym, forms, lineupShape = "clean", ownedFormIds = [], ownedOnly = false, lazy = false) {
  // Two strategies, not one ranked list. "Clean" is stronger when you can
  // build it; "chain breakers" is what a second account or a friend's thinner
  // roster can actually field, and burying it below five clean options hides
  // the answer most people need.
  const breaker = lineupShape === "breaker";
  const lineups = (breaker ? gym.chainBreakerLineups : gym.startingLineups) ?? [];
  const ranking = gym.defenderRanking ?? [];
  if (!lineups.length && !ranking.length) return "";
  // Measured, not asserted: how often the hand-curated tier disagrees with the
  // computed one drifts every time gym_ranking.py or the curated notes change,
  // so the count rendered near the ranking below has to come from this data.
  const curatedRows = ranking.filter((row) => row.curatedTier);
  const curatedDisagreements = curatedRows.filter((row) => row.curatedTier !== row.tier).length;

  const shapeTabs = `<div class="pvp-controls" aria-label="Lineup strategy">
    <fieldset><legend>Lineup shape</legend>
      <button type="button" data-lineup-shape="clean" aria-pressed="${!breaker}">No shared weakness</button>
      <button type="button" data-lineup-shape="breaker" aria-pressed="${breaker}">Chain breakers</button>
    </fieldset>
  </div>
  <p class="gym-note">${breaker
    ? "Two walls that share a weakness, with something between them that resists it — the attacker cannot walk straight through. Use these when you do not have three unrelated walls to hand."
    : "Nothing here is super-effective against more than one member, so no single attacker gets a free run. Strongest when you can build it."}</p>`;

  // Lineups are grouped by lead (the first member each option opens with) rather
  // than shown as one flat numbered list: which Pokemon you invest toward first
  // is the actual decision, and "Option 4" meant nothing without scrolling back
  // to see who led it. gym_ranking.py now ships a "lead" field per lineup
  // (formId/pokemon/rank/tier/score) and a "whyLead" string grounded in that
  // lead's own computed numbers — grouping and its justification both read from
  // data instead of inferring the lead from members[0].
  const leadGroups = [];
  for (const lineup of lineups) {
    const lead = lineup.lead?.pokemon ?? lineup.members[0]?.pokemon ?? "Unknown";
    const leadFormId = lineup.lead?.formId ?? lineup.members[0]?.formId ?? "unknown";
    let group = leadGroups.at(-1)?.leadFormId === leadFormId ? leadGroups.at(-1) : null;
    if (!group) { group = { lead, leadFormId, whyLead: lineup.whyLead, lineups: [] }; leadGroups.push(group); }
    group.lineups.push(lineup);
  }
  // formId, not the Pokemon's display name, in the anchor id: names can carry spaces or
  // punctuation ("Steelix (Shadow)"), formId is already the app's stable, id-safe slug for it.
  // whyLead is rendered once per group, right under the heading it explains: it's the
  // same string for every option sharing that lead, and it's what stops a rank-81/C
  // Slaking leading four lineups from reading as the page contradicting its own ranking.
  //
  // The heading and whyLead stay eager (outside the collapsible), same reasoning
  // as the "why" line on every other lazy row — a reader deciding whether to open
  // a group needs the justification before opening it, not after. Only the six
  // option cards collapse: reusing the same lazy machinery as the tier/band/shadow
  // sections above (a <details data-lazy> the capture-phase toggle in app.js
  // already knows how to fill), which is what keeps growing from 5 to 6 options
  // per lead from undoing the lazy-build DOM win. The lineup shape ("clean" vs
  // "breaker") has to ride inside the lazy id itself, not the shared toggle
  // context, since chainBreakerLineups and startingLineups are two different
  // pools keyed by the same lead formId.
  //
  // No wrapping <div class="gym-subsection"> here (unlike the attack-team tier
  // subsections above): the tap-target CSS for a tier toggle is
  // `.gym-section > details > summary` — a direct-child selector — and a
  // wrapper div would put this <details> two levels below .gym-section instead
  // of one, landing the toggle at 23px tall instead of 48px (measured). Every
  // other collapsible in this section (tierSections below) is already a direct
  // child of the returned <section> for the same reason.
  const lineupCards = leadGroups.map((group) => {
    const lazyId = `lead|${lineupShape}|${group.leadFormId}`;
    const optionCount = group.lineups.length;
    const body = lazy ? lazyGymPlaceholder() : leadOptionsHtml(group.lineups, forms);
    return `<h3 id="gym-lineup-lead-${escapeHtml(group.leadFormId)}">Led by ${escapeHtml(group.lead)}</h3>
    ${whyLine(group.whyLead)}
    <details class="gym-tier-section"${lazy ? ` data-lazy="${escapeHtml(lazyId)}"` : ""}>
      <summary>${optionCount} option${optionCount === 1 ? "" : "s"}</summary>
      ${body}
    </details>`;
  }).join("");

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
    <p><strong>Charged move — damage per second of real time, not per energy,</strong>
    scored across every weakness this defender actually faces, not the single
    worst one. Divide the move's power by how long a full cycle takes, then
    weight each weakness by how hard the best attacker of that type actually
    hits, plus a neutral case for attackers that aren't the textbook counter.
    Scoring only the worst column is what put Chilling Water on Florges — Water
    edges out Psychic on the Steel column by a hair, but that column never
    checks Poison, where Psychic wins by a mile, or the neutral case, where
    Chilling Water is the weaker pick. Weighing every column instead is why
    Florges carries Psychic.</p>
    <p>Both figures assume a Level 40 defender with 15 attack IV, and neither
    models berry feeding, motivation decay, or dodging.</p>
  </details>`;

  // No display cap: a second account or a friend's roster rarely has the top
  // 25, and a ranking that stops before the Pokemon you actually own is a
  // ranking you cannot act on. Render whatever the shipped ranking contains —
  // not a pinned row count, which would silently drift from what python
  // actually ships (gym_ranking.py) the next time the eligible pool changes.
  const ownedSet = new Set(ownedFormIds ?? []);
  const displayRanking = ownedOnly ? ranking.filter((row) => ownedSet.has(row.formId)) : ranking;
  const ownedOnlyToggle = `<div class="placement-controls" aria-label="Defender ranking filter">
    <button type="button" data-gym-owned-only aria-pressed="${ownedOnly}">Owned only</button>
  </div>`;
  // Tier, placement value and motivation used to live on a separate curated
  // card list rendered below the ranking (defenderCard, now removed) — the
  // same Pokemon shown twice with different framing. assemble.py already
  // attaches those curated fields onto the matching ranked row
  // (curated_by_form loop in assemble.py), so render them here instead.
  // renderRankRow itself is now module-scope (see above lineupSection) so
  // buildLazyGymBody can build the same row on demand.

  // Every row already carries a computed S/A/B/C tier (bands set on natural
  // score gaps, re-measured whenever the underlying score distribution changes —
  // see gym_ranking.py; counts are data-derived, not a fixed split, so they are
  // read from `rows.length` below rather than pinned in this comment), so a flat
  // hundred-row list was hiding the one thing tiers exist to show: that ranks
  // 8-20 are interchangeable while rank 1-2 are a class apart. Grouping by tier —
  // S open, the rest collapsed — surfaces that without a reader scrolling the
  // whole list. Native <details>, no JS: same rationale as the section-nav above
  // (line 125), and it also means opening the largest (C) section is just a CSS
  // display toggle on already-rendered markup, not a re-render — no perf cliff.
  // Derived from the rows, not hardcoded. The tail letters (C/D/F) are
  // tertiles of the shipped population, so the SET can change with the data —
  // and a hardcoded four silently dropped every D and F row on the floor,
  // rendering 51 of 100 defenders while every count in the section summaries
  // still added up.
  const TIER_ORDER = [...new Set(ranking.map((row) => row.tier))];
  const tierGroups = TIER_ORDER
    .map((tier) => [tier, displayRanking.filter((row) => row.tier === tier)])
    .filter(([, rows]) => rows.length); // no empty "0 defenders" sections to click past
  // Owned-only is a reader asking for a specific subset, not browsing blind — a
  // tier that survives the filter is exactly what they asked for, so open every
  // one of them. Unfiltered, only S opens: two defenders is a glance, fifty isn't.
  //
  // C holds most of the 100 (75 today) and the score gaps inside it are all
  // under 0.8 — nothing there discriminates the way the S/A break does, so a
  // flat 75-row list was scroll, not signal. Chunk any large tier into
  // rank-span sub-details reusing the same .gym-tier-section class (so the
  // perf CSS covering the outer sections covers these for free), sized by
  // count rather than a fixed rank cut so this stays correct if the tier's
  // population ever shifts — the S/A/B/C cuts themselves are untouched.
  // Chunking existed to break up a C tier holding 75 of 100 rows. The D/F tail
  // letters now do that properly, so the largest tier is ~26 and chunking it
  // would produce a 25-row section beside a 1-row one — worse than leaving it
  // flat. Kept, but only above a threshold no current tier reaches, so it comes
  // back on its own if a future refresh piles rows into one letter again.
  // A tier this size of closed rows, times a per-row .gym-rank-more, is most
  // of the ~17k elements sitting inert inside closed <details> — see
  // measure-gym-lazy-dom's before/after. Only a force-open tier (S, or every
  // tier once owned-only narrows the pool) builds its rows now; everything
  // else waits for buildLazyGymBody to build it from the same data on first
  // toggle (real toggle event, capture-phase — see app.js).
  const tierSections = tierGroups.map(([tier, rows]) => {
    const forceOpen = ownedOnly || tier === "S";
    const lazyId = `tier|${tier}`;
    const body = lazy && !forceOpen
      ? lazyGymPlaceholder()
      : buildTierSectionBody(tier, rows, forms, ownedSet, lazy, ranking.length);
    return `<details class="gym-tier-section"${forceOpen ? " open" : ""}${lazy && !forceOpen ? ` data-lazy="${escapeHtml(lazyId)}"` : ""}>
      <summary>${tier} tier — ${rows.length} defender${rows.length === 1 ? "" : "s"}</summary>
      ${body}
    </details>`;
  }).join("");

  return `<section class="gym-section" aria-labelledby="gym-lineups-title">
    ${sectionHeading("Coordinated opening", "Starting lineups", "gym-lineups-title")}
    ${shapeTabs}
    <p class="gym-note">Three accounts dropping one each, grouped by which Pokémon leads. Each option
      avoids a single attacking type sweeping the whole set. ${escapeHtml(gym.lineupPolicy?.note ?? "")}
      These are genuinely different things to invest toward, not one answer reshuffled.</p>
    ${gym.lineupLeads?.note ? `<p class="gym-note">${escapeHtml(gym.lineupLeads.note)}</p>` : ""}
    ${lineupCards}
    ${sectionHeading("Computed, not curated", "Defender ranking", "gym-ranking-title")}
    <p class="gym-note">Three related things sit on this page and they answer different questions:
      <strong>rank</strong> is where a defender places among all ${ranking.length} ranked (#1 is
      best); <strong>tier</strong> groups those ranks at real breaks in the score; <strong>band</strong>,
      further down, re-sorts this same pool by one narrower question — like which defender best answers
      a single attacking type — so a Pokémon's band rank can sit far from its overall rank.</p>
    <p class="gym-curated-note">Rank, score and the S/A/B/C tier below — the section headings, not a
      hand grade — are computed over every eligible Pokémon. A dozen rows also carry hand-researched
      notes — a curated tier, placement value, motivation — marked
      <span class="acq-flag">curated</span> where they appear. Those are editorial judgement, not
      output of the model: where a curated tier disagrees with the computed one, trust the computed
      tier for where a Pokémon is grouped and ranked — the curated note is capturing something the
      model can't see (motivation, dodging, how a fight actually plays out), not correcting the score.
      ${curatedDisagreements} of ${curatedRows.length} curated rows disagree with their computed tier
      this way — two independent opinions, not a typo.</p>
    <p class="gym-note">S and A sit on real breaks in the score — big drops with nothing near them on
      either side. Below that, B and C are a reading aid, not a measured boundary: the gaps get small
      and gradual, so a B-tier defender a couple points from the C cutoff is not meaningfully worse,
      just sorted lower.</p>
    <p class="gym-note">${escapeHtml(gym.rankingMethodology ?? "")}</p>
    ${gym.soloCountersMethod ? `<p class="gym-note">Every row's "Best answers" (inside its full-reasoning
      details, below) is computed the same way <span class="acq-flag">computed</span>:
      ${escapeHtml(gym.soloCountersMethod)}</p>` : ""}
    <p class="gym-note">Our S/A/B/C won't line up with every community tier list you've seen
      <span class="acq-flag">not computed</span> — this ranks the full shipped ${ranking.length}, while
      most public tier lists publish 10–16 picks total, so their top tier usually just means
      "made the list," not the same cut this page draws.</p>
    ${defenderRules}
    ${ownedOnlyToggle}
    ${tierSections || `<p class="gym-empty">No ranked defender is marked owned yet. <button type="button" data-gym-owned-only aria-pressed="${ownedOnly}">Show all defenders</button></p>`}
    <p class="gym-note">${escapeHtml(gym.defenderLevelNote ?? "")}</p>
  ${backToTop()}
  </section>`;
}


// Fixed copy for the two bands the score distribution alone can't name (bulk,
// damage); anti-<type> bands are named and worded from the band's own id below
// instead, so a new anti-band ships with correct copy for free.
const BAND_COPY = Object.freeze({
  bulk: {
    title: "Bulk",
    blurb: "Raw survivability — Defense times Stamina, no floor — ignoring how hard it hits back.",
  },
  damage: {
    title: "Damage",
    blurb: "How hard it hits back over a full attack cycle, among defenders sturdy enough to still be standing when it lands — ignoring how well it resists what's attacking it.",
  },
});


function bandThreatType(band) {
  // "anti-fighting" -> "Fighting"
  const type = band.id.replace(/^anti-/, "");
  return type.charAt(0).toUpperCase() + type.slice(1);
}


// Names the threat and states the frailty-by-design tradeoff up front (per
// operator direction) so an anti-band doesn't read as the ranking
// contradicting itself when it leads with something overall buried.
function bandCopy(band) {
  if (band.kind !== "anti") return BAND_COPY[band.id] ?? { title: band.id, blurb: "" };
  const type = bandThreatType(band);
  return {
    title: `Beats ${type} attackers`,
    blurb: `Resists ${type} hard enough to be worth placing against it, ranked by effective HP against ${type} — ignoring bulk against everything else. These are often frail against other types by design: they exist so ${type} alone cannot run the whole line, not to out-survive Blissey.`,
  };
}


function bandRow(row, index, forms, band) {
  return `<li class="gym-band-row"><article class="gym-rank-card">
    <div class="gym-rank-head">
      ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
      <span class="gym-rank-n">#${index + 1}</span>
      <strong>${escapeHtml(row.pokemon)}</strong>
      <span class="gym-rank-score">${row.metric}</span>
    </div>
    <p class="gym-note">Overall #${row.overallRank} · score ${row.overallScore} · ${escapeHtml(row.tier)} tier${
      band.kind === "anti" ? ` · takes x${row.multiplier} damage from ${bandThreatType(band)}` : ""
    }</p>
    ${row.weaknesses?.length ? `<p><strong>Weak to:</strong> ${escapeHtml(row.weaknesses.join(", "))}</p>` : ""}
  </article></li>`;
}


// Every band is a re-sort of the same defender pool by a narrower question
// than Overall — Drifblim is the case: buried past rank 100 overall, it's the
// best Fighting sponge in the game. Stacked closed <details>, not a row of
// tabs: eight one-line summaries solve the density problem on a phone without
// adding a single tap or byte to reaching Overall, which stays exactly where
// it already was, above this section.
function bandRowsHtml(rows, forms, band) {
  return `<ol class="gym-rank-list gym-band-rank-list">${rows.map((row, i) => bandRow(row, i, forms, band)).join("")}</ol>`;
}

function bandSpotlightSection(gym, forms, lazy = false) {
  const bands = gym.bands ?? [];
  if (!bands.length) return "";
  const sections = bands.map((band) => {
    const copy = bandCopy(band);
    const rows = band.rows ?? [];
    const lazyId = `band|${band.id}`;
    const body = lazy ? lazyGymPlaceholder() : bandRowsHtml(rows, forms, band);
    return `<details class="gym-tier-section"${lazy ? ` data-lazy="${escapeHtml(lazyId)}"` : ""}>
      <summary>${escapeHtml(copy.title)} — top ${rows.length}</summary>
      <p class="gym-note">${escapeHtml(copy.blurb)}</p>
      ${body}
    </details>`;
  }).join("");
  return `<section class="gym-section" aria-labelledby="gym-bands-title">
    ${sectionHeading("Same defenders, a narrower question", "Band spotlight", "gym-bands-title")}
    <p class="gym-note">Overall buries a defender whose real strength is one job — outlasting one
      attacking type, or hitting hardest once it's sturdy enough to matter. The #1 pick in a band
      below is often nowhere near the top of Overall — that's what these are for. Open one; Overall
      above is unchanged.</p>
    ${sections}
  ${backToTop()}
  </section>`;
}


// No owned-star button here (unlike renderRankRow above): a shadow form is
// already starrable from Edit Owned Defenders / the normal ranking's own row
// for the same species, and a second interactive star for the same formId
// would double the "own it" tap targets a reader has to reconcile. The
// is-owned class still reflects roster state read-only, for the reader who
// starred it elsewhere.
function shadowMoreBody(row) {
  return `${defenderMoveNumbers(row)}
      ${shadowUpgradeLine(row)}
      ${originLine(row.origin, row.acquisition)}`;
}

function shadowRankRow(row, forms, ownedSet, lazy) {
  const owned = ownedSet.has(row.formId);
  const moreLazyId = `more|shadow|${row.formId}`;
  return `<li class="gym-shadow-row gym-rank-card${owned ? " is-owned" : ""}"><article aria-labelledby="gym-shadow-rank-${row.rank}">
    <div class="gym-rank-head">
      ${spriteHtml(row.formId, forms, row.pokemon, forms?.[row.formId]?.primary_type)}
      <span class="gym-rank-n">#${row.rank}</span>
      <strong id="gym-shadow-rank-${row.rank}">${escapeHtml(row.pokemon)}</strong>
      <span class="gym-rank-score">${row.score}</span>
    </div>
    <p class="gym-moves">${moveLink(row.bestFastMove, { kind: "Fast" })} + ${chargedMoveDisplay(row.bestChargedMove)}</p>
    ${row.weaknesses?.length ? `<p><strong>Weak to:</strong> ${escapeHtml(row.weaknesses.join(", "))}</p>` : ""}
    ${whyLine(row.whyRanked)}
    <details class="gym-rank-more"${lazy ? ` data-lazy="${escapeHtml(moreLazyId)}"` : ""}>
      <summary>Move numbers, origin and Charged TM upgrade</summary>
      ${lazy ? lazyGymPlaceholder() : shadowMoreBody(row)}
    </details>
  </article></li>`;
}


// Its own list, not a filter on Defender ranking above: a caught shadow is
// forced onto Frustration (see shadowUpgradeLine) and every shadow scores
// below the S/A/B cutoffs on that forced moveset, so this population is
// entirely C-tier on the same absolute scale the normal-form ranking uses —
// grouping it into four tier sections like the one above would produce three
// empty headers. The ranking inside is still real: rank 1 here genuinely
// outperforms rank 100 here, on Frustration, even though the letter never
// changes.
function shadowRowsHtml(rows, forms, ownedSet, lazy) {
  return `<ol class="gym-rank-list gym-shadow-rank-list">${rows.map((row) => shadowRankRow(row, forms, ownedSet, lazy)).join("")}</ol>`;
}

function shadowDefenderSection(gym, forms, ownedFormIds = [], lazy = false) {
  const rows = gym.shadowDefenderRanking ?? [];
  if (!rows.length) return "";
  const ownedSet = new Set(ownedFormIds ?? []);
  const body = lazy ? lazyGymPlaceholder() : shadowRowsHtml(rows, forms, ownedSet, lazy);
  return `<section class="gym-section" aria-labelledby="gym-shadow-title">
    ${sectionHeading("A separate population, not a filter", "Shadow defenders", "gym-shadow-title")}
    <p class="gym-note">A caught shadow starts locked to Frustration — the only charged move it has
      until a Charged TM is spent on it, which only happens during a Team GO Rocket takeover event
      <span class="acq-flag">not computed</span>. Ranked on what it can do locked to Frustration, this
      list never borrows a normal form's score: every shadow lands below this ranking's own S/A/B
      cutoffs, so the top ${rows.length} shown here all sit in one C-tier population even where the
      same Pokémon's normal form ranks higher in Defender ranking above. Open a row to see what a
      Charged TM would buy.</p>
    <details class="gym-tier-section"${lazy ? ` data-lazy="shadow"` : ""}>
      <summary>Top ${rows.length} shadow defenders, ranked</summary>
      ${body}
    </details>
  ${backToTop()}
  </section>`;
}


// Rebuilds exactly one deferred section body, keyed by the id a lazy
// <details data-lazy="..."> above was stamped with. Called from app.js's
// capture-phase 'toggle' listener (see bindInteractions) with the current
// gym/forms/roster state — no registry, no closures kept between renders:
// the id plus this data is everything the original render-time call had, so
// this returns byte-identical HTML to what renderGyms({lazy:false}) would
// have produced inline.
export function buildLazyGymBody(lazyId, { gym = {}, forms = {}, ownedFormIds = [], ownedOnly = false } = {}) {
  const ranking = gym.defenderRanking ?? [];
  const ownedSet = new Set(ownedFormIds ?? []);
  const [kind, ...rest] = String(lazyId ?? "").split("|");
  if (kind === "tier") {
    const tier = rest[0];
    const displayRanking = ownedOnly ? ranking.filter((row) => ownedSet.has(row.formId)) : ranking;
    const rows = displayRanking.filter((row) => row.tier === tier);
    return buildTierSectionBody(tier, rows, forms, ownedSet, true, ranking.length);
  }
  if (kind === "band") {
    const bandId = rest.join("|");
    const band = (gym.bands ?? []).find((b) => b.id === bandId);
    return band ? bandRowsHtml(band.rows ?? [], forms, band) : "";
  }
  if (kind === "lead") {
    // Shape rides in the id (not the shared toggle context) — see the comment
    // above lineupCards in lineupSection for why.
    const [shape, leadFormId] = [rest[0], rest.slice(1).join("|")];
    const lineups = (shape === "breaker" ? gym.chainBreakerLineups : gym.startingLineups) ?? [];
    const group = lineups.filter((lineup) => (lineup.lead?.formId ?? lineup.members[0]?.formId) === leadFormId);
    return group.length ? leadOptionsHtml(group, forms) : "";
  }
  if (kind === "shadow") {
    return shadowRowsHtml(gym.shadowDefenderRanking ?? [], forms, ownedSet, true);
  }
  if (kind === "more") {
    const [scope, formId] = rest;
    const source = scope === "shadow" ? (gym.shadowDefenderRanking ?? []) : ranking;
    const row = source.find((r) => r.formId === formId);
    if (!row) return "";
    return scope === "shadow" ? shadowMoreBody(row) : rankMoreBody(row, forms);
  }
  return "";
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
  // Off by default so every existing caller (and every test that reads full
  // page content straight from this function) is unaffected; app.js's real
  // route render opts in. See buildLazyGymBody for the on-demand rebuild.
  lazy = false,
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
    ${lineupSection(gym, forms, lineupShape, ownedFormIds, ownedOnly, lazy)}
    ${bandSpotlightSection(gym, forms, lazy)}
    ${shadowDefenderSection(gym, forms, ownedFormIds, lazy)}
    ${defenseSection(gym, trainerTeam)}
    ${motivationSection()}
    ${ownedDefenderEditor(gym.defenders, ownedFormIds)}`
    : `${offenseSection(gym, forms)}
    ${attackTeamsSection(gym, forms)}
    ${staggerSection(gym)}`;
  return `<div class="gyms-view" id="gym-top">
    <p class="gym-tricks-seed"><a class="safe-escape" href="./#basics/tricks" data-route="basics" data-view="tricks">See gym tricks →</a></p>
    ${tabs}
    ${body}
    ${leaderboardPointerCard()}
  </div>`;
}
