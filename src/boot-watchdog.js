// Boot watchdog. Deliberately a classic script, not a module, and loaded
// BEFORE src/app.js — because the failure it exists to catch is app.js never
// running at all.
//
// The app already had a self-repair (attemptSelfRepair in app.js) for exactly
// this, but it was called from inside startFieldGuide: if the module graph
// failed to load or threw on the way in, the escape hatch was unreachable. A
// service worker left holding an incomplete shell would then serve the static
// pre-JS HTML forever — nav anchors that only highlight sections, cards that
// are inert markup — with nothing able to recover it. Reported twice, on
// 2026-07-29, and the app could not heal itself either time.
//
// So this lives outside everything it might have to repair: no imports, no
// build step, no dependency on the release manager or the router. If the app
// has not signalled that it booted within the grace window, drop the service
// worker registrations and caches and reload once. Roster, stars and
// preferences live in localStorage/IndexedDB and are deliberately untouched.
(function bootWatchdog() {
  var BOOTED_ATTRIBUTE = "data-app-booted";
  // Set by app.js's releaseManager.subscribe callback while the release
  // manager's status is "caching" (the first-install staging path) — see
  // P1 (wave-s-speed, boot-watchdog vs first install): on a slow connection,
  // staging a ~650KB release legitimately takes longer than GRACE_MS, and
  // firing the repair mid-stage dropped a HEALTHY, still-downloading cache
  // and reloaded into a second, redundant download. While this attribute
  // reads "true" the watchdog extends its own grace instead of repairing.
  var BOOTING_ATTRIBUTE = "data-app-booting";
  // Fable review follow-up (wave-s-speed): set by app.js when it renders an
  // honest boot-failure notice (a real data-integrity failure, or a first
  // visit with no network and nothing cached) instead of the real app —
  // deliberately NOT the same signal as BOOTED_ATTRIBUTE, which
  // scripts/verify-boot.mjs / cold-smoke / e2e specs all read as "the real
  // app rendered." Claiming that here would let a genuinely broken release
  // pass publish verification; this attribute only ever stops the
  // watchdog's own repair-reload, nothing else reads it.
  var BOOT_FAILED_ATTRIBUTE = "data-boot-failed";
  var GUARD_KEY = "pogo-boot-repair-at";
  // Long enough that a slow first paint on a bad connection is not mistaken
  // for a broken install, short enough that a stuck app is not a dead end.
  var GRACE_MS = 9000;
  // Hard ceiling on total extension: an install that is STILL staging after
  // this long is indistinguishable from one that's actually stuck (a hung
  // fetch, a server that stopped responding mid-file), so repair must still
  // win eventually rather than extend forever.
  var MAX_GRACE_MS = 30000;
  // One repair per window. A genuinely unreachable server must not become a
  // reload loop; the user gets the static shell and an honest failure instead.
  var COOLDOWN_MS = 60000;

  function booted() {
    return document.documentElement.getAttribute(BOOTED_ATTRIBUTE) === "true";
  }

  function booting() {
    return document.documentElement.getAttribute(BOOTING_ATTRIBUTE) === "true";
  }

  function bootFailed() {
    return document.documentElement.getAttribute(BOOT_FAILED_ATTRIBUTE) === "true";
  }

  function recentlyRepaired() {
    try {
      var last = Number(window.sessionStorage.getItem(GUARD_KEY) || 0);
      if (last && Date.now() - last < COOLDOWN_MS) return true;
      window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
      return false;
    } catch (error) {
      // Private mode or storage disabled: skip rather than risk a loop.
      return true;
    }
  }

  function repair() {
    var work = [];
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        work.push(navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.all(registrations.map(function (registration) {
            return registration.unregister();
          }));
        }));
      }
      if (window.caches && window.caches.keys) {
        work.push(window.caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return window.caches.delete(key); }));
        }));
      }
    } catch (error) {
      // Fall through to the reload regardless — a plain reload sometimes
      // resolves it on its own, and a thrown watchdog helps nobody.
    }
    Promise.all(work).catch(function () {}).then(function () {
      window.location.reload();
    });
  }

  function check(elapsedMs) {
    if (booted() || bootFailed()) return;
    if (booting() && elapsedMs < MAX_GRACE_MS) {
      window.setTimeout(function () { check(elapsedMs + GRACE_MS); }, GRACE_MS);
      return;
    }
    if (recentlyRepaired()) return;
    repair();
  }

  window.setTimeout(function () { check(GRACE_MS); }, GRACE_MS);
})();
