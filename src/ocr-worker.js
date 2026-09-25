// Thin lifecycle wrapper around the vendored Tesseract OCR engine
// (web/vendor/tesseract/, scripts/fetch-ocr-engine.mjs). createOcrEngine()
// spawns the worker only when called — never at boot — matching the task's
// "first time Scan is tapped" requirement; app.js calls it from the
// data-ocr-file-input change handler, not on module load.
//
// No main-thread tesseract.js API wrapper is vendored (checked
// web/vendor/tesseract/: only worker.min.js — the worker-script bundle — and
// the wasm cores/traineddata). So this drives worker.min.js's raw
// postMessage protocol directly, confirmed against tesseract.js@7.0.0's own
// source (createWorker.js / worker-script/index.js / worker/browser/*.js):
//   main thread -> worker: {workerId, jobId, action, payload}
//   worker -> main thread: {workerId, jobId, action, status, data}
//     status: 'resolve' | 'reject' | 'progress'
// Actions used here, in order: 'load' (boots the wasm core), 'loadLanguage'
// (fetches eng.traineddata.gz), 'initialize' (starts the Tesseract API),
// 'recognize' (one image -> { text, ... }).
//
// corePath/langPath are resolved to absolute URLs via import.meta.url before
// being sent into the worker's payload. They MUST be absolute: the worker
// resolves a relative corePath against its own script location (self.location
// inside a Worker), not the page's — a document-relative "./vendor/..." string
// would double up under the worker's own vendor/tesseract/ location.
const VENDOR_BASE = new URL("../vendor/tesseract/", import.meta.url);
const WORKER_PATH = new URL("worker.min.js", VENDOR_BASE).href;
// SIMD-only core (tesseract-core-simd-lstm.js — matches the vendored file,
// see scripts/fetch-ocr-engine.mjs / data/sources/ocr-engine-manifest.json).
// ponytail: no non-SIMD fallback dispatch — SIMD wasm is near-universal by
// 2026, and a device without it fails the single load attempt below and
// surfaces the same honest 'error' status as any other engine failure (see
// OcrEngineError below). Add real feature-detection + a
// tesseract-core-lstm.js fallback if a real device without SIMD shows up.
const CORE_PATH = new URL("tesseract-core-simd-lstm.js", VENDOR_BASE).href;
const LANG_PATH = VENDOR_BASE.href;
const LANGS = "eng";
// Tesseract OEM (OCR Engine Mode) constant — LSTM_ONLY. Matches the
// lstmOnly:true core/language options above; not vendored as a module (see
// tesseract.js's constants/OEM.js), so inlined with this comment instead.
const OEM_LSTM_ONLY = 1;

// Typed failure the app layer maps to the markup lane's 'error' status +
// same-session fallback to manual quick-add. `reason` is one of:
// 'unsupported' (no WebAssembly), 'load-failed' (engine boot/init failed —
// covers offline first use, wasm blocked by CSP, worker script error),
// 'recognize-failed' (a specific image failed, e.g. quota, engine reject).
export class OcrEngineError extends Error {
  constructor(reason, cause) {
    super(`OCR engine unavailable: ${reason}`);
    this.name = "OcrEngineError";
    this.reason = reason;
    this.cause = cause;
  }
}

let jobCounter = 0;

// Sends one job and resolves/rejects on the matching jobId's terminal status.
// Races against `failureSignal`, a promise that only ever rejects (fired by
// the worker's own onerror — a worker-level script/spawn failure never
// arrives as a job message, so without this race a failed worker would hang
// the caller forever instead of rejecting).
function sendJob(worker, failureSignal, action, payload) {
  jobCounter += 1;
  const jobId = `ocr-job-${jobCounter}`;
  const jobPromise = new Promise((resolve, reject) => {
    const handleMessage = ({ data }) => {
      if (data?.jobId !== jobId) return;
      if (data.status === "resolve") {
        worker.removeEventListener("message", handleMessage);
        resolve(data.data);
      } else if (data.status === "reject") {
        worker.removeEventListener("message", handleMessage);
        reject(data.data);
      }
      // status === 'progress': ignored, no per-job progress UI wired up.
    };
    worker.addEventListener("message", handleMessage);
    worker.postMessage({ workerId: "ocr-worker", jobId, action, payload });
  });
  return Promise.race([jobPromise, failureSignal]);
}

