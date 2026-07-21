// Offline sprite pack lookup: web/sprites/<dex>.png, fetched once at build
// time by scripts/fetch-sprites.mjs (never at runtime). Regional/shadow/mega
// forms share their base Pokemon's dex number, so keying by dex already
// covers the "fall back to base-dex sprite" requirement.

// Reuse the canonical type palette from src/pogo_encyclopedia/workbook.py
// so fallback circles match the same type colors used elsewhere.
export const TYPE_COLORS = Object.freeze({
  Bug: "#92BC2C", Dark: "#595761", Dragon: "#0C69C8", Electric: "#F2D94E",
  Fairy: "#EE90E6", Fighting: "#D3425F", Fire: "#FBA54C", Flying: "#A1BBEC",
  Ghost: "#5F6DBC", Grass: "#5FBD58", Ground: "#DA7C4D", Ice: "#75D0C1",
  Normal: "#A0A29F", Poison: "#B763CF", Psychic: "#FA8581", Rock: "#C9BB8A",
  Steel: "#5695A3", Water: "#539DDF",
});


export function spritePath(formId, forms) {
  const dex = forms?.[formId]?.dex;
  return Number.isInteger(dex) && dex > 0 ? `./sprites/${dex}.png` : null;
}


function initial(name) {
  return String(name ?? "?").trim().charAt(0).toUpperCase() || "?";
}


// escapeHtml is duplicated (not imported) to keep this a dependency-free
// leaf module usable from any view without an import cycle.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}


// Renders an <img> when a sprite is known. The runtime fallback (if the file
// is ever missing) is wired via a delegated "error" listener in app.js
// (bindInteractions), not an inline onerror attribute, to stay inside this
// app's strict CSP (script-src 'self', style-src 'self': no inline JS or
// style attributes). When no dex is known at all, renders only the
// type-colored initial circle. The type color comes from a CSS attribute
// selector (styles/app.css), not an inline style, for the same CSP reason.
export function spriteHtml(formId, forms, name, primaryType) {
  const path = spritePath(formId, forms);
  const type = TYPE_COLORS[primaryType] ? primaryType : "Normal";
  const alt = escapeHtml(name);
  const fallback = `<span class="sprite-fallback" data-type="${escapeHtml(type)}">${escapeHtml(initial(name))}</span>`;
  if (!path) return `<span class="sprite sprite-broken">${fallback}</span>`;
  return `<span class="sprite"><img src="${path}" alt="${alt}" loading="lazy" width="48" height="48">${fallback}</span>`;
}


// Delegated runtime fallback: called from a capturing "error" listener on
// the app root (error events do not bubble). Swaps a broken sprite <img> for
// its adjacent type-colored fallback circle.
export function handleSpriteError(event) {
  const img = event?.target;
  if (!(img?.tagName === "IMG") || !img.closest?.(".sprite")) return;
  img.closest(".sprite").classList.add("sprite-broken");
}
