// Dex entry — #dex/<formId>. The noun surface: "what does the app know about
// this Pokémon", aggregated from data every task page already has (see
// docs/dex-route-spec.md). No new math — every section is a lookup into
// gym/pvp/raidTargetTool/raids/acquisitionGuide/currentEggs, joined against
// core.forms for identity. Absence renders as a stated fact ("not ranked"),
// never a blank — see §7 of the spec.
import { escapeHtml, ownedStarButton } from "./home.js";
import { moveLink, displayMoveName } from "./move-sheet.js";
import { spriteHtml } from "../sprites.js";
import { typeChip } from "./types.js";
import { candidateIvsForTier, instanceLevel, legalMoves, solveLevel } from "../instances.js";
import { instanceLeagueRank } from "../pvp-team.js";
import { showcaseEstimate } from "../showcase.js";
// Canonical type-effectiveness table (type-chart.js's own doc comment: "do
// not hand-author a second copy of these tables anywhere else") — same
// source gyms.js/raids.js already derive their own effectiveness math from.
import { resistancesOf, weaknessesOf } from "../type-chart.js";

const LEAGUE_NAMES = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });


function typeChips(form) {
  return [form.primary_type, form.secondary_type].filter(Boolean).map(typeChip).join("");
}


function tagsLine(form) {
  const tags = (form.tags ?? []).filter((tag) => tag !== "shadoweligible");
  if (!tags.length) return "";
  return `<p class="dex-tags">${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</p>`;
}


// dex-identity-sticky: shared marker class for "sprite, №, name, types persistent
// while the entry scrolls" (spec §5 accents; overlaps docs/dex-two-panel-spec.md
// Phase-4, meant to be implemented once and shared with that surface). The
// actual position:sticky rule lives in app.css (css lane), not here.
function identitySection(form, forms) {
  return `<header class="dex-identity dex-identity-sticky">
    ${spriteHtml(form.form_id, forms, form.name, form.primary_type)}
    <div>
      <h2>${escapeHtml(form.name)}</h2>
      <p class="dex-identity-meta">#${escapeHtml(form.dex)} · ${typeChips(form)}</p>
      ${tagsLine(form)}
      ${form.released ? "" : `<p class="dex-unreleased-banner">Not yet released in Pokémon GO.</p>`}
    </div>
  </header>`;
}


function statsSection(form) {
  const bulk = Number(form.base_defense) * Number(form.base_stamina);
  return `<section class="dex-section" aria-labelledby="dex-stats-title">
    <h3 id="dex-stats-title">Base stats</h3>
    <p>Attack ${escapeHtml(form.base_attack)} · Defense ${escapeHtml(form.base_defense)} · Stamina ${escapeHtml(form.base_stamina)} · Bulk ${escapeHtml(bulk.toLocaleString())}</p>
  </section>`;
}


// Compact weak-to/resists chip row (spec item 5), derived straight from
// type-chart.js's own weaknessesOf/resistancesOf — the same canonical table
// gyms.js/raids.js already compute effectiveness from — never a second type
// chart. typeChip is the same span views/types.js's own type-matchup page
// renders, imported once at the top of this file already.
function weaknessRow(rows, emptyLabel) {
  return rows.length
    ? rows.map((row) => typeChip(row.type)).join("")
    : `<span class="dex-weakness-empty">${escapeHtml(emptyLabel)}</span>`;
}

function weaknessSection(form) {
  const weak = weaknessesOf([form.primary_type, form.secondary_type]);
  const resist = resistancesOf([form.primary_type, form.secondary_type]);
  return `<section class="dex-section" aria-labelledby="dex-weakness-title">
    <h3 id="dex-weakness-title">Weak to / Resists</h3>
    <p class="dex-weakness-line"><span class="dex-weakness-kicker">Weak to</span> ${weaknessRow(weak, "No weaknesses")}</p>
    <p class="dex-weakness-line"><span class="dex-weakness-kicker">Resists</span> ${weaknessRow(resist, "No resistances")}</p>
  </section>`;
}


// Regular defenders get the full-pool defenderIndex (every scored form, rank
// order); shadow defenders only ship a top-100 (shadowDefenderRanking) this
// wave — see docs/dex-route-spec.md §3 and the data contract that shipped it.
function gymVerdict(form, gym) {
  if (form.shadow) {
    const ranking = gym.shadowDefenderRanking ?? [];
    const row = ranking.find((entry) => entry.formId === form.form_id);
    return { row, shadowCapped: true, of: ranking.length };
  }
  const indexRow = (gym.defenderIndex ?? []).find((entry) => entry.formId === form.form_id);
  if (!indexRow) return { row: null };
  const row = indexRow.tier ? (gym.defenderRanking ?? []).find((entry) => entry.formId === form.form_id) : null;
  return { row, indexRow, of: (gym.defenderIndex ?? []).length };
}


function bandPlacements(form, gym) {
  return (gym.bands ?? []).flatMap((band) => {
    const row = (band.rows ?? []).find((entry) => entry.formId === form.form_id);
    return row ? [{ band, row }] : [];
  });
}


// Super Max line for eligible mega forms — mechanism from the pinned Game
// Master (level 4 = +2 effective CPM levels, 5,000 Mega Energy unlock).
function superMegaLine(form) {
  if (!form?.super_mega_available) return "";
  return `<p class="dex-super-mega">Super Max available — Mega Level 4 adds +2 effective levels (stacks with Best Buddy; 5,000 Mega Energy to unlock).</p>`;
}

function gymSection(form, gym) {
  if (!gym) return `<section class="dex-section" aria-labelledby="dex-gym-title"><h3 id="dex-gym-title">Gym defense</h3><p class="dex-loading">Loading…</p></section>`;
  const eligible = gym.defenderIndex || gym.shadowDefenderRanking;
  if (!eligible) {
    return `<section class="dex-section" aria-labelledby="dex-gym-title"><h3 id="dex-gym-title">Gym defense</h3><p>Ranking index not in this release.</p></section>`;
  }
  const verdict = gymVerdict(form, gym);
  if (!verdict.row && !verdict.indexRow) {
    const message = verdict.shadowCapped
      ? `Outside the shipped shadow top ${escapeHtml(verdict.of)} — no full shadow ranking ships this release.`
      : "Not ranked as a gym defender in this release.";
    return `<section class="dex-section" aria-labelledby="dex-gym-title"><h3 id="dex-gym-title">Gym defense</h3><p>${message}</p></section>`;
  }
  const { row, indexRow, of } = verdict;
  const rank = row?.rank ?? indexRow?.rank;
  const rankLine = row
    ? `Rank ${escapeHtml(rank)} of ${escapeHtml(of)} · Tier ${escapeHtml(row.tier)} · score ${escapeHtml(row.score)}`
    : `Rank ${escapeHtml(rank)} of ${escapeHtml(of)} — outside the shipped tier bands`;
  const detail = row
    ? `<p>${escapeHtml(row.whyRanked)}</p>
       <p>Best moveset: ${moveLink(row.bestFastMove)} + ${moveLink(row.bestChargedMove)}</p>`
    : "";
  const bands = bandPlacements(form, gym);
  // Defensive framing, matching gyms.js's bandCopy: the raw data title
  // ("Anti-Grass") reads as "good pick AGAINST grass on offense" — operator
  // misread it exactly that way (2026-08-12). These bands answer "which
  // defender do I place when grass ATTACKERS are coming".
  const bandLabel = (band) => (band.kind === "anti" && band.threatType
    ? `Beats ${band.threatType} attackers (resists ${band.threatType} on defense)`
    : band.title);
  const bandLines = bands.length
    ? `<p>${bands.map((placement) => `Placed in <a class="safe-escape" data-route="gyms" data-view="defend" href="./#gyms/defend">${escapeHtml(bandLabel(placement.band))}</a>`).join(" · ")}</p>`
    : "";
  return `<section class="dex-section" aria-labelledby="dex-gym-title">
    <h3 id="dex-gym-title">Gym defense</h3>
    <p>${rankLine}</p>
    ${detail}
    ${bandLines}
  </section>`;
}


// A ranked row's fastMove/chargedMove are the practical, obtainable pick —
// eliteFastTM/eliteChargedTM/eventOnlyFastTM/eventOnlyChargedTM say whether
// even that needs an Elite TM or isn't obtainable via any TM (noObtainableAlternative:
// no other option exists for this type). A communityDayClassic move is never
// scare-labelled — the raid meta assumes every serious player already has it.
function raidMoveBadge(moveId, { kind, elite, eventOnly, availabilityClass }) {
  if (availabilityClass === "communityDayClassic") return moveLink(moveId, { kind });
  if (elite) return moveLink(moveId, { kind, elite: true });
  if (eventOnly) return `${moveLink(moveId, { kind })} <small class="elite-tm">Event-only move</small>`;
  return moveLink(moveId, { kind });
}


function raidAttackerSection(form, raids, raidsLoaded) {
  if (!raidsLoaded) {
    return `<section class="dex-section" aria-labelledby="dex-raid-attacker-title"><h3 id="dex-raid-attacker-title">Raid attacker</h3><p class="dex-loading">Loading…</p></section>`;
  }
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])].filter((row) => row.formId === form.form_id);
  if (!rows.length) {
    return `<section class="dex-section" aria-labelledby="dex-raid-attacker-title"><h3 id="dex-raid-attacker-title">Raid attacker</h3><p>Not a ranked raid attacker in this release.</p></section>`;
  }
  const rowsHtml = rows.map((row) => {
    const cls = row.availabilityClass;
    const fast = raidMoveBadge(row.fastMove, { kind: "Fast", elite: row.eliteFastTM, eventOnly: row.eventOnlyFastTM, availabilityClass: cls });
    const charged = raidMoveBadge(row.chargedMove, { kind: "Charged", elite: row.eliteChargedTM, eventOnly: row.eventOnlyChargedTM, availabilityClass: cls });
    const noAlt = row.noObtainableAlternative
      ? ` <span class="acq-flag">no obtainable alternative</span>` : "";
    return `<li>${escapeHtml(row.attackingType)}: rank ${escapeHtml(row.rank)}, ${escapeHtml(row.investmentTier)} tier — ${fast} + ${charged}${noAlt}</li>`;
  }).join("");
  return `<section class="dex-section" aria-labelledby="dex-raid-attacker-title">
    <h3 id="dex-raid-attacker-title">Raid attacker</h3>
    <ul class="dex-list">${rowsHtml}</ul>
  </section>`;
}


function bossSection(form, raidTargetTool) {
  // No raidTargetTool at all = the raid-targets.json chunk has not landed —
  // show the same honest loading state pvpSection uses instead of silently
  // omitting the section (operator report 2026-08-12: Garchomp's hundo CP
  // "missing" — the data existed; the section vanished without a trace while
  // the chunk was in flight or after its bounded retry gave up).
  if (!raidTargetTool) {
    return `<section class="dex-section" aria-labelledby="dex-boss-title">
    <h3 id="dex-boss-title">As a raid boss</h3><p class="dex-loading">Loading…</p></section>`;
  }
  const target = (raidTargetTool.targets ?? []).find((entry) => entry.bossFormId === form.form_id);
  if (!target) return "";
  return `<section class="dex-section" aria-labelledby="dex-boss-title">
    <h3 id="dex-boss-title">As a raid boss</h3>
    <p>Hundo CP ${escapeHtml(target.normal?.hundoCP)}${target.weatherBoosted?.hundoCP ? ` (${escapeHtml(target.weatherBoosted.hundoCP)} weather-boosted)` : ""}</p>
    <p><a class="safe-escape" href="./?boss=${encodeURIComponent(form.form_id)}#raids">See counters →</a></p>
  </section>`;
}


