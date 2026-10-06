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
  const kinds = [];
  for (let x = 0; x < width; x += 1) {
    const i = x * 4;
    kinds.push(classifyBarPixel(row[i], row[i + 1], row[i + 2]));
  }
  // The bar is three segments separated by grey gaps. A grey run with fill on
  // both sides is a gap inside the filled part, not unfilled track: counting
  // it as track read every full bar as ~97.8% (2026-10-05, 12 real screenshots).
  const firstTrack = kinds.indexOf("track");
  const lastFilled = kinds.lastIndexOf("filled");
  for (let x = Math.max(0, firstTrack); x >= 0 && x < lastFilled; x += 1) {
    if (kinds[x] === "track" && kinds.slice(0, x).includes("filled")) kinds[x] = "filled";
  }
  let filled = 0;
  let track = 0;
  for (const kind of kinds) {
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

// Colour-detected rows (2026-10-05): the appraisal panel is not always the
// full-screen card the proportional guess assumes. It also pops up over the
// mon-info screen (bottom-left, behind the team leader), and Tesseract can
// miss the Attack/Defense/HP labels there, so there are no anchors either.
// The bars themselves are unmistakable: three equal-width horizontal runs of
// orange/pink fill + mid-grey track, stacked top to bottom. Finds them by
// colour. White card background is excluded here (the plain classifier calls
// it "track"), or the whole card would read as one giant bar.
function isBarPixel(r, g, b) {
  const kind = classifyBarPixel(r, g, b);
  return kind === "filled" || (kind === "track" && Math.max(r, g, b) <= 245);
}

export function detectBarRows({ data, width, height }) {
  const bands = [];
  let current = null;
  // A bar row's segment gaps are a few px; anything wider ends the run (the
  // team leader standing beside the panel is bar-coloured too).
  const maxGap = Math.max(2, Math.round(width * 0.01));
  for (let y = 0; y < height; y += 1) {
    let best = null;
    let run = null;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!isBarPixel(data[i], data[i + 1], data[i + 2])) continue;
      if (run && x - run.x1 <= maxGap) {
        run.x1 = x;
        run.count += 1;
      } else {
        run = { x0: x, x1: x, count: 1 };
      }
      if (!best || run.count > best.count) best = run;
    }
    const x0 = best?.x0 ?? -1;
    const x1 = best?.x1 ?? -1;
    const extent = x1 - x0 + 1;
    // A bar row: one long, dense run that stops well short of full width
    // (full-width grey strips are dialog/panel backgrounds, not bars).
    const isBarRow = Boolean(best) && best.count >= width * 0.15 && extent <= width * 0.8 && best.count >= extent * 0.85;
    if (!isBarRow) {
      current = null;
      continue;
    }
    if (current && y === current.y1 + 1 && Math.abs(x0 - current.x0) <= width * 0.02) {
      current.y1 = y;
      current.x1 = Math.max(current.x1, x1);
    } else {
      current = { y0: y, y1: y, x0, x1 };
      bands.push(current);
    }
  }
  // Three bars share a left edge, a width and a thickness; take the first
  // such triple, top to bottom = Attack / Defense / HP. Not necessarily
  // adjacent bands: anything bar-coloured beside the panel (the team leader)
  // forms its own bands in between.
  const real = bands.filter((band) => band.y1 - band.y0 >= height * 0.004);
  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  // The bars are the widest such trio on screen.
  let bestTrio = null;
  for (const [i, a] of real.entries()) {
    const thickness = a.y1 - a.y0;
    const trio = [a, ...real.slice(i + 1).filter((band) => near(band.x0, a.x0, width * 0.02)
      && near(band.x1, a.x1, width * 0.02) && near(band.y1 - band.y0, thickness, Math.max(3, thickness * 0.5)))].slice(0, 3);
    if (trio.length === 3 && (!bestTrio || a.x1 - a.x0 > bestTrio[0].x1 - bestTrio[0].x0)) bestTrio = trio;
  }
  if (bestTrio) {
    const [atk, def, sta] = bestTrio.map((band) => ({ y: Math.round((band.y0 + band.y1) / 2), x0: band.x0, x1: band.x1 + 1 }));
    return { atk, def, sta };
  }
  return null;
}

