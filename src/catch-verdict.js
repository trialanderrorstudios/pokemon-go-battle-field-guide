// Catch Verdict — one answer per caught Pokemon: build it, which league, or
// let it go. Everything the operator asked in chat across 2026-09/10 ("1/14/13
// piplup at 41cp?", "got a 14/15/15 shadow zubat") was answered by hand from
// the same handful of signals; this composes them so a scanned or entered
// catch answers itself (P1 of the Poke Genie roadmap, 2026-10-05).
//
// What it adds over spread-checker.js (which it builds on, not replaces):
//   - CP lockout: given the catch's CP, the level is fixed, and evolving keeps
//     it — so "Koffing at 828" is already a 1604 Weezing, Great League closed.
//   - Species reality below the top 50 via pvpDeepRanks: a #26 spread on a
//     #444 species is "great roll, wrong Pokemon", not a build.
//   - Shadow evolution: shadow pre-evolutions carry NO evolves_to edges in the
//     data (0329-normal-shadow -> []), so Shadow Vibrava would never reach
//     Shadow Flygon. The regular chain is walked and each end mapped to its
//     -shadow variant when one exists.
//   - Elite TM cost of the ranked moveset, purify impact (+2 IVs can make a
//     spread WORSE: Shadow Lapras 0/12/13 is UL #6, purified 2/14/15 is #137),
//     the Frustration window, and whether you already own a better copy.
import { buildRenameString } from "./rename-string.js";
import { rankIvSpread, LEAGUE_CP_CAP, RANK_LEAGUES } from "./pvp-team.js";
import { calculateCp, solveLevel } from "./instances.js";
import { buildCost } from "./raid-target.js";
import { frustrationWindow } from "./frustration-window.js";
import { escapeHtml } from "./views/home.js";

const LEAGUE_LABEL = Object.freeze({ great: "Great League", ultra: "Ultra League", master: "Master League" });
const LEAGUE_INDEX = Object.freeze({ great: 0, ultra: 1, master: 2 });

// The shipped pvp lists are top 50 per league — "viable" means the species is
// in them. Deeper than that is real data but not a build recommendation.
export const VIABLE_SPECIES_RANK = 50;
// Spread percentiles, same scale rankIvSpread returns (0-100 by position).
const GOOD_SPREAD = 90;
// spread-checker.js's own "usable" tier. Position percentile is harsh — rank
// 635 of 4096 reads as the 84th percentile while holding 96.7% of rank-1's
// stat product — so a cheaper-alternative note uses this bar, not GOOD.
const USABLE_SPREAD = 75;
const EXCELLENT_SPREAD = 98;
// Raid role worth a build: RANK_TIERS.solid in raid-target.js (top 8 per type).
const RAID_ROLE_RANK = 8;
// A defender list rank worth parking a mon for. Both rankings are 100 deep,
// so "in the list" alone is not a role — Shadow Flygon at #93 called itself a
// gym defender in the first calibration run.
const GYM_ROLE_RANK = 20;
// Above this level a build needs XL candy — the cost the operator weighs
// first (Shadow Dusknoir: Ultra at L48 vs Great at L23).
const XL_LEVEL = 40;
// A cheaper-alternative league may be a little outside the top 50: the point
// is "here's the no-XL build", and Shadow Dusknoir's #75 Great League build is
// exactly the one the operator was told to prefer.
const NEAR_VIABLE_RANK = 100;

function withSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" })[n % 10] ?? "th"}`;
}

function regularIdOf(formId) {
  return formId.replace(/-shadow$/, "");
}

function walkEnds(formId, forms, seen = new Set()) {
  if (seen.has(formId)) return [];
  seen.add(formId);
  const edges = forms[formId]?.evolves_to ?? [];
  if (!edges.length) return [formId];
  return edges.flatMap((edge) => walkEnds(edge.formId, forms, seen));
}

// The picked form itself plus every final evolution. A shadow with no edges of
// its own walks the regular chain and lands on shadow ends — evolving a shadow
// keeps it shadow.
export function verdictTargets(formId, forms) {
  const form = forms[formId];
  if (!form) return [];
  let ends = walkEnds(formId, forms);
  if (form.shadow && ends.length === 1 && ends[0] === formId) {
    ends = walkEnds(regularIdOf(formId), forms)
      .map((id) => (forms[`${id}-shadow`] ? `${id}-shadow` : id));
  }
  return [...new Set([formId, ...ends])].filter((id) => forms[id]);
}

