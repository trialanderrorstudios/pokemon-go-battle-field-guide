// I3 OCR bulk-intake — text parsing only. Pure module: no DOM, no tesseract
// import. Takes whatever text an OCR engine already recognized off a single
// Pokémon GO mon-info screen and turns it into a structured, conservative
// draft. A field that doesn't parse cleanly returns null + an issue string,
// never a guess — the one deliberate exception is species-name matching,
// where a small edit-distance fallback is the intended feature (see
// matchName below), not a guess.
//
// Mockup (reference behaviour, not portable code):
// docs/mockups/delight-2026-08-11/I3-ocr-bulk-intake.html

const CP_MIN = 10;
// Megas overshoot the old 6000 ceiling (Mega Mewtwo Y reads 6460+ on a real
// device, 2026-08-13; its true max is ~8000). 9000 still rejects
// stardust-scale numbers.
const CP_MAX = 9000;

// "CP" prefix, optional punctuation/space, then a run of digits that may be
// broken up by spaces ("CP2 4 5 3") or thousands-commas ("CP 2,453").
const CP_RE = /\bcp\.?[ \t]*[:\-]?[ \t]*(\d[\d, \t]{0,15})/i;
// "HP 142 / 142" — the max (denominator) is the stat that matters.
const HP_RE = /\bhp\.?\s*[:\-]?\s*(\d{1,4})\s*\/\s*(\d{1,4})/i;
// The game's own layout puts the label AFTER the numbers ("173 / 173 HP") —
// verified against a real device scan, 2026-08-12.
const HP_TRAILING_RE = /(\d{1,4})\s*\/\s*(\d{1,4})\s*hp\b/i;
const WEIGHT_RE = /(\d+(?:\.\d+)?)\s*kg\b/i;
const HEIGHT_RE = /(\d+(?:\.\d+)?)\s*m\b/i;
const LABEL_ONLY_RE = /^(weight|height|hp|cp|candy|buddy)\s*:?\s*$/i;
const REGION_SUFFIX_RE = /^(.*)\s\((Alolan|Galarian|Hisuian|Paldean)\)$/;

// Whole-line fallback for the stylized CP banner: OCR routinely mangles the
// "C" glyph ("sP5629", "©P5629", "(P5629") or drops it entirely. Anchored to
// a line that is nothing but <junk>P<digits>, so "173 / 173 HP" and stray
// numbers can never match.
const CP_LINE_RE = /^[^a-z0-9]{0,3}[a-z]?p\s*[.:]?\s*(\d[\d, ]{1,8})$/im;

// Last-ditch banner read: when the stylized "CP" glyphs are lost entirely,
// the value survives as a bare 3-5 digit line ABOVE the species name (the
// only place the layout puts a large standalone number). Status-bar lines
// are already junk-filtered; the 3-digit floor keeps a stray battery "90"
// out. Low confidence by definition.
function bareBannerCp(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim());
  const hpIndex = lines.findIndex((line) => HP_RE.test(line) || HP_TRAILING_RE.test(line));
  const stop = hpIndex > 0 ? hpIndex : lines.length;
  for (let i = 0; i < stop; i += 1) {
    if (STATUS_JUNK_RE.test(lines[i])) continue;
    const match = lines[i].match(/^[^a-z0-9]{0,3}(\d[\d, ]{2,6})[^a-z0-9]{0,3}$/i);
    if (match) return match;
  }
  return null;
}