// Appraisal screen order, top to bottom, is Attack / Defense / HP — same
// order the in-game screen and this repo's own STAR_TIER_RANGES narrowing
// assume elsewhere (instances.js). "sta" is this repo's field name for the
// HP/Stamina IV throughout (ivCandidatesFromCpHp, buildInstance).
function barRowGeometry(width, height, anchors, pixels = null) {
  // Colour detection first (2026-10-05): it reads all 13 operator fixtures
  // at five resolutions. Label anchors came second for a reason — the first
  // "HP" word on screen is the "86 / 86 HP" line, not the bar label, which
  // put the stamina scanline on the wrong row (Seedot read 0/6/0).
  const detected = pixels ? detectBarRows(pixels) : null;
  if (detected) return { mode: "detected", ...detected };
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

    const geometry = barRowGeometry(canvas.width, canvas.height, anchors, ctx.getImageData(0, 0, canvas.width, canvas.height));
    const evidence = [];
    if (geometry.mode === "detected") {
      evidence.push("geometry: no complete label anchors — bars found by colour");
    } else if (geometry.mode === "proportional") {
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
    return { ivs, confidence: geometry.mode === "proportional" ? "unreliable" : "exact", evidence };
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

// ---- Shadow aura (2026-10-05) ----
// A shadow Pokémon's info screen sits on a dark purple field with purple
// flames around the sprite; normal screens use the sky or a navy night sky.
// Score = share of the sprite band's pixels that are saturated purple
// (hue 260-300°). Measured on 13 of the operator's own screenshots: the one
// shadow (Deino) scored 0.049; every normal scored 0.000 except Zacian at
// 0.018 (a purple "Max Moves" banner edge). One positive example is thin, so
// callers SUGGEST a switch to the shadow form — never apply it silently.
export const SHADOW_AURA_MIN = 0.03;

export function shadowAuraScore({ data, width, height }) {
  const x0 = Math.round(width * 0.1);
  const x1 = Math.round(width * 0.9);
  const y0 = Math.round(height * 0.06);
  const y1 = Math.round(height * 0.36);
  const step = Math.max(1, Math.round(width / 330));
  let purple = 0;
  let total = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      total += 1;
      if (max < 0.35 || max === 0 || (max - min) / max < 0.45) continue;
      const d = max - min;
      let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hue = (hue * 60 + 360) % 360;
      if (hue >= 260 && hue <= 300) purple += 1;
    }
  }
  return total ? purple / total : 0;
}

export async function readShadowAura(file, { documentObject = globalThis.document } = {}) {
  if (typeof createImageBitmap !== "function" || !documentObject?.createElement) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = documentObject.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return shadowAuraScore(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    return null;
  }
}

// ---- HP bar anchor (2026-10-05) ----
// The green HP bar sits directly under the species name and directly above
// the "25 / 25 HP" text on every mon-info screen (45.0% of height on all 13
// operator fixtures). When the full-frame OCR misses the HP word, this pixel
// anchor still places the name and HP-text retries. Mint green: high G,
// G well above R. Returns { y0, y1, x0, x1 } or null.
//
// iPad fixtures (2026-10-06): Tarountula's bug-type backdrop draws big green
// bokeh circles that are wide enough (4:3 is wider relative to height than
// iPhone's 19.5:9) to pass the width*0.3 run check below. The real bar is
// thin — 17-20px, ~0.6-0.7% of height, on every iPhone and iPad fixture seen
// so far — while that backdrop circle is ~8% of height. Reject anything that
// thick and keep scanning instead of returning the first wide green run.
//
// Also iPad (same date): the open-appraisal card dims to a blue tint on the
// iPad layout (not on iPhone's), which pulls the bar's blue channel up
// almost to G (e.g. rgb(65,174,162) vs the undimmed rgb(128,238,192)) and
// failed the old "G - B > 20" check. G still clearly leads B even dimmed, so
// the bar stays "G is the highest channel" (G >= B) rather than needing a gap.
export function findHpBar({ data, width, height }) {
  const isGreen = (i) => data[i + 1] > 170 && data[i + 1] - data[i] > 50 && data[i + 1] >= data[i + 2] && data[i] < 200;
  const maxThickness = Math.max(1, Math.round(height * 0.02));
  let found = null;
  for (let y = Math.round(height * 0.25); y < Math.round(height * 0.7); y += 1) {
    let run = 0;
    let start = 0;
    let best = null;
    for (let x = 0; x < width; x += 1) {
      if (isGreen((y * width + x) * 4)) {
        if (run === 0) start = x;
        run += 1;
        if (!best || run > best.len) best = { len: run, x0: start, x1: x };
      } else run = 0;
    }
    const isBar = best && best.len > width * 0.3;
    if (isBar && !found) found = { y0: y, y1: y, x0: best.x0, x1: best.x1 };
    else if (isBar && found && y === found.y1 + 1) found.y1 = y;
    else if (found) {
      if (found.y1 - found.y0 <= maxThickness) return found;
      found = null;
    }
  }
  if (found && found.y1 - found.y0 > maxThickness) found = null;
  return found;
}

export async function readHpBar(file, { documentObject = globalThis.document } = {}) {
  if (typeof createImageBitmap !== "function" || !documentObject?.createElement) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = documentObject.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const bar = findHpBar(ctx.getImageData(0, 0, canvas.width, canvas.height));
    return bar ? { ...bar, width: canvas.width, height: canvas.height } : null;
  } catch {
    return null;
  }
}
