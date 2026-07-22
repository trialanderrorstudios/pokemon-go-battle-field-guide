const ROUTES = Object.freeze(["home", "raids", "gyms", "pvp", "more", "basics", "types", "glossary", "drill", "swap", "coach"]);
const ROUTE_SET = new Set(ROUTES);


function normalizedBasePath(basePath) {
  if (typeof basePath !== "string" || !basePath.startsWith("/")) {
    throw new TypeError("basePath must be an absolute URL path");
  }
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}


export function routeHref(route, basePath, query = "") {
  const safeRoute = ROUTE_SET.has(route) ? route : "home";
  const safeBase = normalizedBasePath(basePath);
  const safeQuery = query === "" || query.startsWith("?") ? query : `?${query}`;
  return `${safeBase}${safeQuery}#${safeRoute}`;
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
  const valid = parsed.pathname === safeBase && ROUTE_SET.has(requested);
  const route = valid ? requested : "home";
  return {
    route,
    query: parsed.search,
    hash: `#${route}`,
    href: routeHref(route, safeBase, parsed.search),
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

  function markCurrent(route) {
    if (!documentObject?.querySelectorAll) return;
    for (const link of documentObject.querySelectorAll("[data-route]")) {
      if (link.dataset.route === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  function render(route) {
    const renderer = renderers[route] ?? renderers.home;
    if (typeof renderer !== "function") {
      throw new TypeError(`Missing renderer for route: ${route}`);
    }
    renderer();
    markCurrent(route);
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
    const resolved = resolveRoute(windowObject.location.href, safeBase);
    if (canonicalize && !resolved.valid) {
      windowObject.history.replaceState({}, "", resolved.href);
    }
    return render(resolved.route);
  }

  function navigate(route, { replace = false } = {}) {
    const safeRoute = ROUTE_SET.has(route) ? route : "home";
    const href = routeHref(safeRoute, safeBase, windowObject.location.search);
    windowObject.history[replace ? "replaceState" : "pushState"]({}, "", href);
    return render(safeRoute);
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
    navigate(route);
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


export { ROUTES };
