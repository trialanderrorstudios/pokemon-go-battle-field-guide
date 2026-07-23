// What Changed: the full personalized + global release diff. Composes
// release-diff.js's pure diff summary — no new math here, just rendering.
import { escapeHtml } from "./home.js";
import { intersectRosterChanges } from "../release-diff.js";
import { jargonTerm } from "../glossary.js";

const LEAGUE_LABELS = Object.freeze({ great: "Great", ultra: "Ultra", master: "Master" });

function describeChange(entry) {
  const league = LEAGUE_LABELS[entry.league] ?? entry.league;
  const pokemon = escapeHtml(entry.pokemon);
  const parts = [];
  if (entry.isNew) {
    parts.push(`New ${league} League pick: ${pokemon}, rank #${entry.rank.current}.`);
  } else if (entry.rank) {
    parts.push(`${pokemon}'s ${league} League rank moved #${entry.rank.previous}→#${entry.rank.current}.`);
  }
  if (entry.moveset) {
    parts.push(`${entry.isNew || entry.rank ? "Its" : `${pokemon}'s`} optimal ${jargonTerm("fast-move", "fast move")}/${jargonTerm("charged-move", "charged move")} pick changed.`);
  }
  return parts.join(" ");
}

function changeRow(entry) {
  return `<li>${describeChange(entry)}</li>`;
}

function rosterSection(diff, roster) {
  const yours = intersectRosterChanges(diff, roster);
  if (!yours.length) return "";
  return `<section class="more-section" aria-labelledby="delta-yours-title">
    <h3 id="delta-yours-title">Your Pokémon</h3>
    <ul class="delta-list">${yours.map(changeRow).join("")}</ul>
  </section>`;
}

function allPvpSection(diff) {
  if (!diff.pvpChanges.length) return "";
  return `<section class="more-section" aria-labelledby="delta-pvp-title">
    <h3 id="delta-pvp-title">All PvP ranking changes</h3>
    <ul class="delta-list">${diff.pvpChanges.map(changeRow).join("")}</ul>
  </section>`;
}

function bossName(boss) {
  return `${escapeHtml(boss.tier ?? "")} — ${escapeHtml(boss.name ?? boss.formId)}`.trim();
}

function bossRotationSection(diff) {
  const { added, removed } = diff.bossRotation;
  if (!added.length && !removed.length) return "";
  return `<section class="more-section" aria-labelledby="delta-bosses-title">
    <h3 id="delta-bosses-title">Raid boss rotation</h3>
    ${added.length ? `<p>Rotated in: ${added.map(bossName).join(", ")}</p>` : ""}
    ${removed.length ? `<p>Rotated out: ${removed.map(bossName).join(", ")}</p>` : ""}
  </section>`;
}

function newSpeciesSection(diff) {
  if (!diff.newSpecies.length) return "";
  return `<section class="more-section" aria-labelledby="delta-species-title">
    <h3 id="delta-species-title">New Pokémon added</h3>
    <p>${diff.newSpecies.map((form) => escapeHtml(form.name)).join(", ")}</p>
  </section>`;
}

function unavailableNotice(diff) {
  if (diff.reason === "first-install") {
    return `<p class="fallback-section">This is your first release — nothing to compare yet. Check back after the next update.</p>`;
  }
  return `<p class="fallback-section">The previous release's data isn't available to compare against (it may have expired). Nothing to show yet.</p>`;
}

export function renderDelta({ diff, roster } = {}) {
  const body = !diff || !diff.available
    ? unavailableNotice(diff ?? { reason: "first-install" })
    : (diff.pvpChanges.length || diff.bossRotation.added.length || diff.bossRotation.removed.length || diff.newSpecies.length)
      ? `${rosterSection(diff, roster)}${allPvpSection(diff)}${bossRotationSection(diff)}${newSpeciesSection(diff)}`
      : `<p class="fallback-section">Nothing changed for PvP rankings, raid bosses, or species since the last release.</p>`;
  return `<div class="more-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    <section class="more-section" aria-labelledby="delta-title">
      <p class="status-kicker">Reference</p>
      <h2 id="delta-title">What changed</h2>
      <p>What's different between the previous release and this one — PvP ranking moves, moveset changes, raid boss rotation, and new Pokémon — filtered first to Pokémon you own.</p>
    </section>
    ${body}
  </div>`;
}
