import { ATTACK_TYPES, effectiveness } from "../raid-target.js";
import { spriteHtml } from "../sprites.js";


export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}


export function ownedStarButton({ formId, name, owned, route = "raids" }) {
  return `<button type="button" class="owned-star${owned ? " is-owned" : ""}" data-owned-form-id="${escapeHtml(formId)}" data-owned-route="${escapeHtml(route)}" aria-pressed="${owned}" aria-label="I own ${escapeHtml(name)}"><span aria-hidden="true">${owned ? "★" : "☆"}</span></button>`;
}


function taskCard({ href, title, detail }) {
  return `<a class="fallback-section home-task-card" href="${href}">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(detail)}</p>
  </a>`;
}


const CONTINUE_ROUTES = new Set(["raids", "gyms", "pvp"]);


function topWeaknesses(bossTypes) {
  return ATTACK_TYPES
    .map((attackingType) => ({
      attackingType,
      effectiveness: effectiveness(attackingType, bossTypes[0], bossTypes[1]),
    }))
    .filter((row) => row.effectiveness > 1)
    .sort((left, right) => right.effectiveness - left.effectiveness
      || left.attackingType.localeCompare(right.attackingType))
    .slice(0, 4)
    .map((row) => row.attackingType);
}


export function currentBossCard({ formId, tier, endsAt } = {}, { target, forms, now = new Date() } = {}) {
  const name = target?.boss ?? formId;
  const bossTypes = target?.bossTypes ?? [];
  const weaknesses = bossTypes.length ? topWeaknesses(bossTypes) : [];
  const stale = typeof endsAt === "string" && !Number.isNaN(Date.parse(endsAt)) && new Date(endsAt) < now;
  return `<a class="fallback-section home-boss-card" href="./?boss=${encodeURIComponent(formId)}#raids" data-form-id="${escapeHtml(formId)}">
    <div class="home-boss-heading">${spriteHtml(formId, forms, name, bossTypes[0])}<h3>${escapeHtml(name)}</h3></div>
    <p class="boss-tier">${escapeHtml(tier || "Raid boss")}</p>
    ${weaknesses.length ? `<p class="boss-weaknesses">Weak to ${weaknesses.map(escapeHtml).join(", ")}</p>` : ""}
    ${stale ? `<p class="boss-stale">May be outdated — check in-game.</p>` : ""}
  </a>`;
}


export function renderCurrentBosses({ currentBosses, raidTargetTool, forms, now = new Date() } = {}) {
  const bosses = currentBosses?.bosses ?? [];
  if (!bosses.length) return "";
  const targetsByFormId = new Map((raidTargetTool?.targets ?? []).map((target) => [target.bossFormId, target]));
  return `<section class="home-boss-section" aria-labelledby="home-boss-title">
    <h3 id="home-boss-title">This week's raid bosses</h3>
    <div class="home-boss-grid">${bosses.map((boss) => currentBossCard(
    boss, { target: targetsByFormId.get(boss.formId), forms, now },
  )).join("")}</div>
  </section>`;
}


function whatsNewCard(whatsNew) {
  if (!whatsNew?.notes) return "";
  return `<div class="fallback-section whats-new-card" role="note">
    <p><strong>Updated ${escapeHtml(whatsNew.dataCutoff ?? "")} — what's new</strong></p>
    <p>${escapeHtml(whatsNew.notes)}</p>
    <button type="button" data-action="dismiss-whats-new" data-release-id="${escapeHtml(whatsNew.releaseId)}">Dismiss</button>
  </div>`;
}


export function renderHome({
  cutoff,
  offlineStatus = "Offline setup incomplete",
  updateStatus = "Update status unavailable",
  continueTask = null,
  currentBosses = null,
  raidTargetTool = null,
  forms = {},
  whatsNew = null,
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
    ${whatsNewCard(whatsNew)}
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
      ${taskCard({ href: "./#basics", title: "Battle Basics", detail: "New here? Start with the plain-language basics." })}
    </div>
    ${renderCurrentBosses({ currentBosses, raidTargetTool, forms })}
  </section>`;
}