// Lazily creates and initializes a Tesseract worker. Single attempt, no
// retry loop (boot-watchdog.js precedent) — any failure along the way
// (feature-detect, spawn, load, loadLanguage, initialize) terminates the
// worker and rejects with a typed OcrEngineError.
export async function createOcrEngine() {
  if (typeof WebAssembly === "undefined") {
    throw new OcrEngineError("unsupported");
  }

  let worker;
  try {
    worker = new Worker(WORKER_PATH);
  } catch (error) {
    throw new OcrEngineError("load-failed", error);
  }

  const failureSignal = new Promise((_resolve, reject) => {
    worker.onerror = (event) => {
      event?.preventDefault?.();
      reject(new OcrEngineError("load-failed", event?.message ?? event));
    };
  });
  // A failureSignal that's never raced (worker never errors) would otherwise
  // log an unhandled-rejection warning once this function returns.
  failureSignal.catch(() => {});

  try {
    await sendJob(worker, failureSignal, "load", {
      options: { lstmOnly: true, corePath: CORE_PATH, logging: false },
    });
    await sendJob(worker, failureSignal, "loadLanguage", {
      langs: LANGS,
      // cacheMethod: 'none' skips tesseract.js's own IndexedDB cache layer —
      // web/sw.js's OCR_CACHE already serves these vendored files cache-first
      // offline, so a second on-disk copy would be redundant.
      options: { langPath: LANG_PATH, gzip: true, lstmOnly: true, cacheMethod: "none" },
    });
    await sendJob(worker, failureSignal, "initialize", {
      langs: LANGS, oem: OEM_LSTM_ONLY, config: {},
    });
  } catch (error) {
    worker.terminate();
    throw error instanceof OcrEngineError ? error : new OcrEngineError("load-failed", error);
  }

  return {
    // Raw recognized text for one image (File/Blob) — parsing it into a
    // structured draft is ocr-intake.js's job, not this module's.
    async recognize(file) {
      let bytes;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch (error) {
        throw new OcrEngineError("recognize-failed", error);
      }
      try {
        const result = await sendJob(worker, failureSignal, "recognize", {
          image: bytes,
          options: {},
          output: { text: true },
        });
        return result?.text ?? "";
      } catch (error) {
        throw error instanceof OcrEngineError ? error : new OcrEngineError("recognize-failed", error);
      }
    },
    // Same recognize, but ALSO returns per-word bounding boxes (the vendored
    // worker's blocks output — GetJSONText() — which plain recognize()
    // discards). Anchors feed ocr-appraisal-bars.js's bar-row location; the
    // words flatten to [{text, bbox:{x0,y0,x1,y1}}].
    async recognizeDetailed(file) {
      let bytes;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch (error) {
        throw new OcrEngineError("recognize-failed", error);
      }
      try {
        const result = await sendJob(worker, failureSignal, "recognize", {
          image: bytes,
          options: {},
          output: { text: true, blocks: true },
        });
        const words = [];
        for (const block of result?.blocks ?? []) {
          for (const paragraph of block?.paragraphs ?? []) {
            for (const line of paragraph?.lines ?? []) {
              for (const word of line?.words ?? []) {
                if (word?.text && word?.bbox) words.push({ text: word.text, bbox: word.bbox });
              }
            }
          }
        }
        return { text: result?.text ?? "", words };
      } catch (error) {
        throw error instanceof OcrEngineError ? error : new OcrEngineError("recognize-failed", error);
      }
    },
    // Best-effort tesseract variable set (upstream worker-script protocol:
    // action 'setParameters', payload {params} -> SetVariable per key).
    // Throws OcrEngineError on failure; callers that can proceed without it
    // (e.g. the CP retry's digit whitelist) catch and continue.
    async setParameters(params) {
      try {
        await sendJob(worker, failureSignal, "setParameters", { params });
      } catch (error) {
        throw error instanceof OcrEngineError ? error : new OcrEngineError("recognize-failed", error);
      }
    },
    terminate() {
      worker.terminate();
    },
  };
}


