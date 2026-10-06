// Share cards (round 11): canvas-rendered PNGs for the share sheet, drawn in
// the dex chassis identity (chassis red / dark screen / mono+rounded type)
// from the mockup contract — no DOM-screenshot library, just 2D canvas
// drawing so this stays a dependency-free leaf module.
//
// Seven card types, one per existing data source — never fabricates a stat,
// only draws what's already stored (or, for gymLineup's reference CP, what's
// computed from real base stats via the app's own CP formula):
//   gymDefense     — longest-defense leaderboard row (gym-defense-log.js)
//   triageSummary  — triage bucket counts (triage.js)
//   instance       — a single instance's CP/IVs (instances.js) + sprite
//   raidPlan       — "Tonight's plan": Home's featured boss + owned counters
//                    (views/home.js's renderFieldBriefing already computes
//                    `featured`/`plan`/the rotation `boss` row — this reuses
//                    that shape, it does not re-derive it)
//   gymLineup      — "Gym defense": the 6 placed leads from gyms.json's
//                    gym.lineupLeads (3 fixed anchors + 3 computed)
//   trophyCard     — "My trophy case": shelf counts + the top (highest-CP)
//                    pick per non-empty shelf (trophy.js's trophyCase())
//   rotationPack   — "Raid rotation": every LIVE rotation boss's already-
//                    ranked verdict (rank/investment tier), independent of
//                    what the sender owns
//
// Each type has a `*CardData` guard that returns null when the underlying
// data doesn't exist yet — the view layer uses that to decide whether to
// offer the "Share card" button at all.
//
// Per mockup docs/mockups/delight-2026-08-11/F2-share-cards-revisited.html:
// only the instrument (dense mono-table) tone is implemented for raidPlan/
// gymLineup. The playful sprite-grid alternate face doubles each card's
// drawing code for a purely presentational variant — not cheap given this
// module's plain-2D-canvas, no-second-exporter constraint — so it's left
// for a follow-up if the operator wants the toggle wired.
import { TEAM_SET } from "./storage.js";
import { bestInstanceForForm, calculateCp } from "./instances.js";
import { spritePath, TYPE_COLORS } from "./sprites.js";
import { TRIAGE_BUCKETS } from "./triage.js";
import { formatDefenseDuration } from "./views/gyms.js";
import { trophyCase } from "./trophy.js";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
export const CARD_SPECS = Object.freeze({
  gymDefense: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  triageSummary: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  instance: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  raidPlan: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  gymLineup: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  trophyCard: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  rotationPack: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  verdict: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  cupTeam: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  // Taller than the shared CARD_HEIGHT — a full infographic (sprite, CP
  // boxes, weak/resist chips, up to 6 moveset rows, 4 counter-group tile
  // rows) genuinely needs more room than every other card's single-screen
  // layout; cropping groups to fit the shared height left the canvas half
  // empty AND dropped two of the four counter groups (2026-10 review fix).
  bossCard: Object.freeze({ width: CARD_WIDTH, height: 1780 }),
});

// Literal copies of the --dx-* tokens in web/styles/app.css — canvas 2D
// drawing can't read CSS custom properties, so these must be kept in sync by
// hand. tests/web/share-card.test.mjs asserts they still match app.css.
export const PALETTE = Object.freeze({
  body: "#c8202c",
  screen: "#0e1420",
  panel: "#1a2233",
  panelRaised: "#212c42",
  text: "#eef2ff",
  muted: "#97a2c4",
  lens: "#35c4ff",
  good: "#45e07c",
  warn: "#ffb84d",
  bad: "#ff6b7a",
  team: Object.freeze({ valor: "#ff5c66", mystic: "#5599e6", instinct: "#e8c220" }),
});
export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
export const DISPLAY = "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
const INSET = 28;

function safeSlug(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "card";
}

// --- data guards: no data yet -> no card offered -----------------------

export function gymDefenseCardData(row) {
  if (!row || !Number.isFinite(row.longestMs) || row.longestMs <= 0) return null;
  return {
    playerName: row.playerName,
    team: TEAM_SET.has(row.team) ? row.team : null,
    longestMs: row.longestMs,
    longestPokemon: row.longestPokemon ?? null,
    longestGymName: row.longestGymName ?? null,
  };
}

export function triageSummaryCardData(counts) {
  const safe = counts && typeof counts === "object" ? counts : {};
  const rows = TRIAGE_BUCKETS.map((bucket) => [bucket, Number(safe[bucket]) || 0]);
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return total > 0 ? { rows, total } : null;
}

export function instanceCardData(instance, form) {
  const ivs = instance?.ivs;
  if (!instance || !form
    || !Number.isFinite(instance.cp)
    || ![ivs?.atk, ivs?.def, ivs?.sta].every((value) => Number.isInteger(value) && value >= 0 && value <= 15)) {
    return null;
  }
  return {
    name: instance.nickname?.trim() || form.name,
    cp: instance.cp,
    ivs: { atk: ivs.atk, def: ivs.def, sta: ivs.sta },
    primaryType: form.primary_type,
    isShiny: Boolean(instance.isShiny),
    isLucky: Boolean(instance.isLucky),
    spritePath: spritePath(form.form_id, { [form.form_id]: form }),
  };
}

// "Tonight's plan": Home's featured raid boss + the sender's owned counters.
// `featured`/`plan`/`boss` are the same objects renderFieldBriefing already
// computes (views/home.js's pickFeaturedBoss + buildRaidPlan(), and the
// rotation row from currentBosses.bosses) — this reshapes them for canvas,
// it doesn't re-derive the boss pick or the counter ranking.
// Counter CP is the real logged-instance CP when the sender has one
// (bestInstanceForForm, same source as home.js's briefingBringCard) —
// otherwise null, drawn as "Owned" rather than a guessed number.
export function raidPlanCardData(featured, plan, boss, roster, forms) {
  if (!featured?.formId || !plan?.target || !Array.isArray(plan.ownedCounters) || !plan.ownedCounters.length) {
    return null;
  }
  const megaLabel = String(forms?.[featured.formId]?.form ?? "").toUpperCase().startsWith("MEGA") ? "Mega" : null;
  return {
    name: featured.name ?? forms?.[featured.formId]?.name ?? featured.formId,
    megaLabel,
    bossTypes: plan.target.bossTypes ?? [],
    endsAt: typeof boss?.endsAt === "string" ? boss.endsAt : null,
    weather: plan.weather ?? "None",
    bossBoostedNow: Boolean(plan.bossBoostedNow),
    counters: plan.ownedCounters.slice(0, 6).map((counter) => ({
      pokemon: forms?.[counter.formId]?.name ?? counter.pokemon,
      attackingType: counter.attackingType,
      rank: counter.rank,
      cp: bestInstanceForForm(roster?.instances, counter.formId)?.cp ?? null,
    })),
  };
}

