// Appraisal-screen IV bar reader. The scan pipeline solves IVs from CP+HP
// (instances.js's ivCandidatesFromCpHp), but many CP/HP pairs are ambiguous
// (real case 2026-08-23: Gardevoir CP3005 HP143 -> 8+ candidate spreads).
// The team-leader's appraisal screen also draws the exact IVs as three
// horizontal segmented bars (Attack / Defense / HP, 0-15 pips each, filled
// pink/orange on a light-gray track) — unreadable as OCR text (see
// ocr-intake.js's appraisalTierFromText, which only gets a coarse star tier
// out of the spoken verdict), perfectly readable as pixels. This module
// reads those bars directly from the screenshot and, when the read lands
// exactly on one of the CP/HP solver's candidates, resolves the row outright
// (pickCandidateByBars) instead of leaving the operator a tappable list.
//
// Bbox-availability finding (investigated before writing this, since anchors
// mode was asked to be primary if the plumbing supports it): the vendored
// worker.min.js DOES support word-level bboxes — its recognize handler reads
// `output.blocks` and, when true, calls the wasm core's GetJSONText() for a
// blocks -> paragraphs -> lines -> words tree (each word carries text +
// {x0,y0,x1,y1}). Confirmed by reading the bundled default-options object
// (`{text:true, blocks:false, ...}`) and the result-builder line
// (`blocks:r.blocks&&!a.skipRecognition?JSON.parse(e.GetJSONText()).blocks:null`)
// in web/vendor/tesseract/worker.min.js. BUT ocr-worker.js's exported
// `recognize()` hardcodes `output: { text: true }` and returns only
// `result?.text` — it discards blocks today. So anchors are obtainable from
// the underlying protocol, but NOT from this file alone without an
// ocr-worker.js edit (out of this lane's allowlist). See the WIRING
// CONTRACT note in this repo's task handoff for the exact ocr-worker.js
// change; until then every real call into readAppraisalBars() runs the
// proportional-geometry fallback below with `anchors: null`.
//
// No Date.now(), no network — pure pixel math plus the same environment
// guard style as ocr-worker.js's cpBannerRetry.

// ---- Pure pixel classification (no DOM/canvas — directly unit-testable) ----

// Palette thresholds derived from the described in-game bar colors: filled
// pink ~rgb(255,110,150), filled orange/red (maxed bar) ~rgb(255,60,60),
// track ~rgb(230,230,235). Both filled colors share "high R, R well above G
// and/or B"; the track is bright and low-saturation (R/G/B all close).
export function classifyBarPixel(r, g, b) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const spread = maxC - minC;
  if (spread < 25 && r >= 180 && g >= 180 && b >= 180) return "track";
  if (r >= 180 && (r - g >= 40 || r - b >= 60)) return "filled";
  return "other";
}

// Per-pixel median across N sampled scanlines (odd count ideally), one RGBA
// row out — denoises the single-scanline read the way cpBannerRetry denoises
// via Otsu/contrast-stretch, but per-channel median is enough here since the
// bars are flat-filled, not text glyphs.
export function medianRow(lines) {
  const width = lines[0].length / 4;
  const out = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      const values = lines.map((line) => line[x * 4 + c]).sort((a, b) => a - b);
      out[x * 4 + c] = values[Math.floor(values.length / 2)];
    }
    out[x * 4 + 3] = 255;
  }
  return out;
}

// One bar row's RGBA scanline(s) -> { fraction, iv, filled, track }, or null
// when the row isn't bar-like at all (mostly "other" pixels — a photo edge,
// a misplaced sample band, wrong geometry). Never guesses an IV from a
// handful of accidentally-matching pixels: at least half the row must
// classify as filled-or-track before a fraction is trusted.
export function readBarFromScanlines(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const row = lines.length === 1 ? lines[0] : medianRow(lines);
  const width = row.length / 4;
  let filled = 0;
  let track = 0;
  for (let x = 0; x < width; x += 1) {
    const i = x * 4;
    const kind = classifyBarPixel(row[i], row[i + 1], row[i + 2]);
    if (kind === "filled") filled += 1;
    else if (kind === "track") track += 1;
  }
  const classified = filled + track;
  // ponytail: half-the-row threshold for "this is a real bar-like run" —
  // add a stricter contiguous-run check only if a real screenshot ever
  // produces a false positive at this bar.
  if (classified === 0 || classified < width * 0.5) return null;
  const fraction = filled / classified;
  const iv = fraction > 0.97 ? 15 : Math.max(0, Math.min(15, Math.round(fraction * 15)));
  return { fraction, iv, filled, track };
}

// ---- Bar-row geometry: anchors-supplied (primary) or proportional (fallback) ----

function findAnchorBbox(anchors, patterns) {
  if (!Array.isArray(anchors)) return null;
  for (const word of anchors) {
    const text = String(word?.text ?? "").trim().toLowerCase();
    if (patterns.some((p) => text === p || text.startsWith(p)) && word?.bbox) return word.bbox;
  }
  return null;
}

// A label word's bbox pins the bar row's vertical center exactly; the bar's
// left edge starts just past the label's right edge (gap scaled to text
// height so it holds across image resolutions) and its right edge runs
// close to the image's right margin — the card's actual bar-track right
// edge isn't known from a label bbox alone, so this stays a hair
// conservative rather than risk sampling past the bar into card padding.
function rowFromBbox(bbox, width) {
  const y = Math.round((bbox.y0 + bbox.y1) / 2);
  const gap = Math.max(6, Math.round((bbox.y1 - bbox.y0) * 0.5));
  const x1 = Math.round(width * 0.92);
  const x0 = Math.min(bbox.x1 + gap, x1 - 1);
  return { y, x0, x1 };
}