// ---- Cropped second-pass field reads ---------------------------------------
//
// Real-device evolution of the CP read (all 2026-08-12): a full-screen pass
// loses the stylized banner entirely ("me We56"); a plain 2x-upscaled crop
// with a FIXED threshold read "- SN" — the bright gradient crosses any fixed
// cutoff, so the whole field went black. What actually works: crop to the
// field, upscale, try several preprocess variants, OCR each with a
// field-specific charset whitelist.
//
// That recipe was CP-only for a year while the primary pass stayed raw
// full-frame (operator, 2026-09-24: the scan "has been absolutely horrible").
// It is now generalized — readCroppedField() is the engine, and each field
// supplies its own region, charset and extractor. Regions prefer real word
// bboxes from recognizeDetailed() over hardcoded proportions, because a
// percentage band is only correct for the aspect ratio it was tuned on.
function otsuThreshold(luminances) {
  const histogram = new Array(256).fill(0);
  for (const value of luminances) histogram[value] += 1;
  const total = luminances.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * histogram[i];
  let sumBack = 0;
  let weightBack = 0;
  let best = 127;
  let bestVariance = -1;
  for (let t = 0; t < 256; t += 1) {
    weightBack += histogram[t];
    if (!weightBack) continue;
    const weightFore = total - weightBack;
    if (!weightFore) break;
    sumBack += t * histogram[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const variance = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

// The four preprocess passes, in the order real devices needed them. Shared
// by every field — the failure modes are the backdrop's, not the glyphs'.
function preprocessVariants({ minLum, maxLum, otsu }) {
  const range = Math.max(1, maxLum - minLum);
  return [
    // Bright glyphs -> dark ink on a light field, full dynamic range.
    ["inverted-grayscale", (lum) => 255 - Math.round(((lum - minLum) / range) * 255)],
    // Sunny-weather screens (Slaking 2026-08-23): the field sits on a BRIGHT
    // background, so text (~255) and backdrop (~200-240) land on the same
    // side of every global threshold and the glyphs dissolve. The text is
    // the brightest thing in the crop — keep only pixels within a whisker of
    // maxLum as ink, everything else paper.
    ["near-white-only", (lum) => (lum >= maxLum - 12 ? 0 : 255)],
    ["otsu-binarized", (lum) => (lum > otsu ? 0 : 255)],
    ["fixed-190", (lum) => (lum > 190 ? 0 : 255)],
  ];
}

// Crop -> upscale -> per-variant preprocess -> whitelisted OCR -> extract.
// `spec` is one field: { label, region(bitmap) -> {sx,sy,sw,sh}, scale,
// whitelist, pick(text) -> {value, score} | null, good(score) -> boolean }.
// `pick` returning a score (not just a value) is what lets a field keep the
// BEST variant rather than the first non-empty one — the difference between
// accepting "Cnarizard" and accepting "|/\|". `good` short-circuits when a
// read is already good enough to stop burning OCR passes on.
// Returns { value, score, raw } — raw is every attempt, labeled, so the row's
// evidence view shows exactly what each variant saw even on a total miss.
async function readCroppedField(engine, file, spec, documentObject = globalThis.document) {
  if (typeof createImageBitmap !== "function" || !documentObject?.createElement) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const box = spec.region(bitmap);
    bitmap.close?.();
    if (!box || box.sw <= 0 || box.sh <= 0) return null;
    const scale = spec.scale ?? 2;
    const source = await createImageBitmap(file);
    const canvas = documentObject.createElement("canvas");
    canvas.width = Math.round(box.sw * scale);
    canvas.height = Math.round(box.sh * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, box.sx, box.sy, box.sw, box.sh, 0, 0, canvas.width, canvas.height);
    source.close?.();

    const base = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const luminances = new Uint8Array(base.data.length / 4);
    let minLum = 255;
    let maxLum = 0;
    for (let i = 0; i < luminances.length; i += 1) {
      const j = i * 4;
      const lum = Math.round(0.299 * base.data[j] + 0.587 * base.data[j + 1] + 0.114 * base.data[j + 2]);
      luminances[i] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }
    const variants = preprocessVariants({ minLum, maxLum, otsu: otsuThreshold(luminances) });

    let whitelisted = false;
    if (spec.whitelist) {
      try {
        await engine.setParameters?.({ tessedit_char_whitelist: spec.whitelist });
        whitelisted = true;
      } catch {
        // Unrestricted OCR still has a shot; the variants alone may carry it.
      }
    }
    const attempts = [];
    let bestValue = null;
    let bestScore = 0;
    try {
      for (const [label, mapLuminance] of variants) {
        const out = ctx.createImageData(canvas.width, canvas.height);
        for (let i = 0; i < luminances.length; i += 1) {
          const j = i * 4;
          const value = mapLuminance(luminances[i]);
          out.data[j] = value;
          out.data[j + 1] = value;
          out.data[j + 2] = value;
          out.data[j + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) continue;
        const text = String(await engine.recognize(blob)).trim();
        const hit = spec.pick(text);
        attempts.push(`[${label}] ${text || "(empty)"}${hit ? ` -> ${hit.value}` : ""}`);
        if (hit && hit.score > bestScore) {
          bestValue = hit.value;
          bestScore = hit.score;
          if (spec.good ? spec.good(hit.score) : true) break;
        }
      }
    } finally {
      if (whitelisted) {
        try {
          await engine.setParameters?.({ tessedit_char_whitelist: "" });
        } catch {
          // A stuck whitelist would poison later full-screen scans in this
          // session — surface it in the evidence rather than silently.
          attempts.push("[warning] whitelist reset failed — restart the scan session if later reads look digit-only");
        }
      }
    }
    return { value: bestValue, score: bestScore, raw: attempts.join("\n") };
  } catch {
    return null;
  }
}

// A word bbox from recognizeDetailed(), or null. `test` picks the anchor word.
function findAnchor(anchors, test) {
  for (const word of anchors ?? []) {
    const bbox = word?.bbox;
    if (!bbox || !Number.isFinite(bbox.y0) || !Number.isFinite(bbox.y1)) continue;
    if (test(String(word.text ?? ""))) return bbox;
  }
  return null;
}

// Contiguous runs of 3+ digits only (commas ok): spaced single digits are
// noise, not a number — "7 8 4" fabricated CP 784 on a real device
// (2026-08-13), and 2-digit reads were battery/junk.
function pickCpDigits(text) {
  const runs = [...String(text).matchAll(/\d[\d,]{2,6}/g)]
    .map((match) => Number(match[0].replace(/\D/g, "")))
    .filter((value) => value >= 100 && value <= 9000)
    .sort((a, b) => String(b).length - String(a).length || b - a);
  return runs.length ? { value: runs[0], score: 1 } : null;
}

// Digit string built, not written: a literal ten-digit run trips the public
// safety scanner's phone-number pattern (publish gate).
const DIGITS = Array.from({ length: 10 }, (_, i) => String(i)).join("");

// Second-pass CP read. Region: the banner, center 60% width (clock left,
// battery right), top 3-18% of height. Kept proportional rather than
// anchor-derived — the anchor for CP would be the CP word itself, and this
// path only runs when the full-frame pass failed to find it.
export async function cpBannerRetry(engine, file, documentObject = globalThis.document) {
  const result = await readCroppedField(engine, file, {
    label: "cp",
    region: (bitmap) => ({
      sx: Math.round(bitmap.width * 0.2),
      sw: Math.round(bitmap.width * 0.6),
      sy: Math.round(bitmap.height * 0.03),
      sh: Math.round(bitmap.height * 0.15),
    }),
    scale: 2,
    whitelist: `${DIGITS}CPcp, `,
    pick: pickCpDigits,
  }, documentObject);
  // Shape preserved for existing callers/tests: { cp, raw }, null when
  // nothing could run.
  return result ? { cp: result.value, raw: result.raw } : null;
}

// The species name band. The game puts the name directly ABOVE the HP line
// (the same positional fact ocr-intake.js's extractNameLine relies on), so
// when the full-frame pass found an HP word we take a band immediately above
// its real bbox. That beats a hardcoded percentage, which is only ever
// correct for the aspect ratio it was tuned on. Falls back to the CP word
// (name sits below it), then to proportions when neither anchor exists.
export function nameRegionFromAnchors(anchors, width, height) {
  const hp = findAnchor(anchors, (text) => /^hp$/i.test(text.trim()));
  if (hp) {
    const lineHeight = Math.max(1, hp.y1 - hp.y0);
    const sy = Math.max(0, Math.round(hp.y0 - lineHeight * 2.6));
    return {
      sx: Math.round(width * 0.1),
      sw: Math.round(width * 0.8),
      sy,
      sh: Math.max(1, Math.round(hp.y0 - lineHeight * 0.3) - sy),
    };
  }
  const cp = findAnchor(anchors, (text) => /^[^a-z0-9]{0,2}[a-z]?p\.?$/i.test(text.trim()));
  if (cp) {
    const lineHeight = Math.max(1, cp.y1 - cp.y0);
    return {
      sx: Math.round(width * 0.1),
      sw: Math.round(width * 0.8),
      sy: Math.round(cp.y1 + lineHeight * 0.4),
      sh: Math.round(lineHeight * 2.2),
    };
  }
  return {
    sx: Math.round(width * 0.1),
    sw: Math.round(width * 0.8),
    sy: Math.round(height * 0.17),
    sh: Math.round(height * 0.12),
  };
}

// Second-pass species-name read. Two things the full-frame pass can't do:
// the charset is constrained to what dex names actually contain (no digits
// to confuse O/0, no punctuation soup), and every variant is SCORED against
// the dex via the injected `scoreName` instead of taking the first non-empty
// line. Scoring is what makes the dictionary a constraint rather than a
// post-hoc repair — a variant reading a near-miss beats one reading garbage,
// and neither is accepted if nothing resembles a real name.
// `scoreName(text) -> 0..1` is injected so this module stays data-free.
export async function nameBannerRetry(engine, file, { anchors = [], scoreName } = {}, documentObject = globalThis.document) {
  if (typeof scoreName !== "function") return null;
  const result = await readCroppedField(engine, file, {
    label: "name",
    region: (bitmap) => nameRegionFromAnchors(anchors, bitmap.width, bitmap.height),
    scale: 3,
    // Dex names: letters, space, the gender glyphs (Nidoran), and the few
    // punctuation marks that appear (Mr. Mime, Farfetch'd, Ho-Oh, parens).
    whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.-()2♀♂",
    pick: (text) => {
      // The band can catch a stray line; score each line, keep the best.
      let best = null;
      for (const line of String(text).split(/\r?\n/)) {
        const candidate = line.trim();
        if (!candidate) continue;
        const score = scoreName(candidate);
        if (score > 0 && (!best || score > best.score)) best = { value: candidate, score };
      }
      return best;
    },
    // An exact dex hit is as good as it gets — stop rather than run three
    // more OCR passes for a score that cannot improve.
    good: (score) => score >= 1,
  }, documentObject);
  return result ? { name: result.value, score: result.score, raw: result.raw } : null;
}