function parseCp(text) {
  let noisyBanner = false;
  let match = text.match(CP_RE);
  if (!match) {
    const bannerMatch = text.match(CP_LINE_RE);
    // "hp"-shaped lines are digits-first and never reach this pattern, but a
    // literal lone "hp 40" line would — refuse the h prefix explicitly.
    if (bannerMatch && !/^[^a-z0-9]{0,3}h/i.test(bannerMatch[0])) {
      match = bannerMatch;
      noisyBanner = true;
    }
  }
  if (!match) {
    const bare = bareBannerCp(text);
    if (bare) {
      match = bare;
      noisyBanner = true;
    }
  }
  if (!match) {
    // "ws ae 6460" — the CP glyphs mangle into short letter junk with the
    // digits surviving at the end of the line (real device, 2026-08-13).
    const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim());
    const hpIndex = lines.findIndex((line) => HP_RE.test(line) || HP_TRAILING_RE.test(line));
    const stop = hpIndex > 0 ? hpIndex : lines.length;
    for (let i = 0; i < stop; i += 1) {
      if (STATUS_JUNK_RE.test(lines[i])) continue;
      const junkPrefix = lines[i].match(/^[a-z ]{0,8}(\d{3,5})$/i);
      if (junkPrefix) {
        match = junkPrefix;
        noisyBanner = true;
        break;
      }
    }
  }
  const digits = match ? match[1].replace(/\D/g, "") : "";
  if (!digits) return { value: null, issue: "CP not found.", noisy: false };
  const value = Number(digits);
  if (value < CP_MIN || value > CP_MAX) {
    return { value: null, issue: `CP ${value} is outside expected range (${CP_MIN}-${CP_MAX}).`, noisy: false };
  }
  // Spaced-out digits ("2 4 5 3") mean the OCR engine split what should be
  // one token — that's a genuinely noisier read than a clean run or a
  // comma-formatted thousands separator (which is the game's own format).
  return { value, issue: null, noisy: noisyBanner || /\d\s+\d/.test(match[1]) };
}

function parseHp(text) {
  const match = text.match(HP_RE) ?? text.match(HP_TRAILING_RE);
  if (!match) return { value: null, issue: "HP not found." };
  // Current HP can never exceed max — a read like "142 / 14" means OCR
  // dropped a digit somewhere, and which number is wrong is unknowable.
  if (Number(match[1]) > Number(match[2])) {
    return { value: null, issue: "HP read looks garbled (current above max) — enter manually." };
  }
  return { value: Number(match[2]), issue: null };
}

function parseUnitValue(text, re, label) {
  const match = text.match(re);
  if (!match) return { value: null, issue: `${label} not found.` };
  return { value: Number(match[1]), issue: null };
}

function isFieldLine(line) {
  if (!line) return true;
  if (LABEL_ONLY_RE.test(line)) return true;
  if (CP_RE.test(line) || HP_RE.test(line) || WEIGHT_RE.test(line) || HEIGHT_RE.test(line)) return true;
  if (/^[\d,.\s/]+$/.test(line)) return true; // stray digit-only lines (candy counts, etc.)
  return false;
}

// Real screens put the species name on its own line, above every labeled
// field — so the first non-blank line that isn't a recognized field is it.
// iOS/Android status bars ride along in a full-screen screenshot and OCR as
// the first "name-looking" line ("3:53 qa . , etl 5G+ 894" — real device
// scan, 2026-08-12). Time, signal, and battery patterns are never dex names.
const STATUS_JUNK_RE = /\d{1,2}:\d{2}|\b[2-5]g\+?\b|\blte\b|\bwi-?fi\b|\d{1,3}\s*%/i;

// Nickname decorations: unicode superscripts (the "¹⁰⁰" hundo convention)
// plus trailing symbol junk (the edit-pencil icon OCRs as stray "/" or "."").
// ASCII digits stay — Porygon2 is a real name.
const SUPERSCRIPT_RE = /[\u00b9\u00b2\u00b3\u2070-\u2079]/g;

function cleanNameLine(line) {
  return String(line ?? "")
    .replace(SUPERSCRIPT_RE, "")
    .replace(/[^\w)♀♂'.!\-]+$/u, "")
    .trim();
}

function candidateNameLines(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => cleanNameLine(line));
  return lines.filter((line) => line && !isFieldLine(line) && !STATUS_JUNK_RE.test(line));
}

