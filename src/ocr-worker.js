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
    terminate() {
      worker.terminate();
    },
  };
}


// Second-pass CP read (real-device finding 2026-08-12: the stylized CP
// banner OCRs to garbage like "me We56" in a full-screen pass — the digits
// only survive when the banner is cropped out and upscaled). Center 60% of
// the width (clock sits at the left edge, battery at the right), top ~3-18%
// of the height, 2x upscale. Browser-only (createImageBitmap/canvas);
// returns null anywhere it can't run or can't find an in-range number —
// single attempt, no retry, same honesty contract as the engine itself.
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
    // The CP glyphs are white-on-gradient (and often partly occluded), which
    // a plain upscale doesn't fix — binarize: bright pixels become black
    // text on a white field, the shape tesseract is actually trained on.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const luminance = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const value = luminance > 190 ? 0 : 255;
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    const text = await engine.recognize(blob);
    // Longest in-range digit run wins: a 4-digit CP beats any stray 2-3
    // digit fragment that slipped past the crop. cp null when nothing
    // plausible — but the raw text always comes back so the row's evidence
    // view can show the retry RAN (vs. never ran at all).
    const runs = [...String(text).matchAll(/\d[\d, ]{0,6}/g)]
      .map((match) => Number(match[0].replace(/\D/g, "")))
      .filter((value) => value >= 10 && value <= 6000)
      .sort((a, b) => String(b).length - String(a).length || b - a);
    return { cp: runs.length ? runs[0] : null, raw: String(text).trim() };
  } catch {
    return null;
  }
}