function eliteMovesFor(form, row) {
  if (!row) return [];
  const availability = form.move_availability ?? {};
  const elite = new Set(form.elite_moves ?? []);
  return [row.fastMove, ...(row.chargedMoves ?? [])]
    .filter((move) => move && (availability[move] === "eliteOnly" || elite.has(move)));
}

function speciesRank(formId, league, pvp, deep) {
  const row = (pvp?.[league] ?? []).find((entry) => entry.formId === formId) ?? null;
  if (row) return { rank: row.rank, total: deep?.totals?.[league] ?? null, row };
  const rank = deep?.ranks?.[formId]?.[LEAGUE_INDEX[league]] ?? null;
  return rank ? { rank, total: deep?.totals?.[league] ?? null, row: null } : null;
}

function optionsFor(targetId, { forms, ivs, level, pvp, deep }) {
  const form = forms[targetId];
  return RANK_LEAGUES.map((league) => {
    const species = speciesRank(targetId, league, pvp, deep);
    const cap = LEAGUE_CP_CAP[league];
    const cpNow = level ? calculateCp(form, ivs, level) : null;
    const locked = Boolean(cap && cpNow && cpNow > cap);
    const spread = locked ? null : rankIvSpread(form, ivs, league);
    return {
      formId: targetId, name: form.name, league,
      speciesRank: species?.rank ?? null, speciesTotal: species?.total ?? null,
      spreadRank: spread?.rank ?? null, spreadPct: spread?.percentile ?? null,
      fitsAt: spread ? { level: spread.level, cp: spread.cp } : null,
      locked, cpNow,
      eliteMoves: eliteMovesFor(form, species?.row ?? null),
    };
  });
}

function viable(option) {
  return !option.locked && option.spreadRank && option.speciesRank && option.speciesRank <= VIABLE_SPECIES_RANK;
}

function bestOf(options) {
  return [...options].sort((a, b) => (a.speciesRank - b.speciesRank) || (a.spreadRank - b.spreadRank))[0] ?? null;
}

function topRaidRole(targetIds, raids) {
  const ids = new Set(targetIds);
  const rows = [...(raids?.regular ?? []), ...(raids?.shadow ?? [])]
    .filter((row) => row.status === "ranked" && ids.has(row.formId));
  return rows.sort((a, b) => a.rank - b.rank)[0] ?? null;
}

function gymRoleFor(targetIds, forms, gym) {
  for (const id of targetIds) {
    const list = forms[id]?.shadow ? gym?.shadowDefenderRanking : gym?.defenderRanking;
    const row = (list ?? []).find((entry) => entry.formId === id);
    if (row && row.rank <= GYM_ROLE_RANK) return { formId: id, name: forms[id].name, rank: row.rank, of: list.length };
  }
  return null;
}

// Purifying is irreversible and adds +2 to each IV (capped) — which moves a
// low-attack PvP spread the wrong way. Compared on the same species/league
// the shadow's best option uses, so the delta is like-for-like.
function purifyImpact(best, ivs, forms, pvp, deep) {
  if (!best) return null;
  const regularId = regularIdOf(best.formId);
  const form = forms[regularId];
  if (!form || regularId === best.formId) return null;
  const purifiedIvs = { atk: Math.min(15, ivs.atk + 2), def: Math.min(15, ivs.def + 2), sta: Math.min(15, ivs.sta + 2) };
  const spread = rankIvSpread(form, purifiedIvs, best.league);
  const species = speciesRank(regularId, best.league, pvp, deep);
  return {
    ivs: purifiedIvs, name: form.name, league: best.league,
    spreadRank: spread?.rank ?? null, speciesRank: species?.rank ?? null,
    worse: Boolean(spread && best.spreadRank && spread.rank > best.spreadRank),
  };
}

function ownedBetter(best, ivs, roster, forms) {
  if (!best) return null;
  const form = forms[best.formId];
  let winner = null;
  for (const instance of roster?.instances ?? []) {
    if (instance.formId !== best.formId || !instance.ivs) continue;
    const same = instance.ivs.atk === ivs.atk && instance.ivs.def === ivs.def && instance.ivs.sta === ivs.sta;
    if (same) continue;
    const rank = rankIvSpread(form, instance.ivs, best.league);
    if (rank && rank.rank < best.spreadRank && (!winner || rank.rank < winner.spreadRank)) {
      winner = { ivs: instance.ivs, cp: instance.cp ?? null, spreadRank: rank.rank };
    }
  }
  return winner;
}

const ivText = (ivs) => `${ivs.atk}/${ivs.def}/${ivs.sta}`;
const moveName = (id) => String(id).toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

