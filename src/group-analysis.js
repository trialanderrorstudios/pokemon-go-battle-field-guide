// Group analysis (answer-engine stage 1, multi-trainer) — composes party-optimizer.js's
// buildParty() per member instead of forking its scoring, level-scaling, or gap math. Every
// score/why/gap string here is one buildParty already produced for that member's own roster;
// this module only rolls those results up across a group.
import { buildParty } from "./party-optimizer.js";
import { RANK_TIERS } from "./raid-target.js";

const PARTY_SIZE = 6; // raid lobby size — same constant party-optimizer.js's PARTY_SIZE uses

const NO_ESTIMATE = { label: "No owned counters ranked for this boss yet — can't estimate.", relobbies: null, confidence: "unknown" };

function gapTypes(gaps) {
  return new Set((gaps ?? []).map((msg) => msg.match(/^No ranked (\S+) attacker owned/)?.[1]).filter(Boolean));
}

function intersectAll(sets) {
  if (!sets.length) return new Set();
  return sets.reduce((acc, set) => new Set([...acc].filter((type) => set.has(type))));
}

// party-optimizer.js's own band logic (elite/solid share -> comfortable/tight/likely-relobby)
// is private to that module, so this mirrors it against the same RANK_TIERS constant instead
// of inventing a new scale. Rank comes from the row's own "why" text (buildParty always writes
// "#<rank>" into it) since buildParty's public party entries don't carry the row object.
function extractRank(why) {
  const match = why?.match(/#(\d+)/);
  return match ? Number(match[1]) : null;
}

function bandFor(entries) {
  const ranks = entries.map((entry) => extractRank(entry.why)).filter((rank) => rank !== null);
  if (!ranks.length) return NO_ESTIMATE;
  const eliteShare = ranks.filter((rank) => rank <= RANK_TIERS.elite).length / ranks.length;
  const solidShare = ranks.filter((rank) => rank <= RANK_TIERS.solid).length / ranks.length;
  const band = eliteShare >= 0.5 ? "comfortable" : solidShare >= 0.5 ? "tight" : "likely-relobby";
  const headline = { comfortable: "Comfortable", tight: "Tight", "likely-relobby": "Likely relobby" }[band];
  return { label: `${headline} — rough guide from party depth, not a simulation.`, relobbies: null, confidence: band };
}

// A species two-plus members both put in their own party for this boss: an honest note
// naming who holds the better copy, straight off each member's own buildParty score.
function dedupNotes(perMemberResults) {
  const byForm = new Map();
  for (const { memberName, result } of perMemberResults) {
    for (const entry of result?.party ?? []) {
      const formId = entry.instance.formId;
      if (!byForm.has(formId)) byForm.set(formId, []);
      byForm.get(formId).push({ memberName, entry });
    }
  }
  const notes = [];
  for (const entries of byForm.values()) {
    if (entries.length < 2) continue;
    entries.sort((left, right) => right.entry.score - left.entry.score);
    const [best, ...rest] = entries;
    const names = entries.map((entry) => entry.memberName).join(" and ");
    const restScores = rest.map((entry) => `${entry.memberName} ${entry.entry.score}`).join(", ");
    // Honesty on ties (review catch): "scores higher" is false at 32 vs 32.
    if (best.entry.score === rest[0].entry.score) {
      notes.push(`${names} are both fielding ${best.entry.form.name} — the copies score the same (${best.entry.score}); either can hold the lead spot.`);
    } else {
      notes.push(`${names} are both fielding ${best.entry.form.name} — ${best.memberName}'s copy scores higher (${best.entry.score} vs ${restScores}), so ${best.memberName} should hold the lead spot.`);
    }
  }
  return notes;
}

export function groupBossCoverage({ targetFormId, members, forms, raids, data } = {}) {
  if (!forms?.[targetFormId]) return null; // unknown boss form -> null, same contract as buildParty
  const list = members ?? [];
  if (!list.length) {
    return { perMember: [], best: [], groupEstimate: { label: "No group members — nothing to estimate.", relobbies: null, confidence: "unknown" }, gaps: [], dedupNotes: [] };
  }

  const results = list.map((member) => ({
    memberName: member.name,
    result: buildParty({ targetFormId, roster: member.roster, forms, raids, data }),
  }));

  const perMember = results.map(({ memberName, result }) => ({
    memberName, party: result?.party ?? [], estimate: result?.estimate ?? NO_ESTIMATE,
  }));

  const best = results
    .flatMap(({ memberName, result }) => (result?.party ?? []).map((entry) => ({ memberName, ...entry })))
    .sort((left, right) => right.score - left.score
      || left.instance.formId.localeCompare(right.instance.formId)
      || left.memberName.localeCompare(right.memberName))
    .slice(0, PARTY_SIZE);

  // Single member: this whole rollup degenerates to that member's own buildParty result.
  const groupEstimate = list.length === 1 ? perMember[0].estimate : bandFor(best);

  const groupGapTypes = intersectAll(results.map(({ result }) => gapTypes(result?.gaps)));
  const gaps = [...groupGapTypes]
    .map((type) => results.find(({ result }) => gapTypes(result?.gaps).has(type))
      .result.gaps.find((msg) => msg.startsWith(`No ranked ${type} attacker owned`)))
    .filter(Boolean);

  return { perMember, best, groupEstimate, gaps, dedupNotes: dedupNotes(results) };
}

export function assignmentAdvice({ members, forms, raids, currentBosses, data } = {}) {
  const list = members ?? [];
  const advice = [];
  for (const boss of currentBosses ?? []) {
    const formId = boss.formId;
    if (!forms?.[formId]) continue; // can't honestly score an unknown boss form — skip it

    const picks = list
      .map((member) => ({ memberName: member.name, result: buildParty({ targetFormId: formId, roster: member.roster, forms, raids, data }) }))
      .filter(({ result }) => result?.party?.length)
      .map(({ memberName, result }) => ({ memberName, top: result.party[0], second: result.party[1] ?? null }))
      .sort((left, right) => right.top.score - left.top.score);

    if (!picks.length) { advice.push({ formId, boss, topPick: null, overlapNotes: [] }); continue; }

    const winner = picks[0];
    const overlapNotes = [];
    for (const other of picks.slice(1)) {
      if (other.top.instance.formId !== winner.top.instance.formId || !other.second) continue;
      const altType = other.second.role.replace(/ attacker$/, "");
      overlapNotes.push(`${winner.memberName} and ${other.memberName} both lead with ${winner.top.form.name} — ${other.memberName} can cover ${altType} instead.`);
    }

    advice.push({ formId, boss, topPick: { memberName: winner.memberName, ...winner.top }, overlapNotes });
  }
  return advice;
}
