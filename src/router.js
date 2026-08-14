const ROUTES = Object.freeze(["home", "raids", "gyms", "leaderboard", "pvp", "more", "basics", "triage", "eggs", "rocket", "dex"]);
const ROUTE_SET = new Set(ROUTES);

// dex is the one route with a dynamic (not enumerable) view: the segment is a
// formId, not one of a fixed list, so it can't live in ROUTE_VIEWS below. A
// formId always starts with a 4-digit dex number (see core.forms keys, e.g.
// "0426-normal") — whether it actually resolves to a known form is the
// renderer's job, exactly like a typo'd #raids/bogus keeps its route today.
const DEX_FORM_ID_PATTERN = /^\d{4}[a-z0-9-]*$/i;

// Sub-views, addressed as #route/view. One switching idiom for the whole app:
// the hash segment is the only mechanism that is simultaneously scroll-correct,
// Back-correct, deep-linkable and reload-durable. A bare #route renders the
// route's default view.
const ROUTE_VIEWS = Object.freeze({
  raids: ["target", "hundo"],
  gyms: ["defend"],
  pvp: ["rankings", "antimeta", "swap"],
  triage: ["gaps", "candy"],
  basics: ["types", "glossary", "drill", "tricks", "max", "items"],
  // Adding a renderMore view without listing it here is the "lands at the
  // top of More" bug (operator hit it on five views at once, 2026-08-13) —
  // the router deliberately drops unknown views to keep typo'd bookmarks
  // working, which silently eats real ones too.
  more: [
    "roster", "settings", "about", "trades", "delta", "budget", "future", "megas", "coverage", "collection",
    "shopguide", "purge", "dupes", "powerup", "capabilities", "changelog", "tradeplanner",
  ],
});

// Routes retired by the 23 -> 10 consolidation, and where their content lives
// now. Bookmarks and Home Screen shortcuts to these hashes are in the wild, so
// they resolve valid (route = the destination) instead of collapsing to home.
const RETIRED_ROUTES = Object.freeze({
  today: "home",
  // No anchor: coach became two Home sections with no view of its own, so it
  // lands at the top of Home, which leads with the daily checklist.
  coach: "home",
  hundo: "raids/hundo",
  swap: "pvp/swap",
  buildnext: "triage/gaps",
  candyplan: "triage/candy",
  delta: "more/delta",
  trades: "more/trades",
  types: "basics/types",
  glossary: "basics/glossary",
  drill: "basics/drill",
  tricks: "basics/tricks",
  maxbasics: "basics/max",
  // Dex is a bottom-nav tab now, so bare #dex is the living-dex grid's
  // canonical home and #more/collection is the retired hash — the redirect
  // that used to run the other way (dex -> more/collection) is inverted.
  // This is also step one toward docs/dex-two-panel-spec.md, which wants bare
  // #dex as the index at tablet widths. The key is the exact two-segment
  // string "more/collection" (matched whole, before the "/" split below), so
  // every other #more/<view> — "more/roster", "more/settings" — passes
  // through untouched, and a real #dex/<formId> deep link never collides with
  // it (DEX_FORM_ID_PATTERN's shape check happens on a completely different
  // code path, below).
  "more/collection": "dex",
});

// Legacy ?list=<id>#more bookmarks. Their hash is already valid, so
// RETIRED_ROUTES never fires for them — map the param to a view and drop it
// from the query, or it rides along onto every route visited next.
const LEGACY_LIST_VIEWS = new Set(["budget", "future", "megas", "coverage", "collection"]);


function normalizedBasePath(basePath) {
  if (typeof basePath !== "string" || !basePath.startsWith("/")) {
    throw new TypeError("basePath must be an absolute URL path");
  }
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}