// Sum of evolves_to candyCost edges from fromId to toId, or null if the
// chain data doesn't connect them (omit the candy figure rather than guess).
function candyPath(fromId, toId, forms, seen = new Set()) {
  if (fromId === toId) return 0;
  if (seen.has(fromId)) return null;
  seen.add(fromId);
  for (const edge of forms[fromId]?.evolves_to ?? []) {
    const rest = candyPath(edge.formId, toId, forms, seen);
    if (rest !== null) return edge.candyCost + rest;
  }
  return null;
}

// Shadow pre-evolutions carry no evolves_to edges of their own (see the file
// banner) — their candy cost is still the regular chain's, so walk that one
// and match against the target's own regular id.
function evolutionCandyTo(formId, targetId, forms) {
  if (forms[formId]?.evolves_to?.length) return candyPath(formId, targetId, forms);
  return candyPath(regularIdOf(formId), regularIdOf(targetId), forms);
}

// What-if block: evolve (reusing verdict.options, which already walked the
// targets), power up to the best league fit, and purify (reusing
// verdict.purify). Pure — no DOM, no I/O — so renderCatchVerdict just joins
// the strings. Returns [] when there's nothing concrete to say (no level
// known locks out both CP math lines).
export function whatIfLines({ formId, cp, level, shadow, options, best, purify }, forms) {
  const lines = [];
  if (Number.isFinite(level)) {
    const seen = new Set();
    for (const option of options) {
      if (option.formId === formId || seen.has(option.formId)) continue;
      seen.add(option.formId);
      const candy = evolutionCandyTo(formId, option.formId, forms);
      lines.push(`Evolve to ${option.name}: CP ${cp}→${option.cpNow}${candy != null ? ` (${candy} candy)` : ""}`);
    }
    // rankIvSpread's bestBuddy default lets fitsAt.level land on 51 — the
    // free Best Buddy +1, not a candy-bought level. Price only up to 50 and
    // name that last step separately.
    if (best?.fitsAt && best.fitsAt.level > level) {
      const to = Math.min(50, best.fitsAt.level);
      const bestBuddy = best.fitsAt.level > 50 ? " + Best Buddy" : "";
      const cost = to > level ? buildCost(level, to, shadow) : { candy: 0, stardust: 0, xlCandy: 0, xlStardust: 0 };
      const xlPart = cost.xlCandy ? `, ${cost.xlCandy} XL` : "";
      // Only name the target species when evolving is part of reaching this
      // fit — a same-species power-up ("Power up to L30 for Great League")
      // doesn't need it, an evolving one ("...as Umbreon...") does.
      const asTarget = best.formId !== formId ? ` as ${best.name}` : "";
      lines.push(`Power up to L${to}${bestBuddy}${asTarget} for ${LEAGUE_LABEL[best.league]}: ${cost.stardust + cost.xlStardust} dust, ${cost.candy} candy${xlPart}`);
    }
  }
  if (purify) {
    // Purifying floors the level at 25, which can push CP over the Great
    // League cap when the pre-purify build's own fit level was already
    // below that — the ranked spot then isn't reachable purified.
    const overCap = purify.league === "great" && best?.fitsAt && best.fitsAt.level < 25
      ? " (purified min L25 — over the Great cap)" : "";
    lines.push(`Purify: ${ivText(purify.ivs)} → ${LEAGUE_LABEL[purify.league]} spread #${purify.spreadRank}${purify.worse ? " (worse, don't)" : ""}${overCap}`);
  }
  return lines;
}