// Reference-layout fallback when anchors aren't supplied: the appraisal
// card occupies the lower ~half of the screenshot; its three bar rows are
// evenly spaced within that band; each bar runs from ~30% to ~90% of the
// image width (past the label column, short of the right card edge).
// Always geometry-guessed, never treated as exact — see the "unreliable"
// confidence this mode returns in readAppraisalBars.
function proportionalRows(width, height) {
  const bandTop = Math.round(height * 0.5);
  const bandHeight = height - bandTop;
  const rowY = (i) => bandTop + Math.round((bandHeight * (i + 0.5)) / 3);
  const x0 = Math.round(width * 0.3);
  const x1 = Math.round(width * 0.9);
  return {
    atk: { y: rowY(0), x0, x1 },
    def: { y: rowY(1), x0, x1 },
    sta: { y: rowY(2), x0, x1 },
  };
}

// Appraisal screen order, top to bottom, is Attack / Defense / HP — same
// order the in-game screen and this repo's own STAR_TIER_RANGES narrowing
// assume elsewhere (instances.js). "sta" is this repo's field name for the
// HP/Stamina IV throughout (ivCandidatesFromCpHp, buildInstance).
function barRowGeometry(width, height, anchors) {
  const atkBbox = findAnchorBbox(anchors, ["attack"]);
  const defBbox = findAnchorBbox(anchors, ["defense", "defence"]);
  const staBbox = findAnchorBbox(anchors, ["hp", "stamina"]);
  if (atkBbox && defBbox && staBbox) {
    return {
      mode: "anchors",
      atk: rowFromBbox(atkBbox, width),
      def: rowFromBbox(defBbox, width),
      sta: rowFromBbox(staBbox, width),
    };
  }
  return { mode: "proportional", ...proportionalRows(width, height) };
}

const BAR_LABELS = { atk: "atk", def: "def", sta: "sta" };

// Reads a {y, x0, x1} row from a 2D canvas context as 3 denoise-median
// scanlines (y-1, y, y+1 — clamped to the canvas bounds).
function sampleRowLines(ctx, row, canvasHeight) {
  const width = row.x1 - row.x0;
  if (width < 2) return null;
  const startY = Math.max(0, Math.min(canvasHeight - 3, row.y - 1));
  const imageData = ctx.getImageData(row.x0, startY, width, 3);
  return [0, 1, 2].map((i) => imageData.data.subarray(i * width * 4, (i + 1) * width * 4));
}

// file -> { ivs: {atk, def, sta} | null, confidence: "exact"|"unreliable",
// evidence: string[] }. `anchors`, when supplied, is a tesseract-style word
// list (each entry `{ text, bbox: {x0,y0,x1,y1} }`) covering the Attack/
// Defense/HP labels — see the bbox-availability comment at the top of this
// file for why callers can't get this from ocr-worker.js today. `null`
// anchors (or an incomplete set — any of the three labels missing) fall
// back to the proportional layout guess, which is why that path never
// reports "exact" even when all three bars come back readable.
export async function readAppraisalBars(file, { anchors = null, documentObject = globalThis.document } = {}) {
  if (typeof createImageBitmap !== "function" || !documentObject?.createElement) {
    return { ivs: null, confidence: "unreliable", evidence: ["environment: createImageBitmap unavailable — bar read skipped"] };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = documentObject.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const geometry = barRowGeometry(canvas.width, canvas.height, anchors);
    const evidence = [];
    if (geometry.mode === "proportional") {
      evidence.push("geometry: no complete label anchors supplied — using proportional card-layout fallback (not exact)");
    }
    const ivs = {};
    for (const key of ["atk", "def", "sta"]) {
      const row = geometry[key];
      const lines = sampleRowLines(ctx, row, canvas.height);
      const result = lines && readBarFromScanlines(lines);
      if (result) {
        ivs[key] = result.iv;
        evidence.push(`${BAR_LABELS[key]} bar: ${Math.round(result.fraction * 100)}% filled -> ${result.iv}`);
      } else {
        evidence.push(`${BAR_LABELS[key]} bar: no bar-like run found`);
      }
    }

    if (Object.keys(ivs).length < 3) {
      return { ivs: null, confidence: "unreliable", evidence };
    }
    return { ivs, confidence: geometry.mode === "anchors" ? "exact" : "unreliable", evidence };
  } catch (error) {
    return { ivs: null, confidence: "unreliable", evidence: [`error: ${error?.message ?? error}`] };
  }
}

// candidates (ivCandidatesFromCpHp's output shape: [{ ivs: {atk,def,sta},
// level }]) x a bar read -> the one candidate whose ivs exactly match, or
// null. This is the cross-check that makes a bar read trustworthy: a pixel
// misread (wrong threshold, bad geometry) almost never lands exactly on a
// valid CP/HP-solved spread, so an exact match is strong evidence the read
// was real. No match (including a null/empty candidates list or a null
// barIvs) -> null, and the caller keeps the tappable candidate list rather
// than auto-filling a guess.
export function pickCandidateByBars(candidates, barIvs) {
  if (!Array.isArray(candidates) || !barIvs) return null;
  return candidates.find((candidate) => (
    candidate?.ivs?.atk === barIvs.atk && candidate?.ivs?.def === barIvs.def && candidate?.ivs?.sta === barIvs.sta
  )) ?? null;
}
