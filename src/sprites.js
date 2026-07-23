// Offline sprite pack lookup: web/sprites/<id>.png, fetched once at build
// time by scripts/fetch-sprites.mjs (never at runtime) from PokeAPI's HOME
// art set. Most forms share their base Pokemon's national dex number, so
// keying by dex covers the "fall back to base-dex sprite" case. Regional,
// mega, and primal forms get their own PokeAPI variant id (>= 10000, no
// collision with the 1..1025 dex range) via SPRITE_VARIANT_IDS below.
// Shadow forms are not in the map — they reuse their (regional) base art,
// keyed by stripping "-shadow" off the form id, since Pokemon GO renders the
// shadow flame overlay in-game rather than shipping separate shadow art.

// Reuse the canonical type palette from src/pogo_encyclopedia/workbook.py
// so fallback circles match the same type colors used elsewhere.
export const TYPE_COLORS = Object.freeze({
  Bug: "#92BC2C", Dark: "#595761", Dragon: "#0C69C8", Electric: "#F2D94E",
  Fairy: "#EE90E6", Fighting: "#D3425F", Fire: "#FBA54C", Flying: "#A1BBEC",
  Ghost: "#5F6DBC", Grass: "#5FBD58", Ground: "#DA7C4D", Ice: "#75D0C1",
  Normal: "#A0A29F", Poison: "#B763CF", Psychic: "#FA8581", Rock: "#C9BB8A",
  Steel: "#5695A3", Water: "#539DDF",
});


// form_id -> PokeAPI HOME sprite id, for regional/mega/primal forms whose
// in-game art differs from their base dex sprite. Resolved from PokeAPI
// (pokeapi.co/api/v2/pokemon/<slug>) against each form's upstream_id in
// data/processed/encyclopedia.json; kept in sync with
// SPRITE_VARIANT_IDS in src/pogo_encyclopedia/build.py (parity test guards
// it — tests/web/sw-shell-parity.test.mjs).
export const SPRITE_VARIANT_IDS = Object.freeze({
  "0003-mega": 10033, "0006-mega-x": 10034, "0006-mega-y": 10035, "0009-mega": 10036,
  "0015-mega": 10090, "0018-mega": 10073, "0019-alolan": 10091, "0020-alolan": 10092,
  "0026-alolan": 10100, "0026-mega-x": 10304, "0026-mega-y": 10305, "0027-alolan": 10101,
  "0028-alolan": 10102, "0037-alolan": 10103, "0038-alolan": 10104, "0050-alolan": 10105,
  "0051-alolan": 10106, "0052-alolan": 10107, "0052-galarian": 10161, "0053-alolan": 10108,
  "0058-hisuian": 10229, "0059-hisuian": 10230, "0065-mega": 10037, "0071-mega": 10279,
  "0074-alolan": 10109, "0075-alolan": 10110, "0076-alolan": 10111, "0077-galarian": 10162,
  "0078-galarian": 10163, "0079-galarian": 10164, "0080-galarian": 10165, "0080-mega": 10071,
  "0083-galarian": 10166, "0088-alolan": 10112, "0089-alolan": 10113, "0094-mega": 10038,
  "0100-hisuian": 10231, "0101-hisuian": 10232, "0103-alolan": 10114, "0105-alolan": 10115,
  "0110-galarian": 10167, "0115-mega": 10039, "0122-galarian": 10168, "0127-mega": 10040,
  "0130-mega": 10041, "0142-mega": 10042, "0144-galarian": 10169, "0145-galarian": 10170,
  "0146-galarian": 10171, "0149-mega": 10281, "0150-mega-x": 10043, "0150-mega-y": 10044,
  "0157-hisuian": 10233, "0181-mega": 10045, "0194-paldean": 10253, "0199-galarian": 10172,
  "0208-mega": 10072, "0211-hisuian": 10234, "0212-mega": 10046, "0214-mega": 10047,
  "0215-hisuian": 10235, "0222-galarian": 10173, "0227-mega": 10284, "0229-mega": 10048,
  "0248-mega": 10049, "0254-mega": 10065, "0257-mega": 10050, "0260-mega": 10064,
  "0263-galarian": 10174, "0264-galarian": 10175, "0282-mega": 10051, "0302-mega": 10066,
  "0303-mega": 10052, "0306-mega": 10053, "0308-mega": 10054, "0310-mega": 10055,
  "0319-mega": 10070, "0323-mega": 10087, "0334-mega": 10067, "0354-mega": 10056,
  "0359-mega": 10057, "0362-mega": 10074, "0373-mega": 10089, "0376-mega": 10076,
  "0380-mega": 10062, "0381-mega": 10063, "0382-primal": 10077, "0383-primal": 10078,
  "0384-mega": 10079, "0428-mega": 10088, "0445-mega": 10058, "0448-mega": 10059,
  "0460-mega": 10060, "0475-mega": 10068, "0503-hisuian": 10236, "0531-mega": 10069,
  "0549-hisuian": 10237, "0554-galarian": 10176, "0555-galarian": 10177, "0555-galarian-zen": 10178,
  "0562-galarian": 10179, "0570-hisuian": 10238, "0571-hisuian": 10239, "0618-galarian": 10180,
  "0628-hisuian": 10240, "0687-mega": 10297, "0713-hisuian": 10243, "0719-mega": 10075,
  "0724-hisuian": 10244, "0870-mega": 10303,
});


export function spritePath(formId, forms) {
  const dex = forms?.[formId]?.dex;
  if (!Number.isInteger(dex) || dex <= 0) return null;
  const baseFormId = String(formId ?? "").replace(/-shadow$/, "");
  const spriteId = SPRITE_VARIANT_IDS[baseFormId] ?? dex;
  return `./sprites/${spriteId}.png`;
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
  const fallback = `<span class="sprite-fallback" data-type="${escapeHtml(type)}" role="img" aria-label="${alt}" title="${alt}">${escapeHtml(initial(name))}</span>`;
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