function extractNameLine(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => cleanNameLine(line));
  // The species name sits directly ABOVE the HP bar in the game's layout —
  // the strongest positional anchor when no line exact-matches the dex.
  const hpIndex = lines.findIndex((line) => HP_RE.test(line) || HP_TRAILING_RE.test(line));
  if (hpIndex > 0) {
    for (let i = hpIndex - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line && !isFieldLine(line) && !STATUS_JUNK_RE.test(line)) return line;
    }
  }
  return lines.find((line) => line && !isFieldLine(line) && !STATUS_JUNK_RE.test(line)) ?? null;
}

// Plain Levenshtein DP, no library. Distance <=2 covers every OCR confusion
// named in the task: O/0 and l/I/1 are same-length substitutions (cost 1);
// rn->m is one substitution + one deletion (cost 2).
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const row = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost));
    }
    prev = row;
  }
  return prev[n];
}

// "Rattata (Alolan)" -> "alolan rattata" — the region-first order some OCR
// overlays/tools render instead of the dex's parenthetical form. A known
// naming convention, not a guess, so it counts as an exact/high-confidence
// match.
// "Mewtwo (Mega Y)" -> "mega mewtwo y" — the order the game itself renders
// while mega-evolved (real device scan, 2026-08-13). Same known-convention
// treatment as regionFirstAlt: an exact hit is high confidence.
function megaFirstAlt(name) {
  const match = String(name ?? "").match(/^(.*)\s\(Mega( [XY])?\)$/);
  if (!match) return null;
  return `mega ${match[1]}${match[2] ?? ""}`.toLowerCase();
}

function regionFirstAlt(name) {
  const match = String(name ?? "").match(REGION_SUFFIX_RE);
  return match ? `${match[2]} ${match[1]}`.toLowerCase() : null;
}

const TYPE_NAMES = Object.freeze([
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark",
  "steel", "fairy",
]);

// The mon screen prints the typing as literal words ("FAIRY / STEEL") — the
// strongest disambiguator inside a form family (real device scan 2026-08-12:
// Zacian Hero is pure Fairy, Crowned Sword is Fairy/Steel).
function typesInText(text) {
  const lower = String(text ?? "").toLowerCase();
  return new Set(TYPE_NAMES.filter((type) => new RegExp(`\\b${type}\\b`).test(lower)));
}

function formTypeSet(form) {
  return new Set([form.primary_type, form.secondary_type]
    .filter(Boolean).map((type) => String(type).toLowerCase()));
}

function candidateEntry(form) {
  return { formId: form.form_id, name: form.name };
}