// This form's saved roster instances — shared by rosterSection (the
// quick-add list) and pvpSection (the per-league "Yours" rank line) so both
// read the exact same owned copies.
function formInstancesFor(form, roster) {
  return (roster.instances ?? []).filter((instance) => instance.formId === form.form_id);
}


// PvP rows ship eliteFastTM/eliteChargedTM as a row-level OR across every
// chargedMoves slot (src/pogo_encyclopedia/pvp.py: any(move in elite_moves)),
// not a per-move flag — and, like raidMoveBadge/eliteMoveLabel above exist to
// fix, raw form.elite_moves membership lumps Community Day classics in with
// genuinely restricted moves (real fixture case: Metagross's Meteor Mash is
// membership-"Elite" but its own researched raid row says
// communityDayClassic). Prefer this form's own researched raid-row
// availabilityClass per move (same lookup eliteMoveLabel does) when one
// exists; fall back to per-move form.elite_moves membership — the same
// source data the row's OR'd flag itself came from, just not collapsed
// across both charged-move slots — when no raid row researches this move.
function pvpMoveBadge(moveId, kind, form, raids) {
  const raidRows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])].filter((row) => row.formId === form.form_id);
  const hit = raidRows.find((row) => row.fastMove === moveId || row.chargedMove === moveId);
  const cls = hit && (hit.fastMove === moveId ? (hit.fastAvailabilityClass ?? hit.availabilityClass) : (hit.chargedAvailabilityClass ?? hit.availabilityClass));
  // eliteOnly ONLY — folding eventOnly in here is the original 96-badge bug
  // (r96 audit) in a new coat: raidMoveBadge checks elite before eventOnly,
  // so the fold made "Event-only move" unreachable and fabricated an Elite TM
  // path for Zacian's Behemoth Blade. Review caught the reintroduction.
  const elite = cls ? cls === "eliteOnly" : (form.elite_moves ?? []).includes(moveId);
  return raidMoveBadge(moveId, { kind, elite, eventOnly: cls === "eventOnly", availabilityClass: cls });
}


// IV code for the "Copy IV code" affordance (spec item 7): default is the
// familiar slash spread ("4/15/14"); the compact variant appends the solved
// level once known, dash-separated so a trailing "L21" doesn't read as a
// fraction ("4-15-14 L21"). Exact level is kept (never truncated/rounded) —
// a half-level build (e.g. L21.5) is a real, distinct build from L21, and
// silently rounding it would misstate what's actually saved. Pure and
// exported: app.js wires the actual clipboard write from this string.
export function formatIvCode(ivs, level = null) {
  const spread = `${ivs.atk}/${ivs.def}/${ivs.sta}`;
  if (level === null || !Number.isFinite(level)) return spread;
  return `${ivs.atk}-${ivs.def}-${ivs.sta} L${level}`;
}


// Poke-Genie-style "where does the exact IV spread you saved stand" line for
// one instance under one league card, from pvp-team.js's own
// instanceLeagueRank (the full-4096-IV-space rank/percentile machinery — no
// second ranking formula invented here). Honest about ineligible instances
// (over the league's CP cap, etc.) rather than silently skipping them.
// delta.percent (how close this exact spread's stat product is to the
// league's published rank-1 build) is the decimal readout; percentile (whole
// number, position across all 4096 spreads) is the fallback when rankOne
// data isn't shipped for this league.
function pvpInstanceRankHtml(form, instance, league, row) {
  const result = instanceLeagueRank(form, instance, league, row);
  if (!result) return "";
  const name = escapeHtml(instance.nickname || form.name);
  if (!result.eligible) {
    return `<p class="dex-pvp-yours dex-pvp-ineligible">${name}: ${escapeHtml(result.reason)}</p>`;
  }
  const percent = result.delta ? result.delta.percent : result.percentile;
  const copyCode = formatIvCode(instance.ivs, result.level);
  return `<p class="dex-pvp-yours">Yours: ${escapeHtml(formatIvCode(instance.ivs))} — ${escapeHtml(percent)}% (CP ${escapeHtml(result.cp)} @ L${escapeHtml(result.level)})
    <button type="button" class="copy-iv-btn" data-copy-nickname="${escapeHtml(copyCode)}">Copy IV code</button></p>`;
}


// One league card: header (rank/tier/role/recommendation), target build
// (rankOne — read from the actual encyclopedia.json shape, not guessed),
// moveset, the caveat line's named checks (one muted line), and a Yours line
// per saved instance. Unranked stays the honest "outside the shipped
// top-150" line — never a fabricated spread.
function pvpLeagueCardHtml(form, league, label, row, raids, formInstances) {
  if (!row) {
    return `<li class="dex-pvp-card dex-pvp-unranked"><h4>${escapeHtml(label)}</h4><p>Outside the shipped top-150 league rankings.</p></li>`;
  }
  const rankOneIvs = row.rankOne?.ivs;
  const targetHtml = rankOneIvs
    ? `<p class="dex-pvp-target">Target build: ${escapeHtml(rankOneIvs.attack)}/${escapeHtml(rankOneIvs.defense)}/${escapeHtml(rankOneIvs.stamina)} IVs — CP ${escapeHtml(row.rankOne.cp)} @ Level ${escapeHtml(row.rankOne.level)}</p>`
    : "";
  const fastBadge = pvpMoveBadge(row.fastMove, "Fast", form, raids);
  const chargedBadges = (row.chargedMoves ?? []).map((moveId) => pvpMoveBadge(moveId, "Charged", form, raids)).join(" + ");
  const yoursHtml = formInstances.map((instance) => pvpInstanceRankHtml(form, instance, league, row)).join("");
  return `<li class="dex-pvp-card">
    <div class="dex-pvp-head">
      <h4>${escapeHtml(label)}</h4>
      <span class="dex-pvp-rank">Rank ${escapeHtml(row.rank)} · ${escapeHtml(row.investmentTier)} tier</span>
      <span class="dex-pvp-role">${escapeHtml(row.primaryRole)} — ${escapeHtml(row.recommendation)}</span>
    </div>
    ${targetHtml}
    <p class="dex-pvp-moves">${fastBadge} + ${chargedBadges}</p>
    ${row.caveat ? `<p class="dex-pvp-caveat">${escapeHtml(row.caveat)}</p>` : ""}
    ${yoursHtml}
  </li>`;
}


function pvpSection(form, pvp, roster, raids) {
  if (!pvp) return `<section class="dex-section" aria-labelledby="dex-pvp-title"><h3 id="dex-pvp-title">PvP</h3><p class="dex-loading">Loading…</p></section>`;
  const formInstances = formInstancesFor(form, roster);
  const cards = Object.entries(LEAGUE_NAMES).map(([league, label]) => {
    const row = (pvp[league] ?? []).find((entry) => entry.formId === form.form_id);
    return pvpLeagueCardHtml(form, league, label, row, raids, formInstances);
  }).join("");
  return `<section class="dex-section" aria-labelledby="dex-pvp-title">
    <h3 id="dex-pvp-title">PvP</h3>
    <ul class="dex-list dex-pvp-cards">${cards}</ul>
  </section>`;
}


// event_only_moves (PvPoke's legacyMoves) are moves this form can never get
// via any TM, Elite included — a stricter claim than eliteIds, so it gets its
// own badge rather than reusing moveLink's "Elite TM" wording.
function moveList(moveIds, eliteIds, eventOnlyIds, kind) {
  return moveIds.map((moveId) => (eliteIds.has(moveId)
    ? `<li>${moveLink(moveId, { elite: true, kind })}</li>`
    : eventOnlyIds.has(moveId)
      ? `<li>${moveLink(moveId, { kind })} <small class="elite-tm">Event-only move</small></li>`
      : `<li>${moveLink(moveId, { kind })}</li>`)).join("");
}


function movesSection(form) {
  const elite = new Set(form.elite_moves ?? []);
  const eventOnly = new Set(form.event_only_moves ?? []);
  return `<section class="dex-section" aria-labelledby="dex-moves-title">
    <h3 id="dex-moves-title">Moves</h3>
    <p>Fast</p>
    <ul class="dex-list">${moveList(form.fast_moves ?? [], elite, eventOnly, "Fast")}</ul>
    <p>Charged</p>
    <ul class="dex-list">${moveList(form.charged_moves ?? [], elite, eventOnly, "Charged")}</ul>
  </section>`;
}


function evolvesFrom(form, forms) {
  return Object.values(forms).find((candidate) => (candidate.evolves_to ?? []).some((step) => step.formId === form.form_id));
}


// Walk formId -> formId -> ... to the chain's ROOT (spec item 2), following
// evolvesFrom() upward, summing each step's candyCost along the way (spec
// item 3: acquisitionSection's "total candy to reach this form"). Regional
// lines (Alolan etc.) stay on their own chain for free here: evolves_to/
// evolvesFrom are keyed by exact form_id (evolution.py's regional-line
// fix), so an Alolan form's parent lookup can only ever land on another
// Alolan form_id, never the mainland line.
function evolutionAcquisition(form, forms) {
  let current = form;
  let totalCandy = 0;
  // Cycle guard: curated data has no evolution cycles, but a bad record
  // (A ⇄ B) must degrade to a truncated chain, never a hung page.
  const visited = new Set([current.form_id]);
  let parent = evolvesFrom(current, forms);
  while (parent && !visited.has(parent.form_id)) {
    visited.add(parent.form_id);
    const step = (parent.evolves_to ?? []).find((candidate) => candidate.formId === current.form_id);
    totalCandy += step?.candyCost ?? 0;
    current = parent;
    parent = evolvesFrom(current, forms);
  }
  return { root: current, totalCandy };
}


// Full downward tree from `form`, following every evolves_to step
// (branching evolutions keep every branch — Eevee ships 8). candyCost is
// the cost to reach THIS node from its parent (undefined at the root).
// visited: same cycle guard as evolutionAcquisition — a bad cyclic record
// truncates instead of recursing forever.
function evolutionTree(form, forms, candyCost, visited = new Set()) {
  visited.add(form.form_id);
  return {
    form,
    candyCost,
    children: (form.evolves_to ?? [])
      .filter((step) => forms[step.formId] && !visited.has(step.formId))
      .map((step) => evolutionTree(forms[step.formId], forms, step.candyCost, visited)),
  };
}


// Branch cards cap (spec: "cap rendering sanely and say how") — Eevee's 8
// eeveelutions would otherwise blow out the entry; same "+N more" pattern
// OFFENSE_ROLE_CAP already uses further down this file.
const EVOLUTION_BRANCH_CAP = 4;

