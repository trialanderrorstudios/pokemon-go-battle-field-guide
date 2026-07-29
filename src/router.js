const ROUTES = Object.freeze(["home", "raids", "gyms", "leaderboard", "pvp", "more", "basics", "triage", "eggs", "rocket"]);
const ROUTE_SET = new Set(ROUTES);

// Sub-views, addressed as #route/view. One switching idiom for the whole app:
// the hash segment is the only mechanism that is simultaneously scroll-correct,
// Back-correct, deep-linkable and reload-durable. A bare #route renders the
// route's default view.
const ROUTE_VIEWS = Object.freeze({
  raids: ["target", "hundo"],
  gyms: ["defend"],
  pvp: ["rankings", "antimeta", "swap"],
  triage: ["gaps", "candy"],
  basics: ["types", "glossary", "drill", "tricks", "max"],
  more: ["roster", "settings", "about", "trades", "delta", "budget", "future", "megas", "coverage", "collection"],
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
  const safeView = (ROUTE_VIEWS[safeRoute] ?? []).includes(view) ? `/${view}` : "";
  return `${safeBase}${safeQuery}#${safeRoute}${safeView}`;
}


export function resolveRoute(url, basePath) {
  const safeBase = normalizedBasePath(basePath);
  const testOnlyRelativeBase = ["https:", "", "field-guide.invalid"].join("/");
  const parsed = url instanceof URL ? url : new URL(url, testOnlyRelativeBase);
  let requested = "";
  try {
    requested = decodeURIComponent(parsed.hash.slice(1)).trim().toLowerCase();
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
  // bookmark still opens Raids.
  let view = (ROUTE_VIEWS[route] ?? []).includes(requestedView) ? requestedView : "";
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

  function render(route, view = "") {
    const renderer = renderers[route] ?? renderers.home;
    if (typeof renderer !== "function") {
      throw new TypeError(`Missing renderer for route: ${route}`);
    }
    renderer();
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
    const screen = documentObject?.getElementById?.("app");
    screen?.scrollTo?.(0, 0);
    screen?.classList?.remove("dex-wipe");
    void screen?.offsetWidth;
    screen?.classList?.add("dex-wipe");
    return route;
  }

  function renderLocation({ canonicalize = false } = {}) {
    const location = windowObject.location;
    const resolved = resolveRoute(location.href, safeBase);
    // Canonicalize whenever the resolved URL differs from what's in the bar —
    // an invalid route, a retired hash that redirected, or a legacy ?list=
    // param that was folded into a view.
    if (canonicalize && resolved.href !== `${location.pathname}${location.search}${location.hash}`) {
      windowObject.history.replaceState({}, "", resolved.href);
    }
    return render(resolved.route, resolved.view);
  }

  function navigate(route, { replace = false, view = "" } = {}) {
    const safeRoute = ROUTE_SET.has(route) ? route : "home";
    const href = routeHref(safeRoute, safeBase, windowObject.location.search, view);
    windowObject.history[replace ? "replaceState" : "pushState"]({}, "", href);
    return render(safeRoute, view);
  }

  function onClick(event) {
    if (!isPlainPrimaryClick(event) || !event.target?.closest) return;
    const link = event.target.closest("a[data-route]");
    if (!link || link.target === "_blank") return;
    const route = link.dataset.route;
    if (!ROUTE_SET.has(route)) return;
    const destination = new URL(link.href, windowObject.location.href);
    if (
      destination.origin !== windowObject.location.origin
      || destination.pathname !== safeBase
    ) return;
    event.preventDefault();
    navigate(route, { view: resolveRoute(destination.href, safeBase).view });
  }

  function onHistoryChange() {
    renderLocation({ canonicalize: true });
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