// "Gym defense": the six leads from gyms.json's `gym.lineupLeads` (3 fixed
// anchors + 3 computed — see gym_ranking.py's lineup_lead_summaries), the
// app's own picker verbatim. `gymName` is only ever a name the sender
// actually typed (e.g. an in-progress defense-log entry) — this app has no
// real-world gym location data, so an absent name draws no placeholder.
// CP is a Level 40 hundo (15/15/15) reference figure computed from the
// form's real base stats via the app's own CP formula — the app doesn't
// track what a reader actually placed, so this is the same "computed, not
// invented" convention raid-target.js's hundoCP fields use, not a real
// per-player value.
export function gymLineupCardData(lineupLeads, team, forms, gymName = null) {
  const leads = (lineupLeads?.leads ?? []).map((row) => row.lead).filter(Boolean).slice(0, 6);
  if (!leads.length) return null;
  return {
    gymName: gymName ? String(gymName).trim() || null : null,
    team: TEAM_SET.has(team) ? team : null,
    leads: leads.map((lead) => {
      const form = forms?.[lead.formId];
      return {
        pokemon: form?.name ?? lead.pokemon,
        rank: lead.rank,
        tier: lead.tier ?? null,
        score: lead.score,
        cp: form ? calculateCp(form, { atk: 15, def: 15, sta: 15 }, 40) : null,
      };
    }),
  };
}

// "My trophy case": counts + the top (highest-CP) pick per non-empty shelf,
// straight from trophy.js's trophyCase() — no new membership/ordering rules
// forked here. Null when the roster has nothing on any shelf (same "no data,
// no button" contract as every other card type).
const TROPHY_SHELVES = Object.freeze([
  // plural spelled out (review catch: the template's naive +"s" rendered
  // "2 Shinys" on the one surface people actually share).
  { key: "hundos", label: "Hundo", plural: "Hundos" },
  { key: "shinies", label: "Shiny", plural: "Shinies" },
  { key: "luckies", label: "Lucky", plural: "Luckies" },
  { key: "giants", label: "Giant", plural: "Giants" },
  { key: "minis", label: "Mini", plural: "Minis" },
]);

export function trophyCardData({ roster, forms } = {}) {
  const trophies = trophyCase({ roster, forms });
  const picks = TROPHY_SHELVES
    .filter((shelf) => trophies[shelf.key].length)
    .map((shelf) => {
      const top = trophies[shelf.key][0];
      return {
        shelf: shelf.key,
        label: shelf.label,
        pokemon: top.instance.nickname?.trim() || top.form.name,
        cp: top.instance.cp,
      };
    });
  if (!picks.length) return null;
  return { counts: trophies.counts, picks };
}

// "Raid rotation": every LIVE rotation boss's own already-ranked verdict
// (rank/investmentTier/attackingType), reassembled from the same
// raids.regular/raids.shadow/megasPrimals rows Home's featured-boss picker
// reads (views/home.js's attackerRankRows) — this deliberately has no roster
// argument, so unlike raidPlanCardData it never gates a boss on owned
// counters, only on whether the boss itself has a real ranked verdict.
// endsAt expiry mirrors home.js's endOfDay: a boss's rotation runs THROUGH
// its listed end date, not up to midnight at its start.
function endOfDay(dateString) {
  // Local-calendar parse (tz fix, 2026-08-14 review catch): new Date("YYYY-MM-DD")
  // parses as UTC midnight, which west of UTC lands on the PREVIOUS local
  // day — a boss "through Aug 17" expired at Aug 16 23:59 local. Building
  // from parts pins the intended local calendar day.
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

// A derived future-week row (startsAt from the events feed) is not live yet.
function hasStarted(boss, now) {
  if (typeof boss?.startsAt !== "string" || Number.isNaN(Date.parse(boss.startsAt))) return true;
  const [year, month, day] = boss.startsAt.split("-").map(Number);
  return new Date(year, month - 1, day) <= now;
}

function liveRotationBosses(currentBosses, now) {
  return (currentBosses?.bosses ?? []).filter((boss) => hasStarted(boss, now)
    && !(typeof boss?.endsAt === "string"
    && !Number.isNaN(Date.parse(boss.endsAt))
    && endOfDay(boss.endsAt) < now));
}

function bestRankedRow(formId, data) {
  const rows = [...(data?.raids?.regular ?? []), ...(data?.raids?.shadow ?? []), ...(data?.megasPrimals ?? [])]
    .filter((row) => row?.formId === formId && row.status === "ranked");
  if (!rows.length) return null;
  return rows.reduce((best, row) => (row.rank < best.rank ? row : best));
}

export function rotationPackCardData({
  currentBosses, forms, data, now = new Date(),
} = {}) {
  const bosses = liveRotationBosses(currentBosses, now)
    .map((boss) => {
      const row = bestRankedRow(boss.formId, data);
      if (!row) return null; // no ranked verdict yet — nothing worth headlining
      return {
        formId: boss.formId,
        name: forms?.[boss.formId]?.name ?? boss.formId,
        tier: boss.tier ?? null,
        endsAt: typeof boss.endsAt === "string" ? boss.endsAt : null,
        rank: row.rank,
        attackingType: row.attackingType,
        investmentTier: row.investmentTier,
        recommendation: row.recommendation,
      };
    })
    .filter(Boolean);
  return bosses.length ? { bosses } : null;
}

// --- drawing -------------------------------------------------------------

function drawChassis(ctx, width, height, kicker) {
  ctx.fillStyle = PALETTE.body;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = PALETTE.screen;
  ctx.fillRect(INSET, INSET, width - INSET * 2, height - INSET * 2);
  ctx.textBaseline = "top";
  ctx.fillStyle = PALETTE.lens;
  ctx.font = `700 32px ${MONO}`;
  ctx.fillText(kicker.toUpperCase(), INSET + 48, INSET + 48);
  ctx.textBaseline = "bottom";
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `28px ${DISPLAY}`;
  ctx.fillText("Pokémon GO Field Guide", INSET + 48, height - INSET - 40);
}

function drawGymDefenseCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "Gym defense");
  ctx.fillStyle = PALETTE.text;
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 64px ${DISPLAY}`;
  ctx.fillText(data.playerName, 120, 260);
  if (data.team) {
    ctx.fillStyle = PALETTE.team[data.team];
    ctx.font = `700 32px ${MONO}`;
    ctx.fillText(data.team.toUpperCase(), 120, 310);
  }
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `36px ${DISPLAY}`;
  ctx.fillText("Longest defense", 120, 460);
  ctx.fillStyle = PALETTE.lens;
  ctx.font = `700 120px ${MONO}`;
  ctx.fillText(formatDefenseDuration(data.longestMs), 120, 600);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `40px ${DISPLAY}`;
  if (data.longestPokemon) ctx.fillText(data.longestPokemon, 120, 680);
  if (data.longestGymName) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `32px ${DISPLAY}`;
    ctx.fillText(data.longestGymName, 120, 730);
  }
}

function drawTriageSummaryCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "Triage");
  ctx.fillStyle = PALETTE.text;
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 60px ${DISPLAY}`;
  ctx.fillText("Box sorted", 120, 240);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `36px ${DISPLAY}`;
  ctx.fillText(`${data.total.toLocaleString("en-US")} Pokémon reviewed`, 120, 300);
  const barWidth = width - 240;
  let y = 400;
  for (const [bucket, count] of data.rows) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(120, y, barWidth, 96);
    const filled = Math.round(barWidth * (data.total ? count / data.total : 0));
    ctx.fillStyle = PALETTE.lens;
    ctx.fillRect(120, y, Math.max(filled, count > 0 ? 12 : 0), 96);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 36px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.fillText(bucket, 148, y + 48);
    ctx.textAlign = "right";
    ctx.fillText(String(count), 120 + barWidth - 28, y + 48);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    y += 128;
  }
}

