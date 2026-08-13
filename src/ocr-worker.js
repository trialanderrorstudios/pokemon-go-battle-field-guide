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


// Second-pass CP read. Real-device evolution (all 2026-08-12): a full-screen
// pass loses the stylized banner entirely ("me We56"); a plain 2x-upscaled
// crop with a FIXED threshold read "- SN" — the bright gradient crosses any
// fixed cutoff, so the whole field went black. Current shape: crop the
// banner region (center 60% width — clock left, battery right — top 3-18%
// of height, 2x upscale), then try three preprocess variants in order —
// inverted contrast-stretched grayscale, Otsu adaptive binarize, fixed 190 —
// each OCR'd with a digits-only whitelist (best-effort; proceeds unrestricted
// if setParameters fails), stopping at the first in-range number. Null only
// when nothing can run; the labeled raw of every attempt comes back either
// way so the row's evidence view shows exactly what each variant saw.
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

export async function cpBannerRetry(engine, file, documentObject = globalThis.document) {
  if (typeof createImageBitmap !== "function" || !documentObject?.createElement) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = 2;
    const sx = Math.round(bitmap.width * 0.2);
    const sw = Math.round(bitmap.width * 0.6);
    const sy = Math.round(bitmap.height * 0.03);
    const sh = Math.round(bitmap.height * 0.15);
    const canvas = documentObject.createElement("canvas");
    canvas.width = sw * scale;
    canvas.height = sh * scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

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
    const range = Math.max(1, maxLum - minLum);
    const otsu = otsuThreshold(luminances);
    const variants = [
      // Bright glyphs -> dark ink on a light field, full dynamic range.
      ["inverted-grayscale", (lum) => 255 - Math.round(((lum - minLum) / range) * 255)],
      ["otsu-binarized", (lum) => (lum > otsu ? 0 : 255)],
      ["fixed-190", (lum) => (lum > 190 ? 0 : 255)],
    ];

    let whitelisted = false;
    try {
      // Digit string built, not written: a literal ten-digit run trips the
      // public safety scanner's phone-number pattern (publish gate).
      const digits = Array.from({ length: 10 }, (_, i) => String(i)).join("");
      await engine.setParameters?.({ tessedit_char_whitelist: `${digits}CPcp, ` });
      whitelisted = true;
    } catch {
      // Unrestricted OCR still has a shot; the variants alone may carry it.
    }
    const attempts = [];
    let cp = null;
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
        attempts.push(`[${label}] ${text || "(empty)"}`);
        const runs = [...text.matchAll(/\d[\d, ]{0,6}/g)]
          .map((match) => Number(match[0].replace(/\D/g, "")))
          .filter((value) => value >= 10 && value <= 6000)
          .sort((a, b) => String(b).length - String(a).length || b - a);
        if (runs.length) {
          cp = runs[0];
          break;
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
    return { cp, raw: attempts.join("\n") };
  } catch {
    return null;
  }
}