function matchName(rawName, forms, scannedTypes = null) {
  if (!rawName) return { formId: null, confidence: null, issue: "Name not found." };
  const lowerName = rawName.toLowerCase();
  const formList = Object.values(forms ?? {});
  const exact = formList.find((form) => {
    const canonical = String(form.name ?? "").toLowerCase();
    return canonical === lowerName || regionFirstAlt(form.name) === lowerName || megaFirstAlt(form.name) === lowerName;
  });
  if (exact) return { formId: exact.form_id, confidence: "high", issue: null };
  if (!formList.length) {
    return { formId: null, confidence: null, issue: "name not in dex — nicknamed? pick manually." };
  }
  // The longest dex name is far under 40 chars; a longer "name" line is OCR
  // garbage, and running the 1,700-form edit-distance pass over it costs
  // hundreds of ms for a guaranteed miss.
  if (lowerName.length > 40) {
    return { formId: null, confidence: null, issue: "name not in dex — nicknamed? pick manually." };
  }
  // The game shows the bare species name ("Zacian") where the dex only has
  // parenthetical forms ("Zacian (Hero)"). A unique prefix family is a real
  // match; an ambiguous one names ITS members as the candidates instead of
  // whatever the global edit-distance pass would dredge up.
  const prefixFamily = formList.filter((form) => String(form.name ?? "").toLowerCase().startsWith(`${lowerName} (`));
  if (prefixFamily.length === 1) {
    return { formId: prefixFamily[0].form_id, confidence: "high", issue: null };
  }
  if (prefixFamily.length > 1) {
    // Try the scanned typing first: if exactly one family member's own type
    // set matches the type words OCR'd off the screen, that IS the form.
    if (scannedTypes?.size) {
      const typed = prefixFamily.filter((form) => {
        const set = formTypeSet(form);
        return set.size === scannedTypes.size && [...set].every((type) => scannedTypes.has(type));
      });
      if (typed.length === 1) {
        return { formId: typed[0].form_id, confidence: "high", issue: null };
      }
    }
    const family = prefixFamily.slice(0, 4);
    return {
      formId: null,
      confidence: null,
      candidates: family.map(candidateEntry),
      candidatesKind: "family",
      issue: `"${rawName}" has multiple forms — pick one below.`,
    };
  }
  const ranked = formList
    .map((form) => ({ form, distance: levenshtein(lowerName, String(form.name ?? "").toLowerCase()) }))
    .sort((a, b) => a.distance - b.distance || a.form.name.localeCompare(b.form.name));
  const best = ranked[0];
  const tiedAtBest = ranked.filter((entry) => entry.distance === best.distance);
  if (best.distance <= 2 && tiedAtBest.length === 1) {
    return { formId: best.form.form_id, confidence: "low", issue: null };
  }
  const closest = ranked.slice(0, 3).map((entry) => entry.form);
  const candidates = [...new Set(closest.map((form) => form.name))];
  return {
    formId: null,
    confidence: null,
    candidates: closest.map(candidateEntry),
    // Edit-distance guesses, NOT a form family: a nicknamed mon's "closest
    // names" are unrelated species, so downstream solving may narrow these
    // but must never auto-resolve to one.
    candidatesKind: "closest",
    issue: `name not in dex — nicknamed? pick manually (closest: ${candidates.join(", ")}).`,
  };
}

// Nickname-proof species identification (operator, 2026-08-13: "a lot of
// people nickname their pokemon"). The screen prints the SPECIES name in
// places a nickname never touches: the candy counter ("ZACIAN CANDY") and
// the catch footer ("This Zacian was caught on..."). Priority: footer, then
// candy line, then a unique species-name hit anywhere in the text. Base
// species names only (word-boundary, case-insensitive); ambiguity returns
// null — the existing candidates path stays the fallback.
function baseSpeciesName(form) {
  return String(form.name ?? "").replace(/ \(.*\)$/, "");
}

function speciesFromContext(text, formList) {
  const haystack = String(text ?? "");
  const names = [...new Set(formList.map(baseSpeciesName).filter(Boolean))];
  const footerHits = [];
  const candyHits = [];
  const anywhereHits = [];
  for (const name of names) {
    const escaped = escapeRegExp(name);
    if (new RegExp(`this\\s+${escaped}\\s+was\\s+caught`, "i").test(haystack)) footerHits.push(name);
    if (new RegExp(`\\b${escaped}\\s+candy\\b`, "i").test(haystack)) candyHits.push(name);
    if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) anywhereHits.push(name);
  }
  for (const hits of [footerHits, candyHits, anywhereHits]) {
    if (hits.length === 1) return hits[0];
  }
  return null;
}