function ivBar(ctx, x, y, width, label, value) {
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `28px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.fillText(`${label} ${value}/15`, x, y + 20);
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y + 44, width, 28);
  ctx.fillStyle = PALETTE.lens;
  ctx.fillRect(x, y + 44, Math.round(width * (value / 15)), 28);
}

async function drawInstanceCard(ctx, { width }, data, documentObject) {
  drawChassis(ctx, width, CARD_HEIGHT, "My Pokémon");
  const image = data.spritePath ? await loadImage(documentObject, data.spritePath) : null;
  const centerX = width / 2;
  if (image) {
    ctx.drawImage(image, centerX - 180, 140, 360, 360);
  } else {
    ctx.fillStyle = TYPE_COLORS[data.primaryType] ?? TYPE_COLORS.Normal;
    ctx.beginPath();
    ctx.arc(centerX, 320, 180, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 56px ${DISPLAY}`;
  const badges = [data.isShiny ? "★" : "", data.isLucky ? "🍀" : ""].filter(Boolean).join(" ");
  ctx.fillText(`${data.name}${badges ? ` ${badges}` : ""}`, centerX, 600);
  ctx.fillStyle = PALETTE.lens;
  ctx.font = `700 88px ${MONO}`;
  ctx.fillText(`CP ${data.cp}`, centerX, 700);
  ctx.textAlign = "left";
  ivBar(ctx, 120, 800, width - 240, "ATK", data.ivs.atk);
  ivBar(ctx, 120, 900, width - 240, "DEF", data.ivs.def);
  ivBar(ctx, 120, 1000, width - 240, "STA", data.ivs.sta);
}

function drawRaidPlanCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "Tonight's plan");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 56px ${DISPLAY}`;
  ctx.fillText(data.megaLabel ? `${data.name} (${data.megaLabel})` : data.name, 120, 210);
  ctx.fillStyle = PALETTE.lens;
  ctx.font = `700 30px ${MONO}`;
  ctx.fillText(data.bossTypes.join(" / ").toUpperCase(), 120, 250);
  let y = 310;
  if (data.endsAt) {
    ctx.fillStyle = PALETTE.warn;
    ctx.font = `700 28px ${MONO}`;
    ctx.fillText(`Rotation ends ${data.endsAt}`, 120, y);
    y += 44;
  }
  if (data.weather !== "None") {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `26px ${MONO}`;
    ctx.fillText(`Weather: ${data.weather}${data.bossBoostedNow ? " — boss boosted" : ""}`, 120, y);
    y += 44;
  }
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `700 26px ${MONO}`;
  ctx.fillText("YOUR OWNED COUNTERS", 120, y + 30);
  y += 60;
  const rowWidth = width - 240;
  for (const counter of data.counters) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(120, y, rowWidth, 104);
    ctx.textBaseline = "middle";
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 34px ${DISPLAY}`;
    ctx.fillText(counter.pokemon, 150, y + 36);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `24px ${MONO}`;
    ctx.fillText(`${counter.attackingType} · rank #${counter.rank}`, 150, y + 76);
    ctx.textAlign = "right";
    ctx.fillStyle = counter.cp ? PALETTE.lens : PALETTE.muted;
    ctx.font = `700 32px ${MONO}`;
    ctx.fillText(counter.cp ? `CP ${counter.cp}` : "Owned", 120 + rowWidth - 20, y + 52);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    y += 120;
  }
}

// S/A read as strong, C as middling, F/D as weak — a presentational
// shorthand for the card's tier chip color, not the app's own tier-band
// cutoffs (gym_ranking.py's are score-based, not exposed as a color map).
function tierColor(tier) {
  if (tier === "S+" || tier === "S" || tier === "A") return PALETTE.good;
  if (tier === "F" || tier === "D") return PALETTE.bad;
  if (tier) return PALETTE.warn;
  return PALETTE.muted;
}

// I2 (2026-10-05): verdict and cup-team cards. Their buttons carry the card
// data inline (data-share-payload), so these guards are the trust boundary
// for whatever JSON came off the page.
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of String(text ?? "").split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const clip = (value, max) => String(value ?? "").slice(0, max);

// Duplicated from views/move-sheet.js's displayMoveName, not imported — a
// real import would cycle (move-sheet.js -> views/home.js -> share-card.js,
// same reasoning sprites.js's own escapeHtml duplication comment gives for
// staying a dependency-free leaf module).
function displayMoveName(moveId) {
  return String(moveId ?? "").toLowerCase().split("_")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}

function moveText(moveId, elite) {
  if (!moveId) return "";
  return elite ? `${displayMoveName(moveId)} (Elite)` : displayMoveName(moveId);
}

