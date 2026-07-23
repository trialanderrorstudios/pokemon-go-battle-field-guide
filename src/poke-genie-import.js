// Bulk import of Pokémon ownership + CP/IVs from a Poke Genie CSV export.
// Column layout verified against mglerner/gopvpsim's Poke Genie parser
// (src/gopvpsim/user_collection.py): Name, Form, CP, Atk IV, Def IV, Sta IV,
// Level Min, Shadow/Purified, Lucky, Gender, plus Quick Move/Charge Move/
// Charge Move 2 (moves aren't part of this app's roster schema yet).
// Level Min/Gender/moves are ignored — imported instances carry CP/IVs
// only; buildImportedInstance() leaves moves unset rather than guessing.
// Lucky IS ingested (round 9). Per the same reference, gopvpsim parses
// Lucky as row['Lucky'].strip() == '1' — numeric, same encoding family as
// Shadow/Purified (0/1/2) — so "1" is the primary match; "yes"/"true" are
// also accepted in case an export variant uses a text flag instead.
// Honest-scope gap: Poke Genie's CSV has no shiny column at all
// (shiny isn't Genie-detectable — it's an IV/appraisal tool), so shiny
// status can only come from manual toggles in this app, never from import.
import { buildImportedInstance } from "./instances.js";

const REQUIRED_COLUMNS = ["Name", "Form", "CP", "Atk IV", "Def IV", "Sta IV"];

// Poke Genie's regional-form vocabulary vs. this repo's form tokens.
const FORM_ALIASES = { ALOLA: "ALOLAN", GALAR: "GALARIAN", HISUI: "HISUIAN", PALDEA: "PALDEAN" };

function normalizeFormToken(raw) {
  const token = String(raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return token ? (FORM_ALIASES[token] ?? token) : "";
}


// RFC4180-ish CSV splitter: quoted fields, embedded commas, doubled-quote
// escapes, and a leading UTF-8 BOM (Poke Genie's export includes one).
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  const body = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (inQuotes) {
      if (char === '"') {
        if (body[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") pushField();
    else if (char === "\n") pushRow();
    else field += char;
  }
  if (field !== "" || row.length) pushRow();
  return rows.filter((cells) => cells.some((cell) => cell !== ""));
}


function baseNameOf(form) {
  return String(form.name ?? "").replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
}


// Exact (name, form token, shadow) matches, plus a name+shadow-only fallback
// for single-form species where Poke Genie leaves the Form column blank.
// Mega/Primal are excluded from the fallback — they're temporary battle
// forms, never a persisted roster entry.
function buildFormIndex(forms) {
  const exact = new Map();
  const byNameShadow = new Map();
  for (const form of Object.values(forms ?? {})) {
    const baseName = baseNameOf(form);
    if (!baseName) continue;
    exact.set(`${baseName}|${form.form}|${Boolean(form.shadow)}`, form);
    if (!(form.tags ?? []).includes("mega")) {
      const key = `${baseName}|${Boolean(form.shadow)}`;
      if (!byNameShadow.has(key)) byNameShadow.set(key, []);
      byNameShadow.get(key).push(form);
    }
  }
  return { exact, byNameShadow };
}


function matchForm(index, name, formToken, shadow) {
  const lowerName = name.toLowerCase();
  if (formToken) return index.exact.get(`${lowerName}|${formToken}|${shadow}`) ?? null;
  // Blank Form column: safe to guess when this species has exactly one
  // non-mega form matching the shadow flag, or when the plain NORMAL form is
  // among several candidates (Poke Genie leaves Form blank for the base
  // species even when costume/event forms of it also exist). Otherwise it's
  // genuinely ambiguous which form the row means.
  const candidates = index.byNameShadow.get(`${lowerName}|${shadow}`) ?? [];
  if (candidates.length === 1) return candidates[0];
  return candidates.find((form) => form.form === "NORMAL") ?? null;
}


// Parses a Poke Genie CSV export into persistable roster instances. Returns
// { instances, errors } — errors are human-readable, one per unmatched or
// invalid row; other valid rows still import.
export function parsePokeGenieCsv(text, forms) {
  const rows = parseCsvRows(text);
  if (!rows.length) return { instances: [], errors: ["The file has no rows."] };
  const [header, ...dataRows] = rows;
  const columnIndex = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const missingColumns = REQUIRED_COLUMNS.filter((name) => !(name in columnIndex));
  if (missingColumns.length) {
    return { instances: [], errors: [`Missing expected column(s): ${missingColumns.join(", ")}.`] };
  }
  const index = buildFormIndex(forms);
  const instances = [];
  const errors = [];
  dataRows.forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 2; // header is row 1
    const cell = (name) => (name in columnIndex ? String(cells[columnIndex[name]] ?? "").trim() : "");
    const name = cell("Name");
    if (!name) { errors.push(`Row ${rowNumber}: missing Name.`); return; }
    const formToken = normalizeFormToken(cell("Form"));
    // Poke Genie encodes this column numerically: 0 = normal, 1 = shadow,
    // 2 = purified. This app's schema has no "purified" concept (forms are
    // just shadow: true/false), so only "1" counts as shadow.
    const shadow = cell("Shadow/Purified") === "1";
    const form = matchForm(index, name, formToken, shadow);
    if (!form) {
      errors.push(`Row ${rowNumber}: no exact match for "${name}"${cell("Form") ? ` (${cell("Form")})` : ""}${shadow ? ", Shadow" : ""}.`);
      return;
    }
    const ivs = { atk: Number(cell("Atk IV")), def: Number(cell("Def IV")), sta: Number(cell("Sta IV")) };
    const luckyCell = cell("Lucky").trim().toLowerCase();
    const isLucky = luckyCell === "1" || luckyCell === "yes" || luckyCell === "true";
    try {
      instances.push(buildImportedInstance(form, { cp: Number(cell("CP")), ivs, isLucky }));
    } catch (error) {
      errors.push(`Row ${rowNumber} (${name}): ${error.message}`);
    }
  });
  return { instances, errors };
}