// catchVerdict({ formId, ivs:{atk,def,sta}, cp?, chargedMoves?, forms, pvp,
// pvpDeepRanks, raids, gym, roster, currentEvents, now }) -> verdict | null.
// `chargedMoves`, when known, lets an already-cleared shadow skip the
// Frustration line; a fresh catch always carries Frustration.
export function catchVerdict({
  formId, ivs, cp = null, chargedMoves = null,
  forms = {}, pvp = {}, pvpDeepRanks = null, raids = {}, gym = {}, roster = null, currentEvents = null, now = new Date(),
} = {}) {
  const form = forms[formId];
  if (!form || !ivs) return null;
  const level = cp ? solveLevel(form, ivs, Number(cp)) : null;
  const targets = verdictTargets(formId, forms);
  const ctx = { forms, ivs, level, pvp, deep: pvpDeepRanks };
  const options = targets.flatMap((id) => optionsFor(id, ctx));
  const viableOptions = options.filter(viable);
  const best = bestOf(viableOptions);
  const raid = topRaidRole(targets, raids);
  const gymRole = gymRoleFor(targets, forms, gym);

  const lines = [];
  // Locked leagues first: they're the fact most likely to surprise.
  for (const option of options.filter((o) => o.locked && o.speciesRank && o.speciesRank <= VIABLE_SPECIES_RANK)) {
    lines.push(`${LEAGUE_LABEL[option.league]}: closed — already CP ${option.cpNow} as ${option.name} at this level.`);
  }
  // "Great roll, wrong Pokemon": an excellent spread on a species below the
  // top 50. The single most common misread in the operator's own hauls.
  const wrongMon = options
    .filter((o) => !o.locked && o.spreadPct >= EXCELLENT_SPREAD && o.speciesRank && o.speciesRank > VIABLE_SPECIES_RANK)
    .sort((a, b) => a.spreadRank - b.spreadRank)[0];
  if (wrongMon && !best) {
    lines.push(`Great roll, wrong Pokémon — spread #${wrongMon.spreadRank} for ${LEAGUE_LABEL[wrongMon.league]}, but ${wrongMon.name} is #${wrongMon.speciesRank} of ${wrongMon.speciesTotal}.`);
  }
  if (best) {
    const fit = best.fitsAt ? `, fits at L${best.fitsAt.level} / CP ${best.fitsAt.cp}` : "";
    lines.push(`${LEAGUE_LABEL[best.league]}: spread #${best.spreadRank} (${withSuffix(best.spreadPct)} percentile) as ${best.name}, species #${best.speciesRank}${fit}.`);
    if (best.fitsAt && best.fitsAt.level > XL_LEVEL) {
      const cheaper = bestOf(options.filter((o) => o !== best && !o.locked && o.fitsAt && o.fitsAt.level <= XL_LEVEL
        && o.speciesRank && o.speciesRank <= NEAR_VIABLE_RANK && o.spreadPct >= USABLE_SPREAD));
      lines.push(cheaper
        ? `Needs XL candy. Cheaper: ${LEAGUE_LABEL[cheaper.league]}, species #${cheaper.speciesRank}, spread #${cheaper.spreadRank} at L${cheaper.fitsAt.level} — no XL.`
        : "Needs XL candy to reach that level.");
    }
    if (best.eliteMoves.length) lines.push(`Elite TM: ${best.eliteMoves.map(moveName).join(", ")} in the ranked set.`);
  }
  // Only a role worth building for gets a line; a #12 raid slot is noise next
  // to a real PvP build. Attack costs raids a few percent per point, so only a
  // genuinely low roll is worth flagging.
  const raidRole = raid && raid.rank <= RAID_ROLE_RANK ? raid : null;
  // A bare "transfer" teaches nothing. When no league is viable and no other
  // line explains why, name the closest miss (Mareep -> Ampharos UL #52).
  if (!best && !wrongMon) {
    const closest = bestOf(options.filter((o) => !o.locked && o.speciesRank && o.spreadRank));
    if (closest) lines.push(`Closest: ${closest.name} is #${closest.speciesRank} of ${closest.speciesTotal} in ${LEAGUE_LABEL[closest.league]} — outside the top ${VIABLE_SPECIES_RANK}.`);
  }
  if (raidRole) lines.push(`Raids: ${raidRole.pokemon ?? forms[raidRole.formId]?.name} is #${raidRole.rank} ${raidRole.attackingType}${ivs.atk <= 5 ? ` — attack ${ivs.atk} costs it some DPS` : ""}.`);
  if (gymRole) lines.push(`Gyms: ${gymRole.name} is #${gymRole.rank} of ${gymRole.of} defenders.`);

  const purify = form.shadow ? purifyImpact(best, ivs, forms, pvp, pvpDeepRanks) : null;
  if (purify?.worse) lines.push(`Don't purify: ${ivText(purify.ivs)} drops it to spread #${purify.spreadRank}.`);
  let frustration = null;
  // currentEvents === null means "calendar not loaded here", not "no window" —
  // saying "none announced" during the actual Taken Over window would be the
  // exact wrong advice, so the line is skipped instead.
  if (form.shadow && currentEvents && !(chargedMoves && !chargedMoves.includes("FRUSTRATION"))) {
    const window = frustrationWindow({ currentEvents, roster: null, forms, now });
    frustration = window ? { event: window.event.name, status: window.status } : { event: null, status: "none" };
    lines.push(window
      ? `Frustration: clear it during ${window.event.name}${window.status === "open" ? " (open now)" : ""}.`
      : "Frustration: only clears in a Rocket Taken Over window — none announced.");
  }
  const better = ownedBetter(best, ivs, roster, forms);
  if (better) lines.push(`You already own ${ivText(better.ivs)}${better.cp ? ` (${better.cp})` : ""} — spread #${better.spreadRank}, better.`);

  let call;
  let headline;
  // Order: a real PvP build, then a top raid role, then a mediocre-but-ranked
  // PvP option. Shadow Reshiram is #1 Fire with a #818 Master League spread —
  // the raid job is the answer, the PvP line is a footnote.
  if (best && best.spreadPct >= GOOD_SPREAD && !better) {
    call = "build";
    headline = `Build for ${LEAGUE_LABEL[best.league]}.`;
  } else if (raidRole) {
    call = "raid";
    headline = `Raid attacker — #${raidRole.rank} ${raidRole.attackingType}.`;
  } else if (best) {
    call = "situational";
    headline = better ? "Keep the one you have." : `Playable in ${LEAGUE_LABEL[best.league]}, not optimal.`;
  } else if (gymRole) {
    call = "gym";
    headline = "Gym defender — park it.";
  } else if (form.shadow) {
    call = "purify";
    headline = "No role — purify it for the medal.";
  } else {
    call = "transfer";
    headline = "No role — transfer.";
  }

  const whatIf = whatIfLines({ formId, cp, level, shadow: form.shadow, options, best, purify }, forms);

  return {
    formId, name: form.name, dex: form.dex ?? null, shadow: Boolean(form.shadow), ivs, cp, level,
    call, headline, best, options, raid: raidRole, gym: gymRole, purify, frustration, ownedBetter: better, lines, whatIf,
  };
}