function evolutionNodeLabel(form, currentFormId) {
  return form.form_id === currentFormId
    ? `<b class="dex-evolution-current">${escapeHtml(form.name)}</b>`
    : `<a class="safe-escape" data-route="dex" href="./#dex/${encodeURIComponent(form.form_id)}">${escapeHtml(form.name)}</a>`;
}

// Linear stretches render as one inline arrow chain ("Bagon → 25 →
// Shelgon → 100 → Salamence" — spec's own example); a branch point (2+
// evolves_to, e.g. Eevee) switches to a list so branches read as branches,
// never flattened into one misleading arrow line.
function evolutionChainHtml(node, currentFormId) {
  const label = evolutionNodeLabel(node.form, currentFormId);
  if (!node.children.length) return label;
  if (node.children.length === 1) {
    const [child] = node.children;
    return `${label} → ${escapeHtml(child.candyCost)} → ${evolutionChainHtml(child, currentFormId)}`;
  }
  const shown = node.children.slice(0, EVOLUTION_BRANCH_CAP);
  const more = node.children.length - shown.length;
  const branches = shown.map((child) => `<li>${escapeHtml(child.candyCost)} → ${evolutionChainHtml(child, currentFormId)}</li>`).join("");
  const moreLine = more > 0 ? `<li class="dex-evolution-more">+${escapeHtml(more)} more evolution${more === 1 ? "" : "s"}</li>` : "";
  return `${label}<ul class="dex-evolution-branches">${branches}${moreLine}</ul>`;
}


function evolutionSection(form, forms) {
  const { root } = evolutionAcquisition(form, forms);
  const isStandalone = root.form_id === form.form_id && !(form.evolves_to ?? []).length;
  if (isStandalone) return "";
  const tree = evolutionTree(root, forms);
  return `<section class="dex-section" aria-labelledby="dex-evolution-title">
    <h3 id="dex-evolution-title">Evolution</h3>
    <p class="dex-evolution-chain">${evolutionChainHtml(tree, form.form_id)}</p>
  </section>`;
}


// Clarity re-lead (spec item 3): with the chain known (evolutionAcquisition,
// shared with evolutionSection above), lead with the actionable version —
// which form you actually obtain (the chain root, usually a wild spawn/egg,
// never something you evolve into) and the total candy to walk that chain
// up to THIS entry. Root === this form (a base Pokémon, or one with no
// evolves_to) needs no candy line — you already obtain it directly.
function acquisitionLeadLine(form, forms) {
  const { root, totalCandy } = evolutionAcquisition(form, forms);
  if (root.form_id === form.form_id) return "";
  const candyLine = totalCandy > 0 ? ` — ${escapeHtml(totalCandy)} total Candy to reach ${escapeHtml(form.name)}` : "";
  return `<p class="dex-acquisition-lead">You obtain <b>${escapeHtml(root.name)}</b>${candyLine}.</p>`;
}


// Buddy km is earn-RATE after ownership, not a bare stat (operator
// correction, spec item 4): candy per walk cycle, and — once mega-evolved,
// for species that ever get a mega/primal form — Mega Energy at that same
// distance. hasMegaSibling is the same species-level check
// megaLevelFieldHtml further down this file already uses. No new data.
function buddyDistanceLine(form, forms) {
  if (!Number.isFinite(form.buddy_distance_km)) return "";
  const megaNote = hasMegaSibling(form, forms) ? " · earns Mega Energy at the same distance once mega-evolved" : "";
  return `<p>Buddy: 1 candy per ${escapeHtml(form.buddy_distance_km)} km walked${megaNote}</p>`;
}


function acquisitionSection(form, acquisitionGuide, forms) {
  const leadLine = acquisitionLeadLine(form, forms);
  if (!acquisitionGuide) {
    return `<section class="dex-section" aria-labelledby="dex-acquisition-title">
      <h3 id="dex-acquisition-title">Acquisition</h3>
      ${leadLine}
      <p class="dex-loading">Loading…</p>
    </section>`;
  }
  const itemEntry = (acquisitionGuide.items?.entries ?? []).find((entry) => (entry.neededBy ?? []).some((row) => row.formId === form.form_id));
  const itemLine = itemEntry
    ? `<p>Needs ${escapeHtml(itemEntry.item)} to evolve into${itemEntry.confidence === "handResearched" ? ` <span class="acq-flag">hand-researched</span>` : ""}.</p>`
    : "";
  const buddyLine = buddyDistanceLine(form, forms);
  if (!leadLine && !itemLine && !buddyLine) return "";
  return `<section class="dex-section" aria-labelledby="dex-acquisition-title">
    <h3 id="dex-acquisition-title">Acquisition</h3>
    ${leadLine}
    ${itemLine}
    ${buddyLine}
  </section>`;
}


function availabilitySection(form, currentEggs) {
  if (!currentEggs) return "";
  const egg = (currentEggs.eggs ?? []).find((entry) => entry.formId === form.form_id);
  if (!egg) return "";
  return `<section class="dex-section" aria-labelledby="dex-availability-title">
    <h3 id="dex-availability-title">Current availability</h3>
    <p>In the current ${escapeHtml(egg.eggType)} egg pool${egg.canBeShiny ? " · shiny-eligible" : ""}.</p>
  </section>`;
}


// ── I2: quick-add + optimal moves ───────────────────────────────────────
// Mockup: docs/mockups/delight-2026-08-11/I2-entry-quickadd.html (final
// revision). This is a pure render extension — all state (the in-progress
// draft, editingId, remove-confirm, the one-shot save/update stamp) is owned
// by the caller (app.js) and passed in as `quickAdd`; dex.js only computes
// derived values (level, candidates, optimal pairs, moves-diff) from it, the
// same "props in, HTML out" shape the rest of this file already uses.
//
// Chunk caveat (spec §2): the offense pair comes from `raids` and the
// defense pair from `gym` — both already flow into renderDex() today (see
// raidAttackerSection/gymSection above); raids.json is loaded outside
// ROUTE_CHUNKS.dex by app.js's dex-route raids fetch (app.js, "Home's
// roster-gap teaser... need raids.json"), so no new chunk registration is
// needed here.

// Blank quick-add/edit draft. chargedMoves is a fixed 2-slot array (slot 0 =
// select 1, slot 1 = select 2/optional) so each <select> maps to a stable
// slot, matching the mockup's contract. `stamp` is transient UI-only
// ("Saved"/"Updated" one-shot text keyed to an instance id) — it must never
// be written onto a persisted instance object (that would leak into backups).
export function blankQuickAddDraft() {
  return {
    cp: "", ivs: { atk: null, def: null, sta: null }, fastMove: null, chargedMoves: [null, null],
    editingId: null, removeConfirmPending: false, stamp: null, megaLevel: null,
    // Shiny/Lucky (feature 1): same flat-draft, mirror-megaLevel shape —
    // booleans, never null, so the checkbox's own `checked` state always has
    // a definite value to render from.
    isShiny: false, isLucky: false,
    // sizeClass/buddyLevel (round 15 fields, storage.js/instances.js already
    // accept them): same null-default enum shape as megaLevel above.
    // heightM/weightKg mirror `cp` above — raw typed string, parsed at save
    // time. canDynamax/canGigantamax mirror isShiny/isLucky — booleans.
    sizeClass: null, buddyLevel: null, heightM: "", weightKg: "",
    canDynamax: false, canGigantamax: false,
  };
}


function draftIvsComplete(ivs) {
  return [ivs?.atk, ivs?.def, ivs?.sta].every((value) => Number.isInteger(value) && value >= 0 && value <= 15);
}


function displayMoveList(moveIds) {
  return (moveIds ?? []).map(displayMoveName).map(escapeHtml).join(" / ");
}


// Elite-TM-honest cost phrase for one move slot (mockup's tmPhrase, I2-entry-
// quickadd.html:514-517 — "Meteor Mash is not 'a Charged TM' away, it is an
// Elite Charged TM away"). This is a cost/obtainability rule, not the CD
// scare-label exception raidMoveBadge() applies to the badge — a Community
// Day move still needs a real Elite TM to relearn once missed.
function moveCostPhrase(kind, elite, eventOnly) {
  if (eventOnly) return "not obtainable by any TM — event distribution only";
  if (elite) return `an Elite ${kind} TM`;
  return `a ${kind} TM`;
}


// Elite/CD-classic label for a move the instance already holds (defect fix
// below): "a Community Day move" when THIS FORM's own raid row researched
// that availabilityClass for it. The class is curated per form_id (see
// data/curated/move-availability.json), not intrinsic to the move id alone —
// 22 moves ship a different class on different forms (e.g. BRUTAL_SWING is
// Hydreigon's own communityDayClassic headline charged move, but a plain
// eliteOnly pick on Absol, which never gets its own raid row for it). Scanning
// ANY row carrying the move id (regardless of formId) borrows a stranger
// form's researched class — same seam gyms.js's moveWithElite avoids by
// working off one already-form-scoped row. Falls back to the generic "Elite
// TM move" label when this form has no row researching the class.
function eliteMoveLabel(moveId, form, raids) {
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])].filter((row) => row.formId === form.form_id);
  const hit = rows.find((row) => row.fastMove === moveId || row.chargedMove === moveId);
  const cls = hit && (hit.fastMove === moveId ? (hit.fastAvailabilityClass ?? hit.availabilityClass) : (hit.chargedAvailabilityClass ?? hit.availabilityClass));
  return cls === "communityDayClassic" ? "a Community Day move" : "an Elite TM move";
}


// Multi-role optimal offense (operator design, supersedes single-headline
// bestRaidRow): every ranked attacking-type role for this form, ordered by
// super-effective DPS (each row's own dps.superEffective) — DPS is the axis
// that answers "which of my ranked types should I actually bring", where rank
// only compares within one type's own field (Salamence: Dragon DPS 45.8 but
// rank #14, vs Dark DPS 35.8 at rank #10 — rank order would show Dark first).
function offenseRoles(form, raids) {
  return [...(raids?.regular ?? []), ...(raids?.shadow ?? [])]
    .filter((row) => row.formId === form.form_id)
    .sort((a, b) => (b.dps?.superEffective ?? 0) - (a.dps?.superEffective ?? 0));
}

// Offense role cards cap at 3 (spec: "cap 3 rows + '+N more roles'") so the
// block stays bounded for forms ranked across many attacking types.
const OFFENSE_ROLE_CAP = 3;

// Second charge-slot suggestion (operator, 2026-08-13: "pokedex isn't
// suggesting secondary move"). The raid rows' own secondChargedMove field is
// a shipped stub ("Not needed" on all 270 rows) — the honest sources are:
// another ranked offense role's charged move (real coverage data), else the
// form's PvP-recommended charged pair partner (labeled as such). Null when
// neither exists — the second slot is optional and no suggestion beats a
// fabricated one.
function secondChargeSuggestion(form, roles, pvp) {
  const primary = roles[0];
  if (!primary) return null;
  const other = roles.find((row) => row.chargedMove && row.chargedMove !== primary.chargedMove);
  if (other) return { move: other.chargedMove, why: `${other.attackingType} coverage — its own ranked role` };
  const LEAGUE_LABEL = { master: "Master League", ultra: "Ultra League", great: "Great League" };
  for (const league of ["master", "ultra", "great"]) {
    const row = (pvp?.[league] ?? []).find((entry) => entry.formId === form.form_id);
    const partner = (row?.chargedMoves ?? []).find((move) => move && move !== primary.chargedMove);
    if (partner) return { move: partner, why: `PvP-recommended pair (${LEAGUE_LABEL[league]})` };
  }
  return null;
}


