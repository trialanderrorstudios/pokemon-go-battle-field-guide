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
  var GUARD_KEY = "pogo-boot-repair-at";
  // Long enough that a slow first paint on a bad connection is not mistaken
  // for a broken install, short enough that a stuck app is not a dead end.
  var GRACE_MS = 9000;
  // One repair per window. A genuinely unreachable server must not become a
  // reload loop; the user gets the static shell and an honest failure instead.
  var COOLDOWN_MS = 60000;

  function booted() {
    return document.documentElement.getAttribute(BOOTED_ATTRIBUTE) === "true";
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

  window.setTimeout(function () {
    if (booted() || recentlyRepaired()) return;
    repair();
  }, GRACE_MS);
})();