// Scan-review hook (P2): a scanned row gets its verdict the moment species
// and all three IVs are known — screenshot in, verdict out, nothing typed.
// Empty string, never a guess, while the row is incomplete or the rankings
// haven't loaded (ctx.pvp missing).
export function scanRowVerdictHtml(row, ctx = {}) {
  const formId = row?.parsed?.formId;
  const ivs = row?.draft?.ivs;
  const complete = ivs && [ivs.atk, ivs.def, ivs.sta].every((v) => Number.isInteger(v) && v >= 0 && v <= 15);
  if (!formId || !complete || !ctx.pvp || !ctx.raids || !ctx.forms?.[formId]) return "";
  const read = Array.isArray(row.draft?.chargedMoves) ? row.draft.chargedMoves.filter(Boolean) : [];
  return renderCatchVerdict(catchVerdict({
    ...ctx, formId, ivs, cp: Number(row.parsed.cp) || null, chargedMoves: read.length ? read : null,
  }));
}

// Poke Genie's signature move, with our verdict in it: the 12-character
// in-game nickname (rename-string.js) — league letter, the exact IVs in hex,
// and the species rank for that league. Copy, then paste in-game.
function renameLine(verdict) {
  const value = buildRenameString({ league: verdict.best?.league ?? null, ivs: verdict.ivs, speciesRank: verdict.best?.speciesRank ?? null });
  if (!value) return "";
  return `<p class="cv-rename">In-game nickname <code>${escapeHtml(value)}</code> <button type="button" class="cv-share" data-action="copy-text" data-copy-payload="${escapeHtml(value)}">Copy</button></p>`;
}

// Pokedex-entry readout. The app already wears the dex shell (bezel, lens,
// dx- tokens); this is the voice — a scan result, not a stats table.
export function renderCatchVerdict(verdict) {
  if (!verdict) return "";
  const number = verdict.dex ? `No. ${String(verdict.dex).padStart(3, "0")}` : "";
  // Shadow form names already end "(Shadow)"; the tag says it once.
  const species = verdict.name.replace(/\s*\(Shadow\)$/, "").toUpperCase();
  const tags = [number, species, verdict.shadow ? "SHADOW" : ""].filter(Boolean).join(" · ");
  const read = [ivText(verdict.ivs), verdict.cp ? `CP ${verdict.cp}` : "", verdict.level ? `L${verdict.level}` : ""].filter(Boolean).join(" · ");
  return `<article class="catch-verdict" data-call="${escapeHtml(verdict.call)}">
    <p class="cv-kicker">${escapeHtml(tags)}</p>
    <p class="cv-read">${escapeHtml(read)}</p>
    <p class="cv-call">${escapeHtml(verdict.headline)}</p>
    ${verdict.lines.length ? `<ul class="cv-lines">${verdict.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
    ${verdict.whatIf?.length ? `<details class="cv-whatif"><summary>What if…</summary><ul>${verdict.whatIf.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></details>` : ""}
    ${renameLine(verdict)}
    <button type="button" class="cv-share" data-action="share-card-payload" data-share-type="verdict" data-share-payload="${escapeHtml(JSON.stringify({
    name: verdict.name, tags, read, headline: verdict.headline, lines: verdict.lines,
  }))}">Share</button>
  </article>`;
}