function raidHonorableMentions(form, raids) {
  return (raids?.honorableMentions ?? []).filter((row) => row.formId === form.form_id);
}


// One line per shipped honourable-mention row (see raids.js's own
// honorableMentions() — same field, condensed here since the full Raid
// attacker section below already carries the long form). This is the
// REQUIRED Regieleki case: a type this form isn't ranked for at all on an
// obtainable moveset, but would be with a restricted move spent.
function offenseEliteLines(form, raids) {
  return raidHonorableMentions(form, raids).map((row) => {
    const move = escapeHtml(displayMoveName(row.restrictedMove));
    const cost = row.availabilityClass === "eventOnly" ? "not obtainable by any TM — event distribution only" : "needs an Elite TM";
    return `<p class="optimal-yours-line">With ${move} (${escapeHtml(row.restrictedSlot)} move, ${cost}): would rank <b>#${escapeHtml(row.rankIfUsed)}</b> as a ${escapeHtml(row.attackingType)} attacker.</p>`;
  }).join("");
}


// Condensed one-line form of gyms.js's own eliteUpgradeLine() (same shipped
// row.eliteCharged field — see gyms.js for the full with/without table this
// mirrors). Not imported directly: gyms.js belongs to another lane, and the
// Optimal block wants a terser one-liner here regardless (spec §2 "one-line
// whys").
function defenseEliteLine(row) {
  const elite = row?.eliteCharged;
  if (!elite?.move) return "";
  const communityDay = elite.availabilityClass === "communityDayClassic";
  const label = communityDay ? "Community Day move" : "Elite TM option";
  const gain = Number(elite.gainPct);
  const gainText = Number.isFinite(gain) ? `, +${escapeHtml(gain)}% score` : "";
  const rankText = elite.tier === row.tier
    ? `stays ${escapeHtml(row.tier)} tier (rank ${escapeHtml(row.rank)} → ${escapeHtml(elite.rank)})`
    : `moves to ${escapeHtml(elite.tier)} tier (rank ${escapeHtml(row.rank)} → ${escapeHtml(elite.rank)})`;
  return `<p class="optimal-yours-line">${escapeHtml(label)}: ${moveLink(elite.move, { kind: "Charged", elite: !communityDay })} — ${rankText}${gainText}.</p>`;
}


// Diffs one saved instance's moves against this form's shipped offense data.
// Checks the honourable-mention (Elite) pairs FIRST: an instance that already
// carries a restricted move is diffed on its real, already-spent capability
// (rankIfUsed as that attacking type), never told to go "back" to the merely
// obtainable headline pair — spec's REQUIRED Regieleki rule. Then checks
// EVERY ranked role (multi-role offense, spec item 2): the instance's pair
// might be its strongest set, or a weaker-but-still-ranked role it happens to
// run — "matches whichever role it runs", not just the DPS-strongest one.
// Only once neither matches does it fall back to the "needs X" branch below,
// which compares against the strongest role (roles[0]) the way the old
// single-headline diff always did.
function instanceOffenseDiff(form, instance, roles, mentionRows, raids) {
  const name = escapeHtml(instance.nickname || form.name);
  if (!instance.fastMove || !instance.chargedMoves?.length) {
    return { html: `${name}: moves not set — use the form below to add them.`, optimal: false };
  }
  for (const row of mentionRows) {
    const pairFast = row.restrictedFastMove;
    const pairCharged = row.restrictedChargedMove;
    if (instance.fastMove === pairFast && instance.chargedMoves.includes(pairCharged)) {
      return {
        html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)} — <b>ranks #${escapeHtml(row.rankIfUsed)} as a ${escapeHtml(row.attackingType)} attacker</b> (the restricted move is already spent).`,
        optimal: true,
      };
    }
  }
  if (!roles.length) return { html: `${name}: not a ranked raid attacker to compare against.`, optimal: false };
  const matchedIndex = roles.findIndex((row) => instance.fastMove === row.fastMove && instance.chargedMoves.includes(row.chargedMove));
  if (matchedIndex !== -1) {
    const row = roles[matchedIndex];
    if (matchedIndex === 0) {
      return {
        html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${escapeHtml(displayMoveName(row.chargedMove))} — <b>already optimal for ${escapeHtml(row.attackingType.toLowerCase())} offense</b>.`,
        optimal: true,
      };
    }
    const strongest = roles[0];
    return {
      html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${escapeHtml(displayMoveName(row.chargedMove))} — <b>optimal for its ${escapeHtml(row.attackingType)} role (rank #${escapeHtml(row.rank)})</b> — its strongest set is ${escapeHtml(strongest.attackingType)} (${escapeHtml(displayMoveName(strongest.fastMove))} + ${escapeHtml(displayMoveName(strongest.chargedMove))}).`,
      optimal: true,
    };
  }
  const headlineRow = roles[0];
  const fastOk = instance.fastMove === headlineRow.fastMove;
  const chargedOk = instance.chargedMoves.includes(headlineRow.chargedMove);
  const heldEliteCharged = instance.chargedMoves.find((moveId) => (form.elite_moves ?? []).includes(moveId)) ?? null;
  const trade = heldEliteCharged
    ? ` — this trades away an Elite-TM move you already have, which can't be re-earned without spending another one`
    : "";
  if (fastOk || chargedOk) {
    const missingKind = fastOk ? "Charged" : "Fast";
    const missingMove = fastOk ? headlineRow.chargedMove : headlineRow.fastMove;
    // DEFECT FIX (operator's live Cinderace report): the inverted Regieleki
    // case — the instance's held charged move is elite/CD-flagged and is
    // NOT the headline optimal (the optimal is a plain move that merely
    // ranks higher) — must never read as a neutral "a Charged TM away"
    // swap. Replacing an elite-flagged move loses it (re-obtainable only via
    // another Elite TM), so this is a tradeoff statement, not a plain "needs
    // X" line.
    if (missingKind === "Charged" && heldEliteCharged) {
      const heldName = escapeHtml(displayMoveName(heldEliteCharged));
      const optimalName = escapeHtml(displayMoveName(missingMove));
      return {
        html: `${name} runs ${heldName} — ${eliteMoveLabel(heldEliteCharged, form, raids)}. ${optimalName} ranks higher in this model, but a TM that replaces ${heldName} costs an Elite TM to undo. Your call.`,
        optimal: false,
      };
    }
    const cost = moveCostPhrase(missingKind, fastOk ? headlineRow.eliteChargedTM : headlineRow.eliteFastTM, fastOk ? headlineRow.eventOnlyChargedTM : headlineRow.eventOnlyFastTM);
    return {
      html: `${name} has the right ${fastOk ? "fast" : "charged"} move — <span class="needs">${cost} away</span> from ${escapeHtml(displayMoveName(missingMove))}.`,
      optimal: false,
    };
  }
  const fastCost = moveCostPhrase("Fast", headlineRow.eliteFastTM, headlineRow.eventOnlyFastTM);
  const chargedCost = moveCostPhrase("Charged", headlineRow.eliteChargedTM, headlineRow.eventOnlyChargedTM);
  return {
    html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)} — <span class="needs">needs ${escapeHtml(displayMoveName(headlineRow.fastMove))} + ${escapeHtml(displayMoveName(headlineRow.chargedMove))}</span> (${fastCost} and ${chargedCost})${trade}.`,
    optimal: false,
  };
}


// Same shape as instanceOffenseDiff, for the single (untyped) gym-defense
// pair. Gym rows don't carry a per-bestMove eliteXTM flag the way raid rows
// do, so the cost phrase falls back to the form-level elite_moves/
// event_only_moves sets — the same source movesSection() above already uses.
function instanceDefenseDiff(form, instance, defenseRow) {
  const name = escapeHtml(instance.nickname || form.name);
  if (!instance.fastMove || !instance.chargedMoves?.length) {
    return { html: `${name}: moves not set — use the form below to add them.`, optimal: false };
  }
  if (!defenseRow) return { html: `${name}: not a ranked gym defender to compare against.`, optimal: false };
  const fastOk = instance.fastMove === defenseRow.bestFastMove;
  const chargedOk = instance.chargedMoves.includes(defenseRow.bestChargedMove);
  if (fastOk && chargedOk) {
    return {
      html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${escapeHtml(displayMoveName(defenseRow.bestChargedMove))} — <b>already optimal for gym defense</b>.`,
      optimal: true,
    };
  }
  const eliteMoves = form.elite_moves ?? [];
  const eventOnlyMoves = form.event_only_moves ?? [];
  const costFor = (moveId, kind) => (eventOnlyMoves.includes(moveId)
    ? "not obtainable by any TM — event distribution only"
    : eliteMoves.includes(moveId) ? `an Elite ${kind} TM` : `a ${kind} TM`);
  const hasEliteCharged = instance.chargedMoves.some((moveId) => eliteMoves.includes(moveId));
  const trade = hasEliteCharged
    ? ` — this trades away an Elite-TM move you already have, which can't be re-earned without spending another one`
    : "";
  if (fastOk || chargedOk) {
    const missingKind = fastOk ? "Charged" : "Fast";
    const missingMove = fastOk ? defenseRow.bestChargedMove : defenseRow.bestFastMove;
    return {
      html: `${name} has the right ${fastOk ? "fast" : "charged"} move — <span class="needs">${costFor(missingMove, missingKind)} away</span> from ${escapeHtml(displayMoveName(missingMove))}${missingKind === "Charged" ? trade : ""}.`,
      optimal: false,
    };
  }
  return {
    html: `${name} knows ${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)} — <span class="needs">needs ${escapeHtml(displayMoveName(defenseRow.bestFastMove))} + ${escapeHtml(displayMoveName(defenseRow.bestChargedMove))}</span> (${costFor(defenseRow.bestFastMove, "Fast")} and ${costFor(defenseRow.bestChargedMove, "Charged")})${trade}.`,
    optimal: false,
  };
}


function optimalYoursHtml(formInstances, diffFn) {
  if (!formInstances.length) return `<p class="optimal-yours-line hint">No saved instance yet — add one below to see how it compares.</p>`;
  return formInstances.map((instance) => {
    const diff = diffFn(instance);
    return `<p class="optimal-yours-line${diff.optimal ? " is-optimal" : ""}">${diff.html}</p>`;
  }).join("");
}