export function verdictCardData(raw) {
  if (!raw || typeof raw.name !== "string" || typeof raw.headline !== "string") return null;
  return {
    name: clip(raw.name, 40), tags: clip(raw.tags, 60), read: clip(raw.read, 60), headline: clip(raw.headline, 160),
    lines: (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 5).map((line) => clip(line, 200)),
  };
}

export function cupTeamCardData(raw) {
  if (!raw || typeof raw.cupName !== "string" || !Array.isArray(raw.members) || !raw.members.length) return null;
  return {
    cupName: clip(raw.cupName, 40),
    members: raw.members.slice(0, 3).map((m) => ({ name: clip(m?.name, 40), role: clip(m?.role, 12), note: clip(m?.note, 60) })),
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).slice(0, 3).map((w) => clip(w, 120)),
  };
}

function clipInt(value, fallback = null) {
  return Number.isInteger(value) ? value : fallback;
}

function clipBool(value) {
  return Boolean(value);
}

// A move/sprite path here is always one this app's own spritePath()/data
// produced server-side (app.js's bossCardSharePayload) — this just keeps the
// guard's contract the same shape as every other field: a string of sane
// length, or null, never trusted beyond that.
function clipPath(value) {
  return typeof value === "string" ? clip(value, 200) : null;
}

function clipTypeRow(row) {
  return { type: clip(row?.type, 16), multiplier: Number.isFinite(row?.multiplier) ? row.multiplier : 1, isDouble: clipBool(row?.isDouble) };
}

function clipRaidAttackerRow(row) {
  return {
    attackingType: clip(row?.attackingType, 16),
    rank: clipInt(row?.rank),
    investmentTier: typeof row?.investmentTier === "string" ? clip(row.investmentTier, 8) : null,
    fastMove: typeof row?.fastMove === "string" ? clip(row.fastMove, 40) : null,
    chargedMove: typeof row?.chargedMove === "string" ? clip(row.chargedMove, 40) : null,
    eliteFastTM: clipBool(row?.eliteFastTM),
    eliteChargedTM: clipBool(row?.eliteChargedTM),
  };
}

function clipPvpRow(row) {
  return {
    league: clip(row?.league, 24),
    rank: clipInt(row?.rank),
    investmentTier: typeof row?.investmentTier === "string" ? clip(row.investmentTier, 8) : null,
    fastMove: typeof row?.fastMove === "string" ? clip(row.fastMove, 40) : null,
    chargedMoves: (Array.isArray(row?.chargedMoves) ? row.chargedMoves : []).slice(0, 2).map((m) => clip(m, 40)),
    eliteFastTM: clipBool(row?.eliteFastTM),
    eliteChargedTM: clipBool(row?.eliteChargedTM),
  };
}

function clipCounterRow(row) {
  return { ...clipRaidAttackerRow(row), formId: clip(row?.formId, 40), pokemon: clip(row?.pokemon, 40), spritePath: clipPath(row?.spritePath) };
}

const COUNTER_GROUP_KEYS = Object.freeze(["mega", "shadow", "legendaryMythical", "general"]);

// I3 (2026-10-06): boss card. The Raid Target view's "Share boss card" button
// carries the display-ready shape drawBossCard draws from directly (real
// numbers/moves/sprite paths, same contract app.js's bossCardSharePayload
// builds) — this guard re-validates/clips every field before anything is
// drawn, same trust boundary as verdictCardData/cupTeamCardData above.
export function bossCardShareData(raw) {
  if (!raw || typeof raw.name !== "string") return null;
  const catchCp = raw.catchCp && [raw.catchCp.normalMin, raw.catchCp.normalHundo, raw.catchCp.boostedMin, raw.catchCp.boostedHundo].every(Number.isFinite)
    ? { normalMin: raw.catchCp.normalMin, normalHundo: raw.catchCp.normalHundo, boostedMin: raw.catchCp.boostedMin, boostedHundo: raw.catchCp.boostedHundo }
    : null;
  const counters = raw.counters && typeof raw.counters === "object"
    ? Object.fromEntries(COUNTER_GROUP_KEYS.map((key) => [key, (Array.isArray(raw.counters[key]) ? raw.counters[key] : []).slice(0, 3).map(clipCounterRow)]))
    : null;
  return {
    name: clip(raw.name, 40),
    formId: clip(raw.formId, 40),
    spritePath: clipPath(raw.spritePath),
    types: (Array.isArray(raw.types) ? raw.types : []).slice(0, 2).map((t) => clip(t, 16)),
    window: clip(raw.window, 60),
    catchCp,
    weakTo: (Array.isArray(raw.weakTo) ? raw.weakTo : []).slice(0, 18).map(clipTypeRow),
    resists: (Array.isArray(raw.resists) ? raw.resists : []).slice(0, 18).map(clipTypeRow),
    raidAttackers: (Array.isArray(raw.raidAttackers) ? raw.raidAttackers : []).slice(0, 3).map(clipRaidAttackerRow),
    pvp: (Array.isArray(raw.pvp) ? raw.pvp : []).slice(0, 3).map(clipPvpRow),
    counters,
    raidHour: typeof raw.raidHour === "string" ? clip(raw.raidHour, 80) : null,
    trainersNeeded: typeof raw.trainersNeeded === "string" ? clip(raw.trainersNeeded, 240) : null,
  };
}

function drawVerdictCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "Catch verdict");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `700 28px ${MONO}`;
  ctx.fillText(data.tags, 120, 200);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 40px ${MONO}`;
  ctx.fillText(data.read, 120, 260);
  ctx.fillStyle = PALETTE.lens;
  ctx.font = `700 54px ${DISPLAY}`;
  let y = 360;
  for (const line of wrapText(ctx, data.headline, width - 240)) {
    ctx.fillText(line, 120, y);
    y += 66;
  }
  y += 30;
  ctx.fillStyle = PALETTE.text;
  ctx.font = `34px ${DISPLAY}`;
  for (const note of data.lines) {
    for (const line of wrapText(ctx, `• ${note}`, width - 240)) {
      if (y > CARD_HEIGHT - 160) return;
      ctx.fillText(line, 120, y);
      y += 46;
    }
    y += 14;
  }
}

function drawCupTeamCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "Cup team");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 60px ${DISPLAY}`;
  ctx.fillText(data.cupName, 120, 220);
  let y = 300;
  const rowWidth = width - 240;
  for (const member of data.members) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(120, y, rowWidth, 150);
    ctx.fillStyle = PALETTE.lens;
    ctx.font = `700 26px ${MONO}`;
    ctx.fillText(member.role.toUpperCase(), 150, y + 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 46px ${DISPLAY}`;
    ctx.fillText(member.name, 150, y + 96);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `26px ${MONO}`;
    ctx.fillText(member.note, 150, y + 132);
    y += 170;
  }
  ctx.font = `32px ${DISPLAY}`;
  ctx.fillStyle = PALETTE.muted;
  for (const warning of data.warnings) {
    for (const line of wrapText(ctx, warning, rowWidth)) {
      ctx.fillText(line, 120, y + 40);
      y += 44;
    }
  }
}

function bossCardTypeColor(type) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.Normal;
}

// A thin drawing facade over the real 2D context: every metric read
// (measureText) always goes to the real context, but every pixel-mutating
// call (fillRect/fillText/drawImage/arc/fill, and the style setters that
// affect them) is a no-op when `dry`. drawBossCard runs its ENTIRE layout
// twice — once dry, to measure the content's real height, once for real,
// after resizing the canvas to fit — through this one shared layout
// function, so both passes make identical wrap/line decisions by
// construction and can never drift apart into two copies of the same math.
function bossCardPainter(ctx, dry) {
  return {
    measureText: (text) => ctx.measureText(text),
    set font(value) { ctx.font = value; }, // always real: measureText depends on it
    set fillStyle(value) { if (!dry) ctx.fillStyle = value; },
    set textAlign(value) { if (!dry) ctx.textAlign = value; },
    set textBaseline(value) { if (!dry) ctx.textBaseline = value; },
    fillText(text, x, y) { if (!dry) ctx.fillText(text, x, y); },
    fillRect(x, y, w, h) { if (!dry) ctx.fillRect(x, y, w, h); },
    beginPath() { if (!dry) ctx.beginPath(); },
    arc(...args) { if (!dry) ctx.arc(...args); },
    fill() { if (!dry) ctx.fill(); },
    drawImage(...args) { if (!dry) ctx.drawImage(...args); },
  };
}

// Line height for a `"<weight> <size>px <family>"` font string — every
// section below advances its cursor by this (plus a gap), never by a
// hand-tuned magic number that silently stops matching once the font size
// changes (2026-10 review: that mismatch is exactly what made "RESISTS"
// and "MOVESETS & RATINGS" overlap the chip row above them).
function bossCardLineHeight(font) {
  const size = Number(/([0-9]+)px/.exec(font)?.[1] ?? 20);
  return Math.ceil(size * 1.3);
}

// A flat-colored chip (type or tier) with centered-height text, the canvas
// equivalent of .type-chip/.invest-pill in the HTML card. Returns the width
// it drew, so callers can lay out a row of chips left to right.
function drawBossCardChip(p, x, y, text, color, { height = 36, textColor = PALETTE.screen, font = `700 22px ${MONO}` } = {}) {
  p.font = font;
  const paddingX = 16;
  const width = Math.ceil(p.measureText(text).width) + paddingX * 2;
  p.fillStyle = color;
  p.fillRect(x, y, width, height);
  p.fillStyle = textColor;
  p.textAlign = "left";
  p.textBaseline = "middle";
  p.fillText(text, x + paddingX, y + height / 2 + 1);
  p.textBaseline = "alphabetic";
  return width;
}

const BOSS_CARD_CHIP_HEIGHT = 36;
const BOSS_CARD_CHIP_GAP = 10;
const BOSS_CARD_CHIP_ROW_GAP = 10;

// Row of type chips (weak-to/resists/header types), each colored by its own
// type like the HTML card's typeChip() — suffixFor(row) adds the multiplier
// text ("4x"/"0.625x") or returns "" for a plain type chip. Wraps to a new
// row inside maxWidth (a dual-weakness boss can have more weak/resist types
// than fit on one line) and returns the TOTAL height consumed across every
// row it drew, so the caller's cursor always advances past every chip, not
// just the first row (2026-10 review, item 1/5).
function drawBossCardChipRow(p, x, y, maxWidth, rows, suffixFor) {
  let cursorX = x;
  let cursorY = y;
  for (const row of rows) {
    const suffix = suffixFor(row);
    const label = suffix ? `${row.type} ${suffix}` : row.type;
    p.font = `700 22px ${MONO}`;
    const width = Math.ceil(p.measureText(label).width) + 32;
    if (cursorX > x && cursorX + width > x + maxWidth) {
      cursorX = x;
      cursorY += BOSS_CARD_CHIP_HEIGHT + BOSS_CARD_CHIP_ROW_GAP;
    }
    drawBossCardChip(p, cursorX, cursorY, label, bossCardTypeColor(row.type), { height: BOSS_CARD_CHIP_HEIGHT });
    cursorX += width + BOSS_CARD_CHIP_GAP;
  }
  return (cursorY - y) + BOSS_CARD_CHIP_HEIGHT;
}

// A top-anchored section label ("WEAK TO", "MEGA", …) — top-anchored (not
// alphabetic-baseline like the rest of this file's cards) so its own
// bossCardLineHeight is an honest "how much vertical space did this just
// use", with no ascender reaching back up into whatever was drawn above it.
function drawBossCardLabel(p, x, y, text, { font = `700 20px ${MONO}`, color = PALETTE.muted } = {}) {
  p.font = font;
  p.fillStyle = color;
  p.textBaseline = "top";
  p.fillText(text, x, y);
  p.textBaseline = "alphabetic";
  return bossCardLineHeight(font);
}

// Investment-tier pill: the release's own shipped tier string in a flat
// chip, same green-on-panel treatment as the HTML card's reused .invest-pill
// — never a derived letter grade (2026-10 review fix).
function drawBossCardTierPill(p, x, y, tier) {
  if (!tier) return 0;
  return drawBossCardChip(p, x, y, tier, PALETTE.panelRaised, { textColor: PALETTE.good, height: 32, font: `700 20px ${MONO}` });
}

// Truncates to fit one line (tile moveset text), appending an ellipsis —
// canvas text has no CSS text-overflow, so this is the manual equivalent.
function bossCardFitText(p, text, maxWidth, font) {
  p.font = font;
  if (p.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && p.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function bossCardMovesetRows(data) {
  return [
    ...data.raidAttackers.map((row) => ({
      role: row.attackingType, tier: row.investmentTier, rank: row.rank,
      moveset: `${moveText(row.fastMove, row.eliteFastTM)} + ${moveText(row.chargedMove, row.eliteChargedTM)}`,
    })),
    ...data.pvp.map((row) => ({
      role: row.league, tier: row.investmentTier, rank: row.rank,
      moveset: `${moveText(row.fastMove, row.eliteFastTM)} + ${row.chargedMoves.map((m) => moveText(m, row.eliteChargedTM)).join(" / ")}`,
    })),
  ];
}

// One "<role> <tier pill> rank #N" line plus its (possibly wrapped) moveset
// line(s) below, fully top-anchored — returns the row's real height (role
// line + however many moveset lines actually wrapped) so the next row's
// cursor never guesses a fixed height that a long moveset could blow past.
function drawBossCardMovesetRow(p, x, y, width, row) {
  const roleFont = `700 28px ${DISPLAY}`;
  const roleLineHeight = bossCardLineHeight(roleFont);
  p.font = roleFont;
  p.fillStyle = PALETTE.text;
  p.textBaseline = "top";
  p.fillText(row.role, x, y);
  const roleWidth = Math.ceil(p.measureText(row.role).width);
  let chipX = x + roleWidth + 14;
  const chipY = y + Math.max(0, (roleLineHeight - 32) / 2);
  chipX += drawBossCardTierPill(p, chipX, chipY, row.tier) + 10;
  p.font = `22px ${MONO}`;
  p.fillStyle = PALETTE.muted;
  p.textBaseline = "top";
  p.fillText(`rank #${row.rank}`, chipX, y + Math.max(0, (roleLineHeight - 22) / 2));
  let cursorY = y + roleLineHeight + 6;
  const movesetFont = `22px ${DISPLAY}`;
  const movesetLineHeight = bossCardLineHeight(movesetFont);
  p.font = movesetFont;
  p.fillStyle = PALETTE.muted;
  p.textBaseline = "top";
  for (const line of wrapText(p, row.moveset, width)) {
    p.fillText(line, x, cursorY);
    cursorY += movesetLineHeight;
  }
  p.textBaseline = "alphabetic";
  return cursorY - y;
}

