import { escapeHtml, GLOSSARY } from "../glossary.js";


export function renderGlossary() {
  const rows = GLOSSARY.map((entry) => (
    `<div class="glossary-entry"><dt>${escapeHtml(entry.term)}</dt><dd>${escapeHtml(entry.definition)}</dd></div>`
  )).join("");
  return `<div class="more-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    <section class="more-section" aria-labelledby="glossary-title">
      <p class="status-kicker">Plain-language terms</p>
      <h1 id="glossary-title">Glossary</h1>
      <p>Every jargon term used in this app, in one place.</p>
    </section>
    <dl class="glossary-list">${rows}</dl>
  </div>`;
}