// One role card: moveset, rank, DPS, availability badges (spec item 2). The
// strongest (DPS-first) card gets the "its strongest set" callout so the
// your-moves diff's cross-reference ("its strongest set is Dragon…") has a
// visible anchor on the page, not just prose.
function offenseRoleCardHtml(row, isStrongest) {
  const cls = row.availabilityClass;
  const fast = raidMoveBadge(row.fastMove, { kind: "Fast", elite: row.eliteFastTM, eventOnly: row.eventOnlyFastTM, availabilityClass: cls });
  const charged = raidMoveBadge(row.chargedMove, { kind: "Charged", elite: row.eliteChargedTM, eventOnly: row.eventOnlyChargedTM, availabilityClass: cls });
  const dps = row.dps?.superEffective;
  const dpsLine = Number.isFinite(dps)
    ? `<p class="optimal-dps">${escapeHtml(dps.toFixed(1))} SE DPS${isStrongest ? ` <span class="optimal-strongest-badge">its strongest set</span>` : ""}</p>`
    : "";
  return `<div class="optimal-role" data-role-type="${escapeHtml(row.attackingType)}">
    <div class="optimal-head"><span class="optimal-kind">Offense · ${escapeHtml(row.attackingType)}</span><span class="optimal-rank">Rank ${escapeHtml(row.rank)} · ${escapeHtml(row.investmentTier)} tier</span></div>
    <p class="optimal-moves">${fast} + ${charged}</p>
    ${dpsLine}
    <p class="optimal-why">${escapeHtml(row.whyRanked)}</p>
  </div>`;
}


// Optimal block: offense (raids, multi-role — spec item 2) + defense pair
// (gyms, stays single) with one-line whys and availability badges, above the
// flat Raid attacker/Gym defense lists further down the page (spec §2 item
// 3).
function optimalBlockHtml(form, gym, raids, raidsLoaded, formInstances, pvp) {
  const roles = raidsLoaded ? offenseRoles(form, raids) : [];
  const shownRoles = roles.slice(0, OFFENSE_ROLE_CAP);
  const moreRoles = roles.length - shownRoles.length;
  const mentionRows = raidsLoaded ? raidHonorableMentions(form, raids) : [];
  const secondCharge = raidsLoaded ? secondChargeSuggestion(form, roles, pvp) : null;
  const secondChargeLine = secondCharge
    ? `<p class="optimal-second-charge">Second slot: ${moveLink(secondCharge.move)} — ${escapeHtml(secondCharge.why)}.${Number.isFinite(form.third_move_cost) ? ` Unlock cost: ${escapeHtml(form.third_move_cost.toLocaleString("en-US"))} dust.` : ""}</p>`
    : "";
  const offenseBody = !raidsLoaded
    ? `<div class="optimal-head"><span class="optimal-kind">Offense</span></div><p class="dex-loading">Loading…</p>`
    : shownRoles.length
      ? shownRoles.map((row, index) => offenseRoleCardHtml(row, index === 0)).join("")
        + secondChargeLine
        + (moreRoles > 0 ? `<p class="optimal-more-roles">+${escapeHtml(moreRoles)} more role${moreRoles === 1 ? "" : "s"}</p>` : "")
      : `<div class="optimal-head"><span class="optimal-kind">Offense</span></div><p class="optimal-why">Not a ranked raid attacker in this release.</p>`;
  const offenseYours = `${raidsLoaded ? offenseEliteLines(form, raids) : ""}${optimalYoursHtml(formInstances, (instance) => instanceOffenseDiff(form, instance, roles, mentionRows, raids))}`;

  let defenseRow = null;
  let defenseOf = null;
  if (gym) {
    const verdict = gymVerdict(form, gym);
    defenseRow = verdict.row ?? null;
    defenseOf = verdict.of;
  }
  const defenseBody = !gym
    ? `<div class="optimal-head"><span class="optimal-kind">Defense · Gym</span></div><p class="dex-loading">Loading…</p>`
    : defenseRow
      ? `<div class="optimal-head"><span class="optimal-kind">Defense · Gym</span><span class="optimal-rank">Rank ${escapeHtml(defenseRow.rank)} of ${escapeHtml(defenseOf)} · ${escapeHtml(defenseRow.tier)} tier</span></div>
        <p class="optimal-moves">${moveLink(defenseRow.bestFastMove)} + ${moveLink(defenseRow.bestChargedMove)}</p>
        <p class="optimal-why">${escapeHtml(defenseRow.whyRanked)}</p>`
      : `<div class="optimal-head"><span class="optimal-kind">Defense · Gym</span></div><p class="optimal-why">Not ranked as a gym defender in this release.</p>`;
  const defenseYours = `${defenseEliteLine(defenseRow)}${optimalYoursHtml(formInstances, (instance) => instanceDefenseDiff(form, instance, defenseRow))}`;

  return `<h3 id="dex-optimal-title" class="section-title">Optimal</h3>
    <div class="optimal-block">
      <div class="optimal-row" data-kind="offense">${offenseBody}<div class="optimal-yours">${offenseYours}</div></div>
      <div class="optimal-row" data-kind="defense">${defenseBody}<div class="optimal-yours">${defenseYours}</div></div>
    </div>`;
}


// Top-level Optimal section (spec item 5 reorder) — same optimalBlockHtml
// content as before, now its own dex-section between the weakness row and
// Gym defense instead of living inside Your roster, so it renders whether
// or not the operator ever scrolls to the roster/quick-add card below.
function optimalSection(form, gym, raids, raidsLoaded, formInstances, pvp) {
  return `<section class="dex-section" aria-labelledby="dex-optimal-title">
    ${optimalBlockHtml(form, gym, raids, raidsLoaded, formInstances, pvp)}
  </section>`;
}


// Pressable IV bar (feature 3): a native range replaces the old decorative
// 16-tick readout with one continuous 44px-tall touch target — 44x44 is the
// WCAG 2.5.5 minimum target size, and 16 individual tick slivers per stat (48
// across all three) each fell well under it. The <select> stays as the
// picker-wheel path (spec §1); range and select both write draft.ivs[key], so
// each render leaves them showing the same value — the actual bidirectional
// sync (range "input" -> draft, select "change" -> draft) is app.js wiring,
// out of this lane. aria-labelledby points at the same <label id> the
// <select>'s `for` targets, so both controls share one accessible name
// instead of each getting their own.
function ivRangeHtml(labelId, key, value) {
  const rangeId = `iv-range-${key}`;
  // ponytail: a range input has no "unset" value; blank draft state renders
  // as 0 (rather than skipping the control), matching the select's own
  // fallback once a stat is actually touched. aria-valuetext still says
  // "not set" so a screen reader doesn't report a false 0 IV.
  const rangeValue = value ?? 0;
  return `<input type="range" id="${rangeId}" class="iv-range" min="0" max="15" step="1" value="${rangeValue}" data-iv-range data-stat="${key}" aria-labelledby="${labelId}" aria-valuetext="${value === null ? "not set" : value}">`;
}


// Native <select> per stat — opens the platform picker wheel on iOS (spec §1
// "bounded choices are native <select>").
function ivFieldHtml(label, key, value) {
  const id = `iv-select-${key}`;
  const labelId = `iv-field-label-${key}`;
  const options = [`<option value=""${value === null ? " selected" : ""}>—</option>`];
  for (let v = 0; v <= 15; v += 1) options.push(`<option value="${v}"${v === value ? " selected" : ""}>${v}</option>`);
  return `<div class="iv-field">
    <label id="${labelId}" class="iv-field-label" for="${id}">${escapeHtml(label)}</label>
    <div class="iv-field-row">
      <select id="${id}" class="iv-select" data-iv-select data-stat="${key}">${options.join("")}</select>
      ${ivRangeHtml(labelId, key, value)}
    </div></div>`;
}


// Option text for a native <select> — plain text, so tags compress into a
// short suffix (kept under ~34 chars). Availability (Elite TM / event-only)
// always keeps its words; when a move is ALSO the shipped-optimal pick for
// this form it compresses to a glyph so both facts fit on one line (spec §2
// item 3 / §5). elite_moves/event_only_moves are the same form-level fields
// movesSection() above already reads.
function moveOptionLabel(moveId, kind, form, offensePair, defensePair) {
  const name = displayMoveName(moveId);
  const elite = (form.elite_moves ?? []).includes(moveId);
  const eventOnly = (form.event_only_moves ?? []).includes(moveId);
  const offenseMatch = kind === "fast" ? moveId === offensePair?.fastMove : moveId === offensePair?.chargedMove;
  const defenseMatch = kind === "fast" ? moveId === defensePair?.fastMove : moveId === defensePair?.chargedMove;
  let suffix = "";
  if (eventOnly) suffix = " — Event-only";
  else if (elite && (offenseMatch || defenseMatch)) suffix = ` — ${offenseMatch ? "⚔" : "🛡"} · Elite TM`;
  else if (elite) suffix = " — Elite TM";
  else if (offenseMatch) suffix = " — ⚔ optimal offense";
  else if (defenseMatch) suffix = " — 🛡 optimal defense";
  return name + suffix;
}


// Native <option> is text-only, so the selected move is echoed beside the
// control as a real styled chip (full visual treatment options can't carry).
function moveEchoChip(moveId, form) {
  if (!moveId) return "";
  const elite = (form.elite_moves ?? []).includes(moveId) ? ` <span class="elite-note">Elite TM</span>` : "";
  return `<span class="move-chip is-selected move-chip-echo">${escapeHtml(displayMoveName(moveId))}</span>${elite}`;
}


function moveFieldHtml({ id, label, dataSlot, kind, moveIds, selectedValue, noneLabel, form, offensePair, defensePair }) {
  const optionsHtml = [`<option value=""${!selectedValue ? " selected" : ""}>${escapeHtml(noneLabel)}</option>`]
    .concat(moveIds.map((moveId) => `<option value="${moveId}"${moveId === selectedValue ? " selected" : ""}>${escapeHtml(moveOptionLabel(moveId, kind, form, offensePair, defensePair))}</option>`))
    .join("");
  return `<div class="move-field">
    <label class="move-field-label" for="${id}">${escapeHtml(label)}</label>
    <div class="move-field-row">
      <select id="${id}" class="move-select" data-move-select="${dataSlot}">${optionsHtml}</select>
      <span class="move-echo">${moveEchoChip(selectedValue, form)}</span>
    </div></div>`;
}


function quickAddTitleHtml(form, formInstances, editingId) {
  const target = editingId === null ? null : formInstances.find((instance) => instance.id === editingId);
  if (!target) return `<p class="quickadd-title">Add an instance — quick</p>`;
  const label = target.nickname ? escapeHtml(target.nickname) : `CP ${escapeHtml(target.cp)} — ${target.ivs.atk}/${target.ivs.def}/${target.ivs.sta}`;
  return `<p class="quickadd-title is-editing-title">Editing ${label}</p>`;
}


// Remove only exists once you're inside the edit context (never on the row
// itself), and its own confirm is inline — no browser confirm() dialog
// (spec §2 item 5).
function quickAddActionsHtml(editingId, removeConfirmPending, canSave) {
  if (editingId !== null && removeConfirmPending) {
    return `<div class="quickadd-confirm-remove">
      <p class="verdict-bad" role="alert">Remove this instance from your roster? This can't be undone.</p>
      <div class="quickadd-actions">
        <button type="button" data-action="confirm-remove">Remove instance</button>
        <button type="button" data-action="cancel-remove">Keep it</button>
      </div></div>`;
  }
  if (editingId !== null) {
    return `<div class="quickadd-actions">
        <button type="button" data-action="save-instance"${canSave ? "" : " disabled"}>Update</button>
        <button type="button" data-action="cancel-edit">Cancel</button>
      </div>
      <div class="quickadd-actions quickadd-actions-remove">
        <button type="button" data-action="remove-instance">Remove</button>
      </div>`;
  }
  return `<div class="quickadd-actions"><button type="button" data-action="save-instance"${canSave ? "" : " disabled"}>Save to roster</button></div>`;
}