const BOSS_CARD_SECTION_GAP = 32;
const BOSS_CARD_HEADER_TOP = 150; // clears drawChassis's "BOSS CARD" kicker (ends ~y=114)
const BOSS_CARD_FOOTER_CLEARANCE = 120; // room for drawChassis's footer text + margin

// The whole card, header through counter tiles, run through the painter
// facade above — `dry` additionally gates the async sprite loads (a dry
// pass only needs heights, never pixels, so it skips the network/File I/O
// entirely). Returns the final cursor y, i.e. the content's real height.
async function layoutBossCard(p, dry, data, left, contentWidth, documentObject) {
  let y = BOSS_CARD_HEADER_TOP;
  const spriteSize = 140;
  const mainImage = (!dry && data.spritePath) ? await loadImage(documentObject, data.spritePath) : null;
  if (mainImage) {
    p.drawImage(mainImage, left, y, spriteSize, spriteSize);
  } else {
    p.fillStyle = bossCardTypeColor(data.types[0]);
    p.beginPath();
    p.arc(left + spriteSize / 2, y + spriteSize / 2, spriteSize / 2, 0, Math.PI * 2);
    p.fill();
  }
  const headerX = left + spriteSize + 30;
  const headerWidth = contentWidth - spriteSize - 30;
  p.font = `700 50px ${DISPLAY}`;
  p.fillStyle = PALETTE.text;
  p.textAlign = "left";
  p.textBaseline = "alphabetic";
  p.fillText(data.name, headerX, y + 46);
  const chipRowHeight = drawBossCardChipRow(p, headerX, y + 64, headerWidth, data.types.map((type) => ({ type })), () => "");
  let headerLineY = y + 64 + chipRowHeight + 16;
  if (data.window) {
    p.fillStyle = PALETTE.warn;
    p.font = `700 24px ${MONO}`;
    p.textBaseline = "top";
    p.fillText(data.window, headerX, headerLineY);
    headerLineY += bossCardLineHeight(`700 24px ${MONO}`) + 6;
  }
  y = Math.max(y + spriteSize, headerLineY) + BOSS_CARD_SECTION_GAP;

  if (data.catchCp) {
    const boxWidth = (contentWidth - 20) / 2;
    const boxHeight = 108;
    const drawCpBox = (x, label, min, hundo) => {
      p.fillStyle = PALETTE.panel;
      p.fillRect(x, y, boxWidth, boxHeight);
      p.fillStyle = PALETTE.muted;
      p.font = `700 22px ${MONO}`;
      p.textBaseline = "alphabetic";
      p.fillText(label, x + 18, y + 32);
      p.fillStyle = PALETTE.lens;
      p.font = `700 34px ${MONO}`;
      p.fillText(`${min}-${hundo}`, x + 18, y + 80);
    };
    drawCpBox(left, "CATCH CP", data.catchCp.normalMin, data.catchCp.normalHundo);
    drawCpBox(left + boxWidth + 20, "BOOSTED CP", data.catchCp.boostedMin, data.catchCp.boostedHundo);
    y += boxHeight + 20;
  }
  if (data.raidHour) {
    p.fillStyle = PALETTE.lens;
    p.font = `700 22px ${MONO}`;
    p.textBaseline = "top";
    p.fillText(`Raid Hour: ${data.raidHour}`, left, y);
    y += bossCardLineHeight(`700 22px ${MONO}`) + 10;
  }
  if (data.trainersNeeded) {
    p.font = `22px ${DISPLAY}`;
    const lineHeight = bossCardLineHeight(`22px ${DISPLAY}`);
    p.fillStyle = PALETTE.text;
    p.textBaseline = "top";
    let cursorY = y;
    for (const line of wrapText(p, `Trainers needed: ${data.trainersNeeded}`, contentWidth)) {
      p.fillText(line, left, cursorY);
      cursorY += lineHeight;
    }
    y = cursorY + 10;
  }
  if (data.catchCp || data.raidHour || data.trainersNeeded) y += BOSS_CARD_SECTION_GAP - 10;

  if (data.weakTo.length) {
    y += drawBossCardLabel(p, left, y, "WEAK TO");
    y += 8;
    y += drawBossCardChipRow(p, left, y, contentWidth, data.weakTo, (row) => (row.isDouble ? "4x" : "2x"));
    y += BOSS_CARD_SECTION_GAP;
  }
  if (data.resists.length) {
    y += drawBossCardLabel(p, left, y, "RESISTS");
    y += 8;
    y += drawBossCardChipRow(p, left, y, contentWidth, data.resists, (row) => (row.isDouble ? "0.39x" : "0.625x"));
    y += BOSS_CARD_SECTION_GAP;
  }

  const movesetRows = bossCardMovesetRows(data);
  if (movesetRows.length) {
    y += drawBossCardLabel(p, left, y, "MOVESETS & RATINGS", { font: `700 22px ${MONO}` });
    y += 14;
    for (const row of movesetRows) {
      y += drawBossCardMovesetRow(p, left, y, contentWidth, row) + 18;
    }
    y += BOSS_CARD_SECTION_GAP - 18;
  }

  if (data.counters) {
    const groups = [
      ["MEGA", data.counters.mega], ["SHADOW", data.counters.shadow],
      ["LEGENDARY / MYTHICAL", data.counters.legendaryMythical], ["GENERAL", data.counters.general],
    ].filter(([, rows]) => rows.length);
    const gap = 16;
    const tileWidth = (contentWidth - gap * 2) / 3;
    const tileHeight = 150;
    for (const [label, rows] of groups) {
      y += drawBossCardLabel(p, left, y, label, { font: `700 22px ${MONO}`, color: PALETTE.lens });
      y += 14;
      let x = left;
      for (const row of rows) {
        const image = (!dry && row.spritePath) ? await loadImage(documentObject, row.spritePath) : null;
        p.fillStyle = PALETTE.panel;
        p.fillRect(x, y, tileWidth, tileHeight);
        if (image) {
          p.drawImage(image, x + (tileWidth - 56) / 2, y + 10, 56, 56);
        } else {
          p.fillStyle = bossCardTypeColor(row.attackingType);
          p.beginPath();
          p.arc(x + tileWidth / 2, y + 38, 28, 0, Math.PI * 2);
          p.fill();
        }
        p.textAlign = "center";
        p.textBaseline = "alphabetic";
        p.fillStyle = PALETTE.text;
        p.font = `700 22px ${DISPLAY}`;
        p.fillText(bossCardFitText(p, row.pokemon, tileWidth - 20, `700 22px ${DISPLAY}`), x + tileWidth / 2, y + 90);
        p.fillStyle = PALETTE.muted;
        p.font = `18px ${MONO}`;
        p.fillText(`#${row.rank} ${row.attackingType}`, x + tileWidth / 2, y + 112);
        const moveLine = `${moveText(row.fastMove, row.eliteFastTM)} + ${moveText(row.chargedMove, row.eliteChargedTM)}`;
        p.font = `16px ${MONO}`;
        p.fillText(bossCardFitText(p, moveLine, tileWidth - 20, `16px ${MONO}`), x + tileWidth / 2, y + 134);
        p.textAlign = "left";
        x += tileWidth + gap;
      }
      y += tileHeight + BOSS_CARD_SECTION_GAP;
    }
  }
  return y;
}

