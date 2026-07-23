import { escapeHtml } from "./home.js";
import { TIP_CATEGORIES, TIPS } from "../tricks.js";

function tipCard(tip) {
  return `<article class="trick-card" aria-labelledby="trick-${escapeHtml(tip.id)}-title">
    <h4 id="trick-${escapeHtml(tip.id)}-title">${escapeHtml(tip.title)}</h4>
    <p>${tip.body}</p>
    <p class="trick-verified">Verified ${escapeHtml(tip.verified)}</p>
  </article>`;
}

function categoryGroup(categoryId, label) {
  const tips = TIPS.filter((tip) => tip.category === categoryId);
  if (!tips.length) return "";
  return `<details class="tricks-category" open>
    <summary>${escapeHtml(label)} (${tips.length})</summary>
    <div class="tricks-list">${tips.map(tipCard).join("")}</div>
  </details>`;
}

export function renderTricks() {
  const groups = Object.entries(TIP_CATEGORIES).map(([id, label]) => categoryGroup(id, label)).join("");
  return `<div class="more-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    <section class="more-section" aria-labelledby="tricks-title">
      <p class="status-kicker">Curated, sourced knowledge</p>
      <h2 id="tricks-title">Tips &amp; Tricks</h2>
      <p>Community-known mechanics and shortcuts, each with a source and a "verified" date so you know how current it is.</p>
    </section>
    ${groups}
  </div>`;
}