// Mega/Primal sibling detection (feature 4): same dex number as this form,
// any OTHER form_id in this release containing "mega" or "primal" — the way
// sibling forms are actually keyed here (0006-mega-x/0006-mega-y share dex 6
// with 0006-normal; 0383-primal shares dex 383 with 0383-normal). Not
// form.tags: this release's primal forms carry a "mega" tag, not "primal"
// (0382-primal's tags are ["legendary","mega"]) — tags can't tell the two
// families apart here, formId can.
function hasMegaSibling(form, forms) {
  if (!form?.dex) return false;
  return Object.values(forms ?? {}).some((candidate) => (
    candidate.form_id !== form.form_id
    && candidate.dex === form.dex
    && /mega|primal/i.test(candidate.form_id)
  ));
}


// Mega Evolution unlocks in tiers as Mega Energy accumulates (Base/High/Max),
// not a single on/off flip — so this is a bounded-choice native <select>
// (spec §1 "bounded choices are native <select>"), same picker-wheel win on
// iOS as ivFieldHtml above, not a checkbox. Empty value = "Not unlocked".
const MEGA_LEVELS = Object.freeze([
  { value: "", label: "Not unlocked" },
  { value: "base", label: "Base" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
  { value: "supermax", label: "Super Max (+2 levels)" },
]);


// Capability, not state: a mega/primal form is a temporary in-battle
// transformation the player triggers, not something a caught Pokémon
// permanently "is" — so this reads "Mega level" (how far it's unlocked),
// never "Is Mega". Rendered only for species with an actual mega/primal
// sibling this release; most forms never show this control. data-mega-level
// is this lane's own attribute (mirrors data-iv-select/data-iv-range) — the
// select wiring and the megaLevel round-trip through the draft live in
// app.js, out of this lane.
function megaLevelFieldHtml(form, forms, level) {
  if (!hasMegaSibling(form, forms)) return "";
  const value = level ?? "";
  const options = MEGA_LEVELS.map(({ value: v, label }) => `<option value="${v}"${v === value ? " selected" : ""}>${label}</option>`).join("");
  return `<div class="mega-level-field">
    <label class="mega-level-field-label" for="mega-level-select">Mega level</label>
    <select id="mega-level-select" class="mega-level-select" data-mega-level>${options}</select>
  </div>`;
}


// Shiny/Lucky quick-add toggles (feature 1, operator report): the grid's
// long-press sheet already has these; quick-add didn't. Native checkboxes
// (not the instance sheet's own click-toggle buttons — data-instance-shiny-
// toggle/data-instance-lucky-toggle — those belong to a separate modal, out
// of this lane) in the same field-row shape as megaLevelFieldHtml just
// above: a label + control pair, always rendered (unlike Mega level, every
// form can be shiny/lucky). Nickname deliberately stays out — quick-add
// stays quick; the instance sheet ("Shiny, lucky, nickname & more →") has
// it.
function shinyLuckyFieldHtml(draft) {
  return `<div class="shiny-lucky-field">
    <label class="shiny-lucky-option"><input type="checkbox" data-quickadd-shiny${draft.isShiny ? " checked" : ""}> Shiny</label>
    <label class="shiny-lucky-option"><input type="checkbox" data-quickadd-lucky${draft.isLucky ? " checked" : ""}> Lucky</label>
  </div>`;
}


// Size class (operator report, round 15): the in-game appraisal's XXS-XXL
// size tier — bounded choices, so a native <select> picker wheel, same
// family as megaLevelFieldHtml/MEGA_LEVELS above. Also the input the
// showcase-score estimate's XXL bonus reads (showcase.js). Empty value =
// "Not set" — most saved instances never had their size tier recorded.
const SIZE_CLASSES = Object.freeze([
  { value: "", label: "Not set" },
  { value: "xxs", label: "XXS" },
  { value: "xs", label: "XS" },
  { value: "avg", label: "Average" },
  { value: "xl", label: "XL" },
  { value: "xxl", label: "XXL" },
]);

function sizeClassLabel(value) {
  return SIZE_CLASSES.find((entry) => entry.value === value)?.label ?? value;
}

function sizeClassFieldHtml(value) {
  const selected = value ?? "";
  const options = SIZE_CLASSES.map(({ value: v, label }) => `<option value="${v}"${v === selected ? " selected" : ""}>${label}</option>`).join("");
  return `<div class="size-class-field">
    <label class="size-class-field-label" for="size-class-select">Size (XXS-XXL)</label>
    <select id="size-class-select" class="size-class-select" data-size-class>${options}</select>
  </div>`;
}


// Buddy adventure level — same bounded-choice <select> shape as size class
// above. Feeds the "best-buddy evaluates at its boosted level" PvP rank
// display (out of this lane; see dex.js's file-header dependency note).
const BUDDY_LEVELS = Object.freeze([
  { value: "", label: "Not set" },
  { value: "good", label: "Good Buddy" },
  { value: "great", label: "Great Buddy" },
  { value: "ultra", label: "Ultra Buddy" },
  { value: "best", label: "Best Buddy" },
]);

function buddyLevelFieldHtml(value) {
  const selected = value ?? "";
  const options = BUDDY_LEVELS.map(({ value: v, label }) => `<option value="${v}"${v === selected ? " selected" : ""}>${label}</option>`).join("");
  return `<div class="buddy-level-field">
    <label class="buddy-level-field-label" for="buddy-level-select">Buddy level</label>
    <select id="buddy-level-select" class="buddy-level-select" data-buddy-level>${options}</select>
  </div>`;
}


// Observed height/weight (m/kg) — the showcase-score estimate's raw inputs
// (showcase.js). Same numeric-text-field pattern as the CP field above
// (type="text" + inputmode, no spinner). "decimal" (not "numeric") opens the
// keypad with a decimal point, since these are never whole numbers in
// practice (0.84m, 16.54kg).
function sizeMeasurementFieldHtml(draft) {
  const heightM = draft.heightM ?? "";
  const weightKg = draft.weightKg ?? "";
  return `<label class="height-input">Height (m)<input type="text" inputmode="decimal" autocomplete="off" data-height-input value="${escapeHtml(heightM)}"></label>
    <label class="weight-input">Weight (kg)<input type="text" inputmode="decimal" autocomplete="off" data-weight-input value="${escapeHtml(weightKg)}"></label>`;
}


// Dynamax/Gigantamax capability toggles (operator report). This release's
// frozen Game Master ships no per-form Dynamax/Gigantamax capability field
// (verified: no such key anywhere in src/pogo_encyclopedia's PokemonForm or
// the assemble pipeline) — so these render for EVERY form, ungated, rather
// than fabricating a capability check the data doesn't back. Upgrade path:
// gate on form.canDynamax if/when the pipeline ever ships one. Same native-
// checkbox field-row family as shinyLuckyFieldHtml above.
function dynamaxFieldHtml(draft) {
  return `<div class="dynamax-field">
    <label class="dynamax-option"><input type="checkbox" data-quickadd-dynamax${draft.canDynamax ? " checked" : ""}> Can Dynamax</label>
    <label class="dynamax-option"><input type="checkbox" data-quickadd-gigantamax${draft.canGigantamax ? " checked" : ""}> Can Gigantamax</label>
  </div>`;
}


function quickAddBodyHtml(form, draft, offensePairs, defensePair, forms) {
  // Move-select glyphs ("⚔ optimal offense", spec §5) mark against the
  // single strongest role only — the dropdown option text has no room to
  // name which of several roles a move belongs to, and the strongest set is
  // the one card the offense block gives visible pride of place to.
  const offensePair = offensePairs[0] ?? null;
  const cp = draft.cp ?? "";
  const cpNumber = Number(cp);
  const validCp = Number.isInteger(cpNumber) && cpNumber > 0;
  const ivs = draft.ivs ?? { atk: null, def: null, sta: null };
  const ivsComplete = draftIvsComplete(ivs);

  let levelHint = "";
  let canSave = false;
  if (validCp && ivsComplete) {
    const level = solveLevel(form, ivs, cpNumber);
    if (level !== null) {
      levelHint = `<p class="verdict-good"><span class="number-roll">Level ${escapeHtml(level)}</span> at CP ${escapeHtml(cpNumber)}.</p>`;
      canSave = true;
    } else {
      levelHint = `<p class="verdict-bad" role="alert">No level produces CP ${escapeHtml(cpNumber)} with ${ivs.atk}/${ivs.def}/${ivs.sta} IVs — check the CP or the bars.</p>`;
    }
  } else if (validCp && !ivsComplete) {
    // CP-only path: candidateIvsForTier already enumerates every atk/def/sta
    // combo (0-15 each) whose sum falls in a range and reproduces the given
    // CP (see instances.js) — {min:0,max:45} covers the whole IV-sum space,
    // so this is the "CP alone, no tier known" case with no new solver code.
    const candidates = candidateIvsForTier(form, cpNumber, { min: 0, max: 45 }, { limit: 10 });
    levelHint = candidates.length
      ? `<p class="hint">CP ${escapeHtml(cpNumber)} alone narrows to at least ${candidates.length}${candidates.length === 10 ? "+" : ""} possible IV combo${candidates.length === 1 ? "" : "s"} — narrow it with the bars above, or tap a match:</p>
        <div class="candidate-row">${candidates.map((c) => `<button type="button" class="candidate-chip" data-candidate-fill="${c.atk},${c.def},${c.sta}">${c.atk}/${c.def}/${c.sta}</button>`).join("")}</div>`
      : `<p class="hint">No IV combination (0-15 each) reaches CP ${escapeHtml(cpNumber)} at any level for ${escapeHtml(form.name)} — double-check the CP.</p>`;
  }

  // type="text" + inputmode="numeric" + pattern="[0-9]*" opens the numeric
  // keypad on iOS/Android without type="number"'s spinner/scroll-to-increment
  // behavior (spec §1 CP field rule).
  const cpFieldHtml = `<label class="cp-input">CP<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-cp-input value="${escapeHtml(cp)}"></label>
    <p class="cp-caption-chip">Opens numeric keypad on device</p>`;

  // Hundo button (feature 2): one tap to 15/15/15, same one-tap family as
  // "Use optimal" below. Reuses the existing data-candidate-fill wiring
  // (app.js already sets qa.ivs to whatever "atk,def,sta" the attribute
  // carries — see the CP-only candidate chips above) rather than inventing a
  // second attribute/handler for the same "set all three IVs" action. The
  // typed CP still gets solved against 15/15/15 on the next render via the
  // same levelHint logic above, so this doubles as an honest hundo checker.
  // "Use optimal" is per-role for offense (spec item 2: "Use Dragon set /
  // Use Dark set") — one button per shown role card, same
  // data-use-optimal-fast/-charged attribute contract as before. Defense
  // stays a single button (spec: "Defense stays single").
  const useOptimalHtml = `<div class="explore-row use-optimal-row">
    <button type="button" class="explore-chip" data-candidate-fill="15,15,15">Hundo (15/15/15)</button>
    ${offensePairs.map((pair) => `<button type="button" class="explore-chip" data-use-optimal="offense" data-use-optimal-fast="${escapeHtml(pair.fastMove)}" data-use-optimal-charged="${escapeHtml(pair.chargedMove)}"${pair.charged2 ? ` data-use-optimal-charged2="${escapeHtml(pair.charged2)}"` : ""}>Use ${escapeHtml(pair.type)} set</button>`).join("")}
    ${defensePair ? `<button type="button" class="explore-chip" data-use-optimal="defense" data-use-optimal-fast="${escapeHtml(defensePair.fastMove)}" data-use-optimal-charged="${escapeHtml(defensePair.chargedMove)}">Use optimal (defense)</button>` : ""}
    </div>`;

  const legal = legalMoves(form);
  const fastFieldHtml = moveFieldHtml({
    id: "fast-move-select", label: "Fast move", dataSlot: "fast", kind: "fast",
    moveIds: legal.fastMoves, selectedValue: draft.fastMove, noneLabel: "— choose —", form, offensePair, defensePair,
  });
  const charged1FieldHtml = moveFieldHtml({
    id: "charged-move-select-1", label: "Charged move 1", dataSlot: "charged1", kind: "charged",
    moveIds: legal.chargedMoves, selectedValue: draft.chargedMoves?.[0] ?? null, noneLabel: "— choose —", form, offensePair, defensePair,
  });
  // Slot 2 excludes whatever slot 1 already holds (the game won't let a
  // Pokémon carry the same charged move twice) and defaults to "— none —"
  // since a second charged move is optional in-game.
  const charged2Options = legal.chargedMoves.filter((moveId) => moveId !== draft.chargedMoves?.[0]);
  const charged2FieldHtml = moveFieldHtml({
    id: "charged-move-select-2", label: "Charged move 2 (optional — not required in-game)", dataSlot: "charged2", kind: "charged",
    moveIds: charged2Options, selectedValue: draft.chargedMoves?.[1] ?? null, noneLabel: "— none —", form, offensePair, defensePair,
  });

  return cpFieldHtml
    + ivFieldHtml("Attack", "atk", ivs.atk)
    + ivFieldHtml("Defense", "def", ivs.def)
    + ivFieldHtml("HP", "sta", ivs.sta)
    + levelHint
    + megaLevelFieldHtml(form, forms, draft.megaLevel)
    + shinyLuckyFieldHtml(draft)
    + sizeClassFieldHtml(draft.sizeClass)
    + sizeMeasurementFieldHtml(draft)
    + buddyLevelFieldHtml(draft.buddyLevel)
    + dynamaxFieldHtml(draft)
    + `<p class="quickadd-moves-title">Moves</p>`
    + useOptimalHtml
    + fastFieldHtml + charged1FieldHtml + charged2FieldHtml
    + quickAddActionsHtml(draft.editingId, Boolean(draft.removeConfirmPending), canSave);
}


// Row + Edit button share one edit trigger, but only when NOT already the
// instance being edited — re-tapping the held row mid-edit would silently
// discard in-progress form changes back to the saved values (mockup fix,
// ported). Keyed by instance.id, never by stats — the REQUIRED twins case:
// two identical-stat instances get two independent rows/ids here.
function quickAddInstanceRowHtml(form, instance, editingId, stamp) {
  const level = instanceLevel(form, instance);
  const movesLine = instance.fastMove
    ? `${escapeHtml(displayMoveName(instance.fastMove))} + ${displayMoveList(instance.chargedMoves)}`
    : `<span class="instance-moves-missing">Moves not set</span>`;
  const isEditing = instance.id === editingId;
  const showStamp = stamp && stamp.instanceId === instance.id;
  const editAttr = isEditing ? "" : ` data-edit-instance="${escapeHtml(instance.id)}"`;
  // Size badge (round 15): only rendered when a size tier was actually
  // recorded — reuses .acq-flag, the existing provenance-pill convention
  // (see acquisitionSection's "hand-researched" flag), not a new class.
  const sizeBadge = instance.sizeClass
    ? ` <span class="acq-flag">${escapeHtml(sizeClassLabel(instance.sizeClass))}</span>` : "";
  // Showcase estimate line: only when both the observed height/weight AND
  // this form's frozen-source baseline exist — showcaseEstimate() itself is
  // the single honesty gate (see showcase.js), never a second null-check
  // duplicating its logic here.
  const estimate = showcaseEstimate(form, instance);
  const showcaseLine = estimate
    ? `<p class="dex-showcase-estimate">Showcase estimate: ${escapeHtml(estimate.label)}</p>` : "";
  return `<li class="instance-row${isEditing ? " is-editing" : ""}"${editAttr}>
    ${showStamp ? `<span class="saved-stamp">${escapeHtml(stamp.text)}</span>` : ""}
    <h4>${escapeHtml(instance.nickname || form.name)}${sizeBadge}</h4>
    <p>CP ${escapeHtml(instance.cp)} · ${escapeHtml(instance.ivs.atk)}/${escapeHtml(instance.ivs.def)}/${escapeHtml(instance.ivs.sta)} IV${level !== null ? ` · Level ${escapeHtml(level)}` : ""}</p>
    ${showcaseLine}
    <p>${movesLine}</p>
    <button type="button" class="instance-edit-btn"${editAttr}${isEditing ? " disabled" : ""}>${isEditing ? "Editing…" : "Edit"}</button>
    <button type="button" class="instance-remove-btn" data-delete-instance-id="${escapeHtml(instance.id)}">Remove</button>
  </li>`;
}


// ── I3: OCR bulk-intake — scan entry point + review UI ──────────────────
// Mockup: docs/mockups/delight-2026-08-11/I3-ocr-bulk-intake.html (reference
// behaviour, not portable code — its picker/queue/done screens are folded
// into the simpler state machine below). Parsing itself lives in
// ocr-intake.js (parseMonScreenText/draftFromParse); this file only renders
// whatever state the caller (app.js) hands it — same "props in, HTML out"
// shape as the quick-add card above. The app lane owns dispatch: every
// interactive element here is a bare data-attribute hook, never a bound
// handler.
//
// State shape (`state` arg to ocrIntakeSectionHtml, and blankOcrIntakeState's
// return value):
//   {
//     status: 'idle' | 'loading-engine' | 'scanning' | 'review' | 'error',
//     progress: { done, total } | null,
//     rows: [{ id, imageLabel, parsed, draft, issues, accepted }],
//     errorNote: string | null,
//   }
// Per row: `parsed` is ocr-intake.js's parseMonScreenText() result (or null
// before parsing runs) — { name, formId, cp, hp, weightKg, heightM,
// confidence, issues }. `draft` is draftFromParse(parsed) merged into
// blankQuickAddDraft() by the caller — { cp, heightM, weightKg, nickname }.
// `issues` is the row's own copy of parsed.issues, rendered verbatim, never
// paraphrased. `accepted` flips true once the row's draft has been saved to
// the roster.
export function blankOcrIntakeState() {
  return { status: "idle", progress: null, rows: [], errorNote: null };
}

const OCR_ENGINE_DOWNLOAD_COPY = "First use downloads the OCR engine (~7MB, one-time).";
const OCR_ROW_DEGRADE_COPY = "Couldn't read — enter manually.";
const OCR_ERROR_FALLBACK_COPY = "Scanning didn't work this time. Use the manual quick-add form below to add this Pokémon instead.";

// The entry point: a labelled button (sets the one-time-download
// expectation up front, honesty register) plus the file picker it opens.
// Wired via data attributes only — data-action="ocr-scan-open" (button),
// data-ocr-file-input (the <input>) — app.js owns the click/change handlers.
function ocrScanEntryHtml() {
  return `<div class="ocr-scan-entry">
    <button type="button" class="ocr-scan-btn" data-action="ocr-scan-open">
      <span class="ocr-scan-btn-title">Scan screenshots</span>
      <span class="ocr-scan-btn-hint">${escapeHtml(OCR_ENGINE_DOWNLOAD_COPY)}</span>
    </button>
    <input type="file" accept="image/*" multiple hidden class="ocr-file-input" data-ocr-file-input>
  </div>`;
}

function ocrProgressHtml(progress) {
  if (!progress) return "";
  return ` <span class="ocr-intake-progress">(${escapeHtml(progress.done)}/${escapeHtml(progress.total)})</span>`;
}

function ocrRowFieldsHtml(parsed) {
  const name = parsed?.name ?? null;
  const cp = parsed?.cp ?? null;
  const heightM = parsed?.heightM ?? null;
  const weightKg = parsed?.weightKg ?? null;
  return `<p class="ocr-row-fields">
    <span class="ocr-row-field">Name: ${name ? escapeHtml(name) : "—"}</span>
    <span class="ocr-row-field">CP: ${cp != null ? escapeHtml(cp) : "—"}</span>
    <span class="ocr-row-field">Height: ${heightM != null ? `${escapeHtml(heightM)} m` : "—"}</span>
    <span class="ocr-row-field">Weight: ${weightKg != null ? `${escapeHtml(weightKg)} kg` : "—"}</span>
  </p>`;
}

function ocrRowIssuesHtml(issues) {
  if (!issues || !issues.length) return "";
  return `<ul class="ocr-row-issues">${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`;
}

// A row degrades to the honest "couldn't read" note (never a retry loop —
// the caller doesn't re-run OCR on a row, only re-scanning the whole batch)
// when parsing came back with nothing to anchor a draft on: no matched
// species and no CP. Partial reads (e.g. CP but no name) still show the
// parsed-fields grid so the operator can see what DID come through.
function ocrIntakeRowHtml(row) {
  const parsed = row.parsed ?? null;
  const unreadable = !parsed || (!parsed.name && parsed.cp == null);
  const classes = `ocr-intake-row${row.accepted ? " is-accepted" : ""}${unreadable ? " is-unreadable" : ""}`;
  // A button that silently does nothing is a dead button (operator hit both,
  // 2026-08-12): Accept requires a saveable draft (species + complete IVs,
  // the same gate app.js enforces), Edit requires a matched species to open
  // its quick-add sheet. Anything short of that renders the honest next step
  // as prose instead of a no-op control.
  const ivs = row.draft?.ivs ?? {};
  const ivsComplete = [ivs.atk, ivs.def, ivs.sta]
    .every((value) => Number.isInteger(value) && value >= 0 && value <= 15);
  const canEdit = Boolean(parsed?.formId);
  const canAccept = canEdit && ivsComplete;
  // CP+HP solve results (app.js applyOcrIvSolve): a unique spread renders as
  // fact with its derivation named; 2-8 spreads render as one-tap chips.
  const solvedLine = row.solvedIvs
    ? `<p class="ocr-row-solved">IVs ${escapeHtml(row.solvedIvs.ivs.atk)}/${escapeHtml(row.solvedIvs.ivs.def)}/${escapeHtml(row.solvedIvs.ivs.sta)}${row.solvedIvs.level ? ` · Level ${escapeHtml(row.solvedIvs.level)}` : ""} — solved from CP + HP</p>`
    : "";
  const readCharged = Array.isArray(row.draft?.chargedMoves) ? row.draft.chargedMoves.filter(Boolean) : [];
  const movesReadLine = row.draft?.fastMove && readCharged.length
    ? `<p class="ocr-row-solved">Moves read: ${escapeHtml(displayMoveName(row.draft.fastMove))} + ${readCharged.map((move) => escapeHtml(displayMoveName(move))).join(" / ")}</p>`
    : "";
  const ivChips = !row.solvedIvs && row.ivCandidates?.length
    ? `<p class="ocr-row-next">CP + HP narrow to ${row.ivCandidates.length} possible IV spreads — pick one:</p>
      <div class="ocr-row-actions ocr-row-candidates">${row.ivCandidates.map((combo) => `<button type="button" class="ocr-row-pick-btn" data-ocr-row-set-ivs="${escapeHtml(row.id)}" data-ocr-ivs="${escapeHtml(`${combo.ivs.atk},${combo.ivs.def},${combo.ivs.sta}`)}">${escapeHtml(`${combo.ivs.atk}/${combo.ivs.def}/${combo.ivs.sta}`)}</button>`).join("")}</div>`
    : "";
  let actions = "";
  if (!row.accepted) {
    if (canEdit) {
      actions = `<div class="ocr-row-actions">
      ${canAccept ? `<button type="button" class="ocr-row-accept-btn" data-ocr-row-accept="${escapeHtml(row.id)}">Accept</button>` : ""}
      <button type="button" class="ocr-row-edit-btn" data-ocr-row-edit="${escapeHtml(row.id)}">Edit</button>
    </div>${canAccept ? "" : `<p class="ocr-row-next">Needs IVs — Edit opens the quick-add form to finish.</p>`}`;
    } else if (parsed?.candidates?.length) {
      // The parser's own shortlist (form family or closest names) as one-tap
      // picks — operator hit a row with "pick manually" and nothing to tap.
      actions = `<div class="ocr-row-actions ocr-row-candidates">
      ${parsed.candidates.map((candidate) => `<button type="button" class="ocr-row-pick-btn" data-ocr-row-pick="${escapeHtml(row.id)}" data-ocr-pick-form-id="${escapeHtml(candidate.formId)}">${escapeHtml(candidate.name)}</button>`).join("")}
    </div>`;
    } else {
      actions = `<p class="ocr-row-next">Pick the Pokémon from the grid below, then use its quick-add form.</p>`;
    }
  }
  return `<li class="${classes}" data-ocr-row-id="${escapeHtml(row.id)}">
    <p class="ocr-row-label">${escapeHtml(row.imageLabel)}</p>
    ${row.accepted ? `<span class="ocr-row-status is-accepted">Added to roster</span>` : ""}
    ${unreadable ? `<p class="ocr-row-degrade">${escapeHtml(OCR_ROW_DEGRADE_COPY)}</p>` : ocrRowFieldsHtml(parsed)}
    ${solvedLine}
    ${movesReadLine}
    ${ivChips}
    ${ocrRowIssuesHtml(row.issues)}
    ${actions}
    ${row.rawText ? `<details class="ocr-row-raw"><summary>What the scanner saw</summary><button type="button" class="ocr-row-copy-raw" data-action="ocr-copy-raw" data-ocr-raw-row-id="${escapeHtml(row.id)}">Copy raw text</button><pre>${escapeHtml(row.rawText)}</pre></details>` : ""}
  </li>`;
}

function ocrIntakeBodyHtml(state) {
  if (state.status === "idle") return ocrScanEntryHtml();
  if (state.status === "loading-engine") {
    return `<p class="ocr-intake-status">Downloading the OCR engine…${ocrProgressHtml(state.progress)}</p>`;
  }
  if (state.status === "scanning") {
    return `<p class="ocr-intake-status">Scanning screenshots…${ocrProgressHtml(state.progress)}</p>`;
  }
  if (state.status === "review") {
    const rows = state.rows ?? [];
    // Without a reset the Scan entry (idle-only) never reappears until page
    // reload — reviewer catch, 2026-08-12. Error status stays reset-free by
    // design (no retry loop); review is a completed pass, so returning to
    // idle for another batch is the normal flow, not a retry.
    return `<ul class="ocr-intake-rows">${rows.map(ocrIntakeRowHtml).join("")}</ul>
      <button type="button" class="ocr-scan-done-btn" data-action="ocr-scan-done">Done — scan more</button>`;
  }
  // 'error': the same-session fallback notice, pointing at the manual
  // quick-add form directly below in this same section — never a retry
  // button (the honest ceiling: v1 doesn't diagnose why OCR failed).
  return `<div class="ocr-intake-error">
    ${state.errorNote ? `<p class="ocr-error-note">${escapeHtml(state.errorNote)}</p>` : ""}
    <p class="ocr-error-fallback">${escapeHtml(OCR_ERROR_FALLBACK_COPY)}</p>
  </div>`;
}

// Render entry point for the whole I3 surface — called from yourRosterSection
// next to the existing (I2) quick-add card. `state` is owned by the caller;
// see blankOcrIntakeState() above for its shape and default.
export function ocrIntakeSectionHtml(state) {
  const s = state ?? blankOcrIntakeState();
  return `<div class="ocr-intake-section" data-ocr-status="${escapeHtml(s.status)}">${ocrIntakeBodyHtml(s)}</div>`;
}


// "Your roster" — the quick-add/edit card, roster list, and its own links.
// Renamed from rosterSection (spec item 5 reorder split the Optimal block
// out into its own top-level optimalSection() above, which used to open
// this same section).
function yourRosterSection(form, roster, quickAdd, raids, raidsLoaded, gym, forms, ocrIntake, pvp) {
  const owned = new Set(roster.ownedFormIds ?? []);
  const isOwned = owned.has(form.form_id);
  const formInstances = formInstancesFor(form, roster);
  const draft = quickAdd ?? blankQuickAddDraft();
  const roles = raidsLoaded ? offenseRoles(form, raids) : [];
  const defenseRow = gym ? (gymVerdict(form, gym).row ?? null) : null;
  const qaSecondCharge = raidsLoaded ? secondChargeSuggestion(form, roles, pvp) : null;
  const offensePairs = roles.slice(0, OFFENSE_ROLE_CAP).map((row) => ({
    type: row.attackingType, fastMove: row.fastMove, chargedMove: row.chargedMove,
    charged2: qaSecondCharge && qaSecondCharge.move !== row.chargedMove ? qaSecondCharge.move : null,
  }));
  const defensePair = defenseRow ? { fastMove: defenseRow.bestFastMove, chargedMove: defenseRow.bestChargedMove } : null;

  return `<section class="dex-section" aria-labelledby="dex-roster-title">
    <h3 id="dex-roster-title" class="section-title">Your roster</h3>
    <p>${ownedStarButton({ formId: form.form_id, name: form.name, owned: isOwned, route: "dex" })}</p>
    <p class="roster-summary"><span class="roster-star">★</span> ${escapeHtml(formInstances.length)} instance${formInstances.length === 1 ? "" : "s"} logged</p>
    <ul class="instance-list">${formInstances.map((instance) => quickAddInstanceRowHtml(form, instance, draft.editingId, draft.stamp)).join("")}</ul>
    ${ocrIntakeSectionHtml(ocrIntake)}
    <div class="quickadd-card${draft.editingId !== null ? " is-editing-card" : ""}">
      ${quickAddTitleHtml(form, formInstances, draft.editingId)}
      ${quickAddBodyHtml(form, draft, offensePairs, defensePair, forms)}
    </div>
    <p><button type="button" class="dex-instance-link" data-open-instance-sheet-form-id="${escapeHtml(form.form_id)}">Shiny, lucky, nickname &amp; more →</button></p>
    <p class="dex-backup-pointer"><a class="safe-escape" data-route="more" data-view="about" href="./#more/about">Back up your roster (full-device backup) →</a></p>
  </section>`;
}


// Reuses the exact global-search markup home.js renders — bindSearch() binds
// to it by attribute, not id, so wiring it here (see app.js's dex renderer)
// works the same way. A shared link to a form renamed/removed in a later
// release should fail legibly, not bounce to Home.
function unknownFormShell(formId) {
  return `<div class="more-view dex-view">
    <a class="safe-escape" href="./#more/collection" data-route="more" data-view="collection">Back to Collection</a>
    <section class="more-section" aria-labelledby="dex-unknown-title">
      <p class="status-kicker">Dex entry</p>
      <h2 id="dex-unknown-title">No entry for "${escapeHtml(formId)}" in this release</h2>
      <p>It may have been renamed or removed in a later data update.</p>
    </section>
    <form class="fallback-section" role="search" data-global-search>
      <label for="global-search">Search Pokémon, move, type, or raid boss</label>
      <input id="global-search" name="q" type="search" autocomplete="off">
      <div class="search-recents" data-search-recents></div>
      <div data-search-results></div>
    </form>
  </div>`;
}


export function renderDex({
  formId,
  forms = {},
  gym = null,
  pvp = null,
  raidTargetTool = null,
  raids = null,
  raidsLoaded = false,
  acquisitionGuide = null,
  currentEggs = null,
  roster = { ownedFormIds: [], ownedFormCounts: {}, instances: [] },
  // In-progress quick-add/edit draft (see blankQuickAddDraft()) — owned and
  // mutated by the caller (app.js), null/omitted renders a blank "add" form.
  quickAdd = null,
  // I3 OCR bulk-intake state (see blankOcrIntakeState()) — owned and mutated
  // by the caller (app.js), null/omitted renders the idle entry point.
  ocrIntake = null,
} = {}) {
  const form = forms[formId];
  if (!form) return unknownFormShell(formId);
  // Section order (spec item 5): identity/stats first, then the hundo/boss
  // CP block and the weakness row (both quick "what am I looking at" facts),
  // then the optimal/gym/raid/pvp performance sections, then the
  // reference/acquisition tail, roster last.
  return `<div class="more-view dex-view">
    <a class="safe-escape" href="./#more/collection" data-route="more" data-view="collection">Back to Collection</a>
    ${identitySection(form, forms)}
    ${statsSection(form)}
    ${superMegaLine(form)}
    ${bossSection(form, raidTargetTool)}
    ${weaknessSection(form)}
    ${optimalSection(form, gym, raids, raidsLoaded, formInstancesFor(form, roster), pvp)}
    ${gymSection(form, gym)}
    ${raidAttackerSection(form, raids, raidsLoaded)}
    ${pvpSection(form, pvp, roster, raids)}
    ${movesSection(form)}
    ${evolutionSection(form, forms)}
    ${acquisitionSection(form, acquisitionGuide, forms)}
    ${availabilitySection(form, currentEggs)}
    ${yourRosterSection(form, roster, quickAdd, raids, raidsLoaded, gym, forms, ocrIntake, pvp)}
  </div>`;
}


// Exported for tests: relative-property checks only (never absolute ranks),
// per the repo rule against pinning gym/raid model output.
export { gymVerdict, bandPlacements, eliteMoveLabel };