// Real infographic within the existing canvas card system: boss sprite
// (drawInstanceCard's own loadImage, reused), name + type-colored chips, two
// CP boxes (plus Raid Hour / trainers-needed lines near them), weak-to/
// resists as colored multiplier chips, a movesets block (raid attacker rows
// + whichever PvP leagues are present), each rated by the release's own
// shipped investmentTier (no derived grade), and the four counter groups as
// a 3-wide sprite tile grid. Dark dex palette throughout — not a copy of any
// third-party reference infographic's branding.
//
// Height-driven (2026-10 review, item 5): a canvas's size can't change
// mid-draw without clearing it, so this runs the shared layout function
// once dry (no pixels, just the real measureText calls) to learn the
// content's actual height, resizes the canvas to fit (never smaller than
// the spec default), then runs it again for real.
async function drawBossCard(ctx, spec, data, documentObject, canvas) {
  const left = 90;
  const contentWidth = spec.width - left * 2;
  const contentBottom = await layoutBossCard(bossCardPainter(ctx, true), true, data, left, contentWidth, documentObject);
  // Floor at the shared card height, not the boss spec: a boss without a raid
  // target has little to draw and shouldn't be padded half empty.
  const finalHeight = Math.max(CARD_HEIGHT, Math.ceil(contentBottom) + BOSS_CARD_FOOTER_CLEARANCE);
  if (canvas) canvas.height = finalHeight;
  drawChassis(ctx, spec.width, finalHeight, "Boss card");
  await layoutBossCard(bossCardPainter(ctx, false), false, data, left, contentWidth, documentObject);
}

function drawGymLineupCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "Gym defense");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 52px ${DISPLAY}`;
  ctx.fillText(data.gymName ?? "6 leads placed", 120, 210);
  let y = 260;
  if (data.team) {
    ctx.fillStyle = PALETTE.team[data.team];
    ctx.font = `700 30px ${MONO}`;
    ctx.fillText(`Team ${data.team.toUpperCase()}`, 120, y);
    y += 40;
  }
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `26px ${MONO}`;
  ctx.fillText("gym.lineupLeads · 3 fixed anchors + 3 computed", 120, y);
  y += 60;
  const rowWidth = width - 240;
  for (const lead of data.leads) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(120, y, rowWidth, 134);
    ctx.textBaseline = "middle";
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 38px ${DISPLAY}`;
    ctx.fillText(lead.pokemon, 150, y + 38);
    ctx.fillStyle = tierColor(lead.tier);
    ctx.font = `700 28px ${MONO}`;
    ctx.fillText(`Tier ${lead.tier ?? "—"} · solo rank #${lead.rank}`, 150, y + 84);
    if (Number.isFinite(lead.score)) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `24px ${MONO}`;
      ctx.fillText(`Score ${lead.score}`, 150, y + 118);
    }
    if (lead.cp) {
      ctx.textAlign = "right";
      ctx.fillStyle = PALETTE.lens;
      ctx.font = `700 32px ${MONO}`;
      ctx.fillText(`${lead.cp} CP`, 120 + rowWidth - 20, y + 50);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `20px ${MONO}`;
      ctx.fillText("Lv40 hundo ref", 120 + rowWidth - 20, y + 88);
      ctx.textAlign = "left";
    }
    ctx.textBaseline = "alphabetic";
    y += 150;
  }
}

function drawTrophyCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "My trophy case");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 60px ${DISPLAY}`;
  ctx.fillText("Hundo Wall", 120, 240);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `32px ${MONO}`;
  const summary = TROPHY_SHELVES
    .filter((shelf) => data.counts[shelf.key] > 0)
    .map((shelf) => `${data.counts[shelf.key]} ${data.counts[shelf.key] === 1 ? shelf.label : shelf.plural}`)
    .join(" · ");
  ctx.fillText(summary, 120, 290);
  let y = 380;
  const rowWidth = width - 240;
  for (const pick of data.picks) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(120, y, rowWidth, 104);
    ctx.textBaseline = "middle";
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 34px ${DISPLAY}`;
    ctx.fillText(pick.pokemon, 150, y + 36);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `24px ${MONO}`;
    ctx.fillText(`Top ${pick.label}`, 150, y + 76);
    ctx.textAlign = "right";
    ctx.fillStyle = PALETTE.lens;
    ctx.font = `700 32px ${MONO}`;
    ctx.fillText(`CP ${pick.cp}`, 120 + rowWidth - 20, y + 52);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    y += 120;
  }
}

function drawRotationPackCard(ctx, { width }, data) {
  drawChassis(ctx, width, CARD_HEIGHT, "Raid rotation");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 56px ${DISPLAY}`;
  ctx.fillText("Today's rotation", 120, 220);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `28px ${MONO}`;
  ctx.fillText(`${data.bosses.length} ranked boss${data.bosses.length === 1 ? "" : "es"}`, 120, 260);
  let y = 320;
  const rowWidth = width - 240;
  for (const boss of data.bosses) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(120, y, rowWidth, 114);
    ctx.textBaseline = "middle";
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 34px ${DISPLAY}`;
    ctx.fillText(boss.name, 150, y + 34);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `22px ${MONO}`;
    ctx.fillText(`${boss.tier ?? "Boss"} · rank #${boss.rank} ${boss.attackingType}`, 150, y + 74);
    ctx.fillStyle = PALETTE.lens;
    ctx.font = `700 26px ${MONO}`;
    ctx.fillText(boss.investmentTier, 150, y + 100);
    if (boss.endsAt) {
      ctx.textAlign = "right";
      ctx.fillStyle = PALETTE.warn;
      ctx.font = `24px ${MONO}`;
      ctx.fillText(`through ${boss.endsAt}`, 120 + rowWidth - 20, y + 34);
      ctx.textAlign = "left";
    }
    ctx.textBaseline = "alphabetic";
    y += 130;
    if (y > CARD_HEIGHT - 150) break; // fixed card height — cap rows, never overflow the chassis
  }
}

function loadImage(documentObject, src) {
  return new Promise((resolve) => {
    const img = documentObject.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function canvasToBlob(canvas) {
  if (typeof canvas.convertToBlob === "function") return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") return resolve(null);
    canvas.toBlob((blob) => resolve(blob ?? null), "image/png");
  });
}

function cardFilename(type, data) {
  if (type === "instance") return `field-guide-${safeSlug(data.name)}.png`;
  if (type === "gymDefense") return `field-guide-gym-defense-${safeSlug(data.playerName)}.png`;
  if (type === "raidPlan") return `field-guide-tonights-plan-${safeSlug(data.name)}.png`;
  if (type === "gymLineup") return `field-guide-gym-lineup-${safeSlug(data.gymName ?? "leads")}.png`;
  if (type === "trophyCard") return "field-guide-trophy-case.png";
  if (type === "rotationPack") return "field-guide-raid-rotation.png";
  if (type === "verdict") return `field-guide-verdict-${safeSlug(data.name)}.png`;
  if (type === "cupTeam") return `field-guide-${safeSlug(data.cupName)}-team.png`;
  if (type === "bossCard") return `field-guide-boss-card-${safeSlug(data.name)}.png`;
  return "field-guide-triage.png";
}

// Renders the given card type to a PNG blob. Returns null when the type is
// unknown or its data guard rejected (see `*CardData` above) — callers
// should already have checked the guard before offering the button, this is
// a second, cheap backstop.
export async function renderShareCard(type, data, { documentObject = globalThis.document } = {}) {
  const spec = CARD_SPECS[type];
  if (!spec || !data || !documentObject?.createElement) return null;
  const canvas = documentObject.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  if (type === "gymDefense") drawGymDefenseCard(ctx, spec, data);
  else if (type === "triageSummary") drawTriageSummaryCard(ctx, spec, data);
  else if (type === "instance") await drawInstanceCard(ctx, spec, data, documentObject);
  else if (type === "raidPlan") drawRaidPlanCard(ctx, spec, data);
  else if (type === "gymLineup") drawGymLineupCard(ctx, spec, data);
  else if (type === "trophyCard") drawTrophyCard(ctx, spec, data);
  else if (type === "rotationPack") drawRotationPackCard(ctx, spec, data);
  else if (type === "verdict") drawVerdictCard(ctx, spec, data);
  else if (type === "cupTeam") drawCupTeamCard(ctx, spec, data);
  else if (type === "bossCard") await drawBossCard(ctx, spec, data, documentObject, canvas);
  else return null;
  const blob = await canvasToBlob(canvas);
  if (!blob || !blob.size) return null;
  // canvas.width/height (not spec.width/height): bossCard resizes its own
  // canvas to fit its content (2026-10 review, item 5) — every other type
  // never touches canvas dimensions, so this is a no-op for them.
  return { blob, width: canvas.width, height: canvas.height, filename: cardFilename(type, data) };
}

function downloadBlob(blob, filename, { documentObject, windowObject }) {
  if (!documentObject?.createElement || !windowObject?.URL?.createObjectURL) return false;
  const url = windowObject.URL.createObjectURL(blob);
  const link = documentObject.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  windowObject.URL.revokeObjectURL(url);
  return true;
}

// Renders the card, then either hands it to the OS share sheet (files share,
// e.g. iOS/Android) or falls back to a plain download — same fallback shape
// as the JSON exports elsewhere in this app (backup/roster/feedback).
export async function shareOrDownloadCard(type, data, {
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  navigatorObject = globalThis.navigator,
} = {}) {
  const card = await renderShareCard(type, data, { documentObject });
  if (!card) return "no-data";
  const file = typeof File === "function" ? new File([card.blob], card.filename, { type: "image/png" }) : null;
  if (file && navigatorObject?.share && navigatorObject.canShare?.({ files: [file] })) {
    try {
      await navigatorObject.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  return downloadBlob(card.blob, card.filename, { documentObject, windowObject }) ? "downloaded" : "unavailable";
}
