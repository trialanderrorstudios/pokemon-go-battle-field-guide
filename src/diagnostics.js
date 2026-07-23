// Local-only crash/error ring buffer. Captures window "error" and
// "unhandledrejection" events so a support conversation can answer "which
// build, which route, what broke" without any telemetry leaving the device.
// The capturer must never throw back into the app it's diagnosing — every
// entry point here is wrapped defensively against hostile error objects.
const DIAGNOSTICS_KEY = "pogo-diagnostics-log";
const MAX_ENTRIES = 50;
const MAX_FIELD_LENGTH = 500;
const STACK_HEAD_LINES = 3;

function truncate(value, max) {
  const str = String(value ?? "");
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function readSafe(obj, key) {
  try {
    return obj?.[key];
  } catch {
    return undefined;
  }
}

// Extracts a message/stack pair out of whatever a thrown value or a promise
// rejection reason turns out to be — an Error, a string, a hostile object
// with throwing getters, or null/undefined.
function describeThrown(value) {
  try {
    if (typeof value === "string") return { message: value, stack: "" };
    const message = readSafe(value, "message");
    const stack = readSafe(value, "stack");
    return {
      message: typeof message === "string" && message ? message : String(value),
      stack: typeof stack === "string" ? stack : "",
    };
  } catch {
    return { message: "Unknown error", stack: "" };
  }
}

function isValidEntry(entry) {
  return entry
    && typeof entry.message === "string"
    && typeof entry.stackHead === "string"
    && typeof entry.route === "string"
    && typeof entry.shellRevision === "string"
    && typeof entry.releaseId === "string"
    && Number.isFinite(entry.ts);
}


export function loadDiagnostics(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(DIAGNOSTICS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
  } catch {
    return [];
  }
}


// Appends one entry to the ring buffer, capped at MAX_ENTRIES. Never throws —
// a capture failure (quota exceeded, corrupt storage) just means this one
// entry doesn't persist.
export function recordDiagnosticsEntry(storage, { message, stack, route, shellRevision, releaseId, ts } = {}) {
  try {
    const entry = {
      message: truncate(message ?? "Unknown error", MAX_FIELD_LENGTH),
      stackHead: truncate(String(stack ?? "").split("\n").slice(0, STACK_HEAD_LINES).join("\n"), MAX_FIELD_LENGTH),
      route: truncate(route ?? "", 40),
      shellRevision: truncate(shellRevision ?? "", 40),
      releaseId: truncate(releaseId ?? "", 60),
      ts: Number.isFinite(ts) ? ts : Date.now(),
    };
    const entries = [...loadDiagnostics(storage), entry].slice(-MAX_ENTRIES);
    storage?.setItem?.(DIAGNOSTICS_KEY, JSON.stringify(entries));
    return entries;
  } catch {
    return loadDiagnostics(storage);
  }
}


export function clearDiagnostics(storage) {
  try {
    storage?.removeItem?.(DIAGNOSTICS_KEY);
  } catch {
    // Storage can legitimately be unavailable; nothing to clean up then.
  }
}


export function exportDiagnostics(storage) {
  return `${JSON.stringify(loadDiagnostics(storage), null, 2)}\n`;
}


// Wires window-level error capture. Returns an unsubscribe function.
// getRoute/getShellRevision/getReleaseId are called fresh on every capture
// so entries reflect what was actually on screen when the error fired.
export function installDiagnosticsCapture({
  windowObject = globalThis.window,
  storage = windowObject?.localStorage,
  getRoute = () => "",
  getShellRevision = () => "",
  getReleaseId = () => "",
} = {}) {
  if (!windowObject?.addEventListener) return () => {};

  const capture = (described) => {
    try {
      recordDiagnosticsEntry(storage, {
        message: described.message,
        stack: described.stack,
        route: safeCall(getRoute),
        shellRevision: safeCall(getShellRevision),
        releaseId: safeCall(getReleaseId),
        ts: Date.now(),
      });
    } catch {
      // The capturer must never crash the app it's diagnosing.
    }
  };

  const onError = (event) => {
    try {
      const topMessage = readSafe(event, "message");
      const described = typeof topMessage === "string" && topMessage
        ? { message: topMessage, stack: readSafe(readSafe(event, "error"), "stack") ?? "" }
        : describeThrown(readSafe(event, "error"));
      capture(described);
    } catch {
      // as above
    }
  };
  const onRejection = (event) => {
    try {
      capture(describeThrown(readSafe(event, "reason")));
    } catch {
      // as above
    }
  };

  windowObject.addEventListener("error", onError);
  windowObject.addEventListener("unhandledrejection", onRejection);
  return () => {
    windowObject.removeEventListener("error", onError);
    windowObject.removeEventListener("unhandledrejection", onRejection);
  };
}

function safeCall(fn) {
  try {
    return fn?.() ?? "";
  } catch {
    return "";
  }
}
