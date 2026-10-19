// HTML escaping. One implementation, deliberately a dependency-free leaf so
// that any module — including sprites.js, which has to stay importable from
// every view without creating a cycle — can use it.
//
// There used to be three: views/home.js exported one (51 files imported it
// from a VIEW, which is how home.js became the de facto utility module),
// glossary.js exported a byte-identical second, and sprites.js kept a private
// third with a comment explaining it was duplicated to avoid an import cycle.
// This file has no imports, so that reason no longer applies.
//
// Every value interpolated into a view's HTML string goes through this. Views
// build strings rather than DOM nodes, so this is the only thing standing
// between a Pokemon nickname and an injected tag.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
