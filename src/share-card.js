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
  const parsed = new Date(dateString);
  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

function liveRotationBosses(currentBosses, now) {
  return (currentBosses?.bosses ?? []).filter((boss) => !(typeof boss?.endsAt === "string"
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
  else return null;
  const blob = await canvasToBlob(canvas);
  if (!blob || !blob.size) return null;
  return { blob, width: spec.width, height: spec.height, filename: cardFilename(type, data) };
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