export function routeHref(route, basePath, query = "", view = "") {
  const safeRoute = ROUTE_SET.has(route) ? route : "home";
  const safeBase = normalizedBasePath(basePath);
  const safeQuery = query === "" || query.startsWith("?") ? query : `?${query}`;
  const safeView = safeRoute === "dex"
    ? (DEX_FORM_ID_PATTERN.test(view || "") ? `/${view}` : "")
    : (ROUTE_VIEWS[safeRoute] ?? []).includes(view) ? `/${view}` : "";
  return `${safeBase}${safeQuery}#${safeRoute}${safeView}`;
}


export function resolveRoute(url, basePath) {
  const safeBase = normalizedBasePath(basePath);
  const testOnlyRelativeBase = ["https:", "", "field-guide.invalid"].join("/");
  const parsed = url instanceof URL ? url : new URL(url, testOnlyRelativeBase);
  let requested = "";
  try {
    // Leading slash stripped BEFORE the RETIRED_ROUTES lookup below, not after
    // the ROUTE_SET check: a hand-typed "#/coach" has to redirect like "#coach"
    // does, and no app-generated link produces this shape (routeHref always
    // emits "#route") — it is bookmark/address-bar input only.
    requested = decodeURIComponent(parsed.hash.slice(1)).trim().toLowerCase().replace(/^\/+/, "");
  } catch {
    requested = "";
  }
  // Retirement redirects run before the ROUTE_SET check: #coach is no longer a
  // route, but it still has to land on the surface that absorbed it. Own-property
  // lookup only: the hash is user input, and #constructor would otherwise read an
  // inherited Object.prototype member and throw on .split() instead of falling
  // back to home.
  const redirected = Object.hasOwn(RETIRED_ROUTES, requested) ? RETIRED_ROUTES[requested] : requested;
  const [requestedRoute, requestedView] = redirected.split("/");
  const valid = parsed.pathname === safeBase && ROUTE_SET.has(requestedRoute);
  const route = valid ? requestedRoute : "home";
  // An unknown segment loses the view, never the route: a typo'd #raids/bogus
  // bookmark still opens Raids. dex is the one dynamic-view route — its
  // segment is a formId, validated by shape here; whether it's a real form is
  // the renderer's job (see DEX_FORM_ID_PATTERN above).
  let view = route === "dex"
    ? (DEX_FORM_ID_PATTERN.test(requestedView || "") ? requestedView : "")
    : (ROUTE_VIEWS[route] ?? []).includes(requestedView) ? requestedView : "";
  let query = parsed.search;
  if (valid && route === "more" && !view && parsed.searchParams.has("list")) {
    const list = parsed.searchParams.get("list");
    if (LEGACY_LIST_VIEWS.has(list)) view = list;
    const stripped = new URL(parsed.href);
    stripped.searchParams.delete("list");
    query = stripped.search;
  }
  return {
    route,
    view,
    query,
    hash: `#${route}${view ? `/${view}` : ""}`,
    href: routeHref(route, safeBase, query, view),
    valid,
  };
}


// The app's one screen-reader announcement channel (#app-status, which lives in
// the shell outside #app so a route innerHTML swap can't delete it). #app itself
// used to carry aria-live="polite", so replacing its contents per route read the
// ENTIRE view aloud — measured 400,468 characters on #pvp/rankings, 379,154 on
// #pvp. The search results container had the same defect at keystroke scale.
// Both write one short string here instead.
const STATUS_ID = "app-status";

export function announce(documentObject, message) {
  const node = documentObject?.getElementById?.(STATUS_ID);
  if (!node) return;
  // Visually hidden from here rather than app.css so the shell markup needs no
  // stylesheet change; a `#app-status` rule in app.css is the tidier home for
  // this and can replace it. An inline style attribute is not an option — the
  // shell's CSP sets style-src 'self' with no 'unsafe-inline'.
  if (node.style && !node.style.position) {
    Object.assign(node.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
    });
  }
  node.textContent = message;
}


function isPlainPrimaryClick(event) {
  return event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}