// Parses a single Pokémon GO mon-info-screen OCR dump into a structured,
// conservative draft. `forms` is the app's form map (formId -> form record,
// same shape as data/processed/encyclopedia.json's `forms`).
export function parseMonScreenText(rawText, { forms } = {}) {
  const text = String(rawText ?? "");
  const issues = [];
  const confidence = {};

  const scannedTypes = typesInText(text);
  let nameLine = extractNameLine(text);
  let nameMatch = matchName(nameLine, forms, scannedTypes);
  if (!nameMatch.formId) {
    // Any line that exactly matches a dex name (or a unique form family)
    // beats the positional guess — OCR noise above the name can't hide it.
    for (const line of candidateNameLines(text)) {
      if (line === nameLine) continue;
      const candidate = matchName(line, forms, scannedTypes);
      if (candidate.formId && candidate.confidence === "high") {
        nameLine = line;
        nameMatch = candidate;
        break;
      }
    }
  }
  let nickname = null;
  if (!nameMatch.formId) {
    // Nickname-proof anchors (candy line / catch footer) identify the
    // species even when the display name is a nickname — which then becomes
    // the instance's nickname instead of a dead end.
    const contextSpecies = speciesFromContext(text, Object.values(forms ?? {}));
    if (contextSpecies) {
      const contextMatch = matchName(contextSpecies, forms, scannedTypes);
      if (contextMatch.formId || contextMatch.candidates?.length) {
        if (nameLine && nameLine.toLowerCase() !== contextSpecies.toLowerCase()) nickname = nameLine;
        nameLine = contextSpecies;
        nameMatch = contextMatch;
      }
    }
  }
  if (nameMatch.issue) issues.push(nameMatch.issue);
  if (nameMatch.confidence) confidence.formId = nameMatch.confidence;

  const cpResult = parseCp(text);
  if (cpResult.issue) issues.push(cpResult.issue);
  if (cpResult.value !== null) confidence.cp = cpResult.noisy ? "low" : "high";

  const hpResult = parseHp(text);
  if (hpResult.issue) issues.push(hpResult.issue);
  if (hpResult.value !== null) confidence.hp = "high";

  const weightResult = parseUnitValue(text, WEIGHT_RE, "Weight");
  if (weightResult.issue) issues.push(weightResult.issue);
  if (weightResult.value !== null) confidence.weightKg = "high";

  const heightResult = parseUnitValue(text, HEIGHT_RE, "Height");
  if (heightResult.issue) issues.push(heightResult.issue);
  if (heightResult.value !== null) confidence.heightM = "high";

  return {
    name: nameLine,
    nickname,
    formId: nameMatch.formId,
    candidates: nameMatch.candidates ?? [],
    candidatesKind: nameMatch.candidatesKind ?? null,
    cp: cpResult.value,
    hp: hpResult.value,
    weightKg: weightResult.value,
    heightM: heightResult.value,
    confidence,
    issues,
  };
}

// The quick-add draft field subset an OCR result can actually populate —
// same raw-typed-string-parsed-at-save-time convention as dex.js's
// blankQuickAddDraft (cp/heightM/weightKg). IVs and moves are never
// OCR-derivable from the main screen, so they aren't part of this subset;
// the caller merges this into blankQuickAddDraft(), which already defaults
// them. nickname is always "" — the OCR'd species name maps to formId
// (species selection), never to the separate nickname field.
export function draftFromParse(parsed) {
  return {
    cp: parsed?.cp != null ? String(parsed.cp) : "",
    heightM: parsed?.heightM != null ? String(parsed.heightM) : "",
    weightKg: parsed?.weightKg != null ? String(parsed.weightKg) : "",
    nickname: parsed?.nickname ?? "",
  };
}


// Move ingestion (operator ask 2026-08-13: "will that allow ingestion of
// moves?"). Once the species is known its legal move list is a CLOSED
// vocabulary — matching the scan against those exact display names is far
// more reliable than free OCR. Word-boundary matches only (a two-letter
// name inside another word never counts); order of appearance decides which
// charged move sits in slot one, matching the screen's own layout. Absent
// moves stay absent — never a guess.
function moveNameFromId(moveId) {
  // Same trivial transform as views/move-sheet.js displayMoveName — copied
  // (4 lines) rather than importing a DOM-adjacent view module into this
  // pure parser.
  return String(moveId ?? "").toLowerCase().split("_")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMoves(rawText, form) {
  if (!form) return { fastMove: null, chargedMoves: [] };
  const text = String(rawText ?? "");
  const findAll = (ids) => (ids ?? [])
    .map((id) => {
      const match = text.match(new RegExp(`\\b${escapeRegExp(moveNameFromId(id))}\\b`, "i"));
      return match ? { id, index: match.index } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
  const fast = findAll(form.fast_moves);
  const charged = findAll(form.charged_moves);
  return {
    fastMove: fast[0]?.id ?? null,
    chargedMoves: charged.slice(0, 2).map((hit) => hit.id),
  };
}
