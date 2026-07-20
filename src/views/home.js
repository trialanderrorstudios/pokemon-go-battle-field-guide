export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}


function taskCard({ href, title, detail }) {
  return `<a class="fallback-section home-task-card" href="${href}">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(detail)}</p>
  </a>`;
}


const CONTINUE_ROUTES = new Set(["raids", "gyms", "pvp"]);


export function renderHome({
  cutoff,
  offlineStatus = "Offline setup incomplete",
  updateStatus = "Update status unavailable",
  continueTask = null,
} = {}) {
  const continueRoute = CONTINUE_ROUTES.has(continueTask?.route)
    ? continueTask.route
    : null;
  const continued = continueRoute
    ? taskCard({
      href: `./#${continueRoute}`,
      title: continueTask.label ?? "Continue",
      detail: continueTask.detail ?? "Resume your last task.",
    })
    : "";
  return `<section class="home-view" aria-labelledby="home-view-title">
    <p class="status-kicker">Field status</p>
    <h2 id="home-view-title">Ready for the next battle</h2>
    <p><strong>Data through ${escapeHtml(cutoff ?? "unknown")}</strong></p>
    <p aria-label="Offline status">${escapeHtml(offlineStatus)}</p>
    <p aria-label="Update status">${escapeHtml(updateStatus)}</p>
    <form class="fallback-section" role="search" data-global-search>
      <label for="global-search">Search Pokémon, move, type, or raid boss</label>
      <input id="global-search" name="q" type="search" autocomplete="off">
      <div data-search-results aria-live="polite"></div>
    </form>
    <div class="home-task-grid">
      ${continued}
      ${taskCard({ href: "./#raids", title: "Raid Target", detail: "Check hundo CP and the best counters." })}
      ${taskCard({ href: "./#gyms", title: "Gym Plan", detail: "Attack, stagger, or choose the next defender." })}
      ${taskCard({ href: "./#more", title: "My Roster", detail: "Use the Pokémon you already own." })}
      ${taskCard({ href: "./#pvp", title: "PvP", detail: "Great, Ultra, and Master League picks." })}
    </div>
  </section>`;
}
