// Share cards (round 10): canvas-rendered PNGs for the share sheet, drawn in
// the dex chassis identity (chassis red / dark screen / mono+rounded type)
// from the mockup contract — no DOM-screenshot library, just 2D canvas
// drawing so this stays a dependency-free leaf module.
//
// Three card types, one per existing data source — never fabricates a stat,
// only draws what's already stored:
//   gymDefense     — longest-defense leaderboard row (gym-defense-log.js)
//   triageSummary  — triage bucket counts (triage.js)
//   instance       — a single instance's CP/IVs (instances.js) + sprite
//
// Each type has a `*CardData` guard that returns null when the underlying
// data doesn't exist yet — the view layer uses that to decide whether to
// offer the "Share card" button at all.
import { TEAM_SET } from "./storage.js";
import { spritePath, TYPE_COLORS } from "./sprites.js";
import { TRIAGE_BUCKETS } from "./triage.js";
import { formatDefenseDuration } from "./views/gyms.js";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
export const CARD_SPECS = Object.freeze({
  gymDefense: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  triageSummary: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
  instance: Object.freeze({ width: CARD_WIDTH, height: CARD_HEIGHT }),
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