export function createRouter({
  basePath,
  renderers,
  windowObject = globalThis.window,
  documentObject = globalThis.document,
}) {
  const safeBase = normalizedBasePath(basePath);
  let started = false;
  // The surface the reader is actually on. An in-page anchor overwrites the hash,
  // so this is the only remaining record of where to put them back.
  let lastRendered = { route: "home", view: "" };

  // A link that declares data-view is a view switcher and must match the view
  // exactly, or every segment of a control lights up at once. A link with no
  // data-view at all is a route-level link (the nav tabs) and stays current
  // anywhere inside its route.
  function markCurrent(route, view) {
    if (!documentObject?.querySelectorAll) return;
    for (const link of documentObject.querySelectorAll("[data-route]")) {
      const linkView = link.dataset.view;
      if (link.dataset.route === route && (linkView === undefined || linkView === view)) {
        link.setAttribute("aria-current", "page");
      } else link.removeAttribute("aria-current");
    }
  }

  function render(route, view = "", { moveFocus = false } = {}) {
    const renderer = renderers[route] ?? renderers.home;
    if (typeof renderer !== "function") {
      throw new TypeError(`Missing renderer for route: ${route}`);
    }
    renderer();
    const screen = documentObject?.getElementById?.("app");
    const heading = screen?.querySelector?.("h2");
    announce(documentObject, heading?.textContent?.trim() || route);
    // Focus the new heading so assistive tech lands ON the content rather than
    // having the whole view read at it. Only on a navigation the reader asked
    // for: a landing data chunk re-renders the same route 4-5 times per cold
    // load, and yanking focus then would pull it out of the search box mid-word.
    if (moveFocus && typeof heading?.focus === "function") {
      heading.setAttribute?.("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    lastRendered = { route, view };
    // Read the view back off the location: a renderer may canonicalize the URL
    // itself (?boss=X#raids folds into #raids/target), and marking the view we
    // came in with would light the wrong segment of the strip it just drew.
    markCurrent(route, resolveRoute(windowObject.location.href, safeBase).view || view);
    // Tells src/boot-watchdog.js the app is alive. Set on a real render, not
    // on script load: a module that parses and then throws while rendering is
    // just as dead to the user as one that never loaded.
    documentObject?.documentElement?.setAttribute?.("data-app-booted", "true");
    windowObject.scrollTo?.(0, 0);
    // The screen (#app) scrolls internally now, not the window — reset its
    // scroll position too, and restart the 220ms dex page-wipe.
    screen?.scrollTo?.(0, 0);
    screen?.classList?.remove("dex-wipe");
    void screen?.offsetWidth;
    screen?.classList?.add("dex-wipe");
    return route;
  }

  function renderLocation({ canonicalize = false, moveFocus = false } = {}) {
    const location = windowObject.location;
    const resolved = resolveRoute(location.href, safeBase);
    // Canonicalize whenever the resolved URL differs from what's in the bar —
    // an invalid route, a retired hash that redirected, or a legacy ?list=
    // param that was folded into a view.
    if (canonicalize && resolved.href !== `${location.pathname}${location.search}${location.hash}`) {
      windowObject.history.replaceState({}, "", resolved.href);
    }
    return render(resolved.route, resolved.view, { moveFocus });
  }

  function navigate(route, { replace = false, view = "" } = {}) {
    const safeRoute = ROUTE_SET.has(route) ? route : "home";
    const href = routeHref(safeRoute, safeBase, windowObject.location.search, view);
    windowObject.history[replace ? "replaceState" : "pushState"]({}, "", href);
    return render(safeRoute, view, { moveFocus: true });
  }

  function onClick(event) {
    if (!isPlainPrimaryClick(event) || !event.target?.closest) return;
    // In-page anchors are handled here, BEFORE the hash can change. Letting the
    // fragment land in the URL and catching it on hashchange also works, but the
    // hash write provokes a second render whose scrollTo(0, 0) immediately undoes
    // the scroll — measured: the target reached top=81, then snapped back to
    // scrollTop 0. Not navigating at all is simpler than racing the re-render.
    const anchor = event.target.closest('a[href^="#"]:not([data-route])');
    if (anchor) {
      const id = (anchor.getAttribute?.("href") ?? "").slice(1);
      const target = id && !ROUTE_SET.has(id.split("/")[0])
        ? documentObject?.getElementById?.(id)
        : null;
      if (target) {
        event.preventDefault();
        // A jump into a collapsed tier section would otherwise scroll to a shut
        // <details> and look like nothing happened.
        target.closest?.("details:not([open])")?.setAttribute?.("open", "");
        target.scrollIntoView?.({ block: "start" });
        return;
      }
    }
    const link = event.target.closest("a[data-route]");
    if (!link || link.target === "_blank") return;
    if (!ROUTE_SET.has(link.dataset.route)) return;
    const destination = new URL(link.href, windowObject.location.href);
    if (
      destination.origin !== windowObject.location.origin
      || destination.pathname !== safeBase
    ) return;
    event.preventDefault();
    // Resolve route AND view from the href itself, not from the anchor's own
    // data-route/data-view — those go stale exactly the way this app's own
    // RETIRED_ROUTES table proves they can (e.g. a lingering
    // href="./#more/collection" data-route="more" anchor: resolveRoute
    // redirects that href to route "dex", but its stale dataset still says
    // "more"). navigate() must agree with the address bar resolveRoute is
    // about to write, or the reader lands on the wrong screen for the URL
    // that's now showing.
    const resolved = resolveRoute(destination.href, safeBase);
    navigate(resolved.route, { view: resolved.view });
  }

  // An in-page anchor is not a route. The Defend view's jump links
  // (#gym-ranking-title, #gym-motivation-title) and every "↑ Back to top" carry a
  // bare fragment, and resolveRoute maps any unknown first segment to home — so
  // tapping "Defender ranking" silently threw the reader back to Home. Honour a
  // fragment that names an element on the page, and leave the route alone.
  function anchorTarget() {
    let raw = "";
    try {
      raw = decodeURIComponent(windowObject.location.hash.slice(1));
    } catch {
      return null;
    }
    if (!raw || ROUTE_SET.has(raw.split("/")[0])) return null;
    return documentObject?.getElementById?.(raw) ?? null;
  }

  function onHistoryChange() {
    const target = anchorTarget();
    if (!target) return renderLocation({ canonicalize: true, moveFocus: true });
    // A jump link into a collapsed tier section would otherwise scroll to a
    // closed <details> and appear to do nothing.
    target.closest?.("details:not([open])")?.setAttribute?.("open", "");
    target.scrollIntoView?.({ block: "start" });
    // Put the route back in the address bar without firing another hashchange,
    // so reload and Back still land on the surface the reader was actually on.
    // Read it from the last render, NOT from the location — by now the hash IS
    // the anchor, so resolving it would canonicalize the reader onto #home.
    windowObject.history.replaceState?.(
      {},
      "",
      routeHref(lastRendered.route, safeBase, windowObject.location.search, lastRendered.view),
    );
    return lastRendered.route;
  }

  return {
    navigate,
    start() {
      if (started) return renderLocation({ canonicalize: true });
      started = true;
      windowObject.addEventListener("click", onClick);
      windowObject.addEventListener("hashchange", onHistoryChange);
      windowObject.addEventListener("popstate", onHistoryChange);
      return renderLocation({ canonicalize: true });
    },
    stop() {
      if (!started) return;
      started = false;
      windowObject.removeEventListener("click", onClick);
      windowObject.removeEventListener("hashchange", onHistoryChange);
      windowObject.removeEventListener("popstate", onHistoryChange);
    },
  };
}


export { ROUTES, ROUTE_VIEWS, RETIRED_ROUTES };
