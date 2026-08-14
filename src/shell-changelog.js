// Shell version history in patch-note style (operator ask 2026-08-13:
// "simple style patch notes about what was added, removed or tweaked").
// Hand-maintained, newest first; every APP_SHELL_REVISION bump adds its
// entry in the same change — the release isn't done without it. Entries
// before r106 predate detailed records and are grouped honestly.

export const SHELL_CHANGELOG = Object.freeze([
  Object.freeze({
    rev: "r131", date: "2026-08-14",
    added: Object.freeze([
      "Two-panel dex on tablet width — the living-dex rail beside the entry, selection without losing your place.",
      "Per-copy verdict line in Your roster — optimal sets, best league rank, showcase score in one glance.",
      "Trade Planner (More → Library) — trade bait and per-friend offers, precious singles always protected.",
    ]),
    tweaked: Object.freeze([
      "Every rendered score now states its scale; investment tiers carry their recommendation everywhere.",
      "Move badges use exact per-form availability (the Cinderace Blast Burn generic-label bug).",
      "Fixed a broken r130 script string that blocked the whole test suite.",
    ]),
  }),
  Object.freeze({
    rev: "r130", date: "2026-08-14",
    added: Object.freeze([
      "Sibling-form switcher on dex entries — hop Hero/Crowned/Shadow/Mega without the grid.",
      "Section jump bar (Stats · Optimal · Gym · PvP · Evolution · Yours).",
      "Prev/next species navigation in dex order.",
      "\"View in dex\" link on saved scan rows.",
    ]),
  }),
  Object.freeze({
    rev: "r129", date: "2026-08-13",
    added: Object.freeze([
      "Current Max Battle boss on the Max card — operator-reported (Dynamax Beldum seeded), expiry-honest, linked to its dex entry.",
    ]),
    tweaked: Object.freeze([
      "Fixed: the five newest More pages (shop guide, purge, dupes, power-up, capability tour) landed at the top of More instead of opening — the router's view allowlist never learned them.",
    ]),
  }),
  Object.freeze({
    rev: "r128", date: "2026-08-13",
    added: Object.freeze(["This version history page (More → This build)."]),
  }),
  Object.freeze({
    rev: "r127", date: "2026-08-13",
    added: Object.freeze(["Capability tour — \"What this app can do\" under More → This build."]),
  }),
  Object.freeze({
    rev: "r126", date: "2026-08-13",
    added: Object.freeze([
      "Max lane on the home briefing — Max Mondays with the featured Dynamax Pokémon, Max Battle Days, your Max-ready count.",
      "Showcase advisor — your best-scoring sized Pokémon when a showcase event runs.",
      "Purge Planner — conservative transfer search strings (More → Library).",
      "Duplicate Advisor — keep/transfer verdicts across copies (More → Library).",
      "Power-Up Planner — damage per 1,000 dust vs the current rotation (More → Library).",
      "Scan session summary line and appraisal-screenshot IV narrowing.",
    ]),
    tweaked: Object.freeze(["Two-part scans link by species, not photo order."]),
  }),
  Object.freeze({
    rev: "r125", date: "2026-08-13",
    added: Object.freeze([
      "Super Max modeled: +2 effective levels (authoritative CPM 52/53); mega scans solve exactly.",
      "\"Super Max\" mega level trackable on instances; eligibility shown on dex entries (Victreebel, Dragonite, Malamar this data).",
    ]),
    removed: Object.freeze(["The r124 mega-scan warning — superseded by the real model."]),
  }),
  Object.freeze({
    rev: "r124", date: "2026-08-13",
    added: Object.freeze(["Advisory on mega-screen scans (short-lived — see r125)."]),
  }),
  Object.freeze({
    rev: "r123", date: "2026-08-13",
    added: Object.freeze([
      "Nickname-proof species identification from the candy line and catch footer — the nickname itself is saved.",
      "Two-part scans: a moves photo merges into its Pokémon's row.",
    ]),
    tweaked: Object.freeze([
      "\"Mega Mewtwo Y\"-style names resolve; CP ceiling raised to 9000 for Super Max range.",
      "Garbage CP reads rejected when they fit no IV spread for the HP.",
    ]),
  }),
  Object.freeze({
    rev: "r122", date: "2026-08-13",
    added: Object.freeze(["Move ingestion — scans with visible moves save complete instances in one tap."]),
  }),
  Object.freeze({
    rev: "r121", date: "2026-08-13",
    added: Object.freeze(["Second charge-slot suggestion on dex entries (coverage role or PvP pair, with unlock cost)."]),
    tweaked: Object.freeze(["Saving any instance now marks the species caught — the collection grid reflects scans."]),
  }),
  Object.freeze({
    rev: "r120", date: "2026-08-13",
    tweaked: Object.freeze(["Nicknamed scans can never auto-resolve to a wrong species."]),
  }),
  Object.freeze({
    rev: "r119", date: "2026-08-13",
    added: Object.freeze(["Shop & Storage Value Guide (More → Library)."]),
  }),
  Object.freeze({
    rev: "r118", date: "2026-08-12",
    added: Object.freeze(["CP+HP solver — IVs and even the form identified from the scan alone; zero manual input on unambiguous screens."]),
  }),
  Object.freeze({
    rev: "r115–r117", date: "2026-08-12",
    tweaked: Object.freeze([
      "CP banner reading rebuilt three times against real-device evidence: targeted crop, binarization, digit whitelist, preprocess variant ladder.",
      "Scan evidence view carries the shell version and every retry attempt.",
    ]),
  }),
  Object.freeze({
    rev: "r113–r114", date: "2026-08-12",
    added: Object.freeze([
      "Tappable form candidates on ambiguous scans.",
      "Per-copy Remove on dex rows; Clear-all roster data; regex bulk-remove with preview-first.",
      "\"What the scanner saw\" raw-text evidence with copy button.",
    ]),
    tweaked: Object.freeze(["Typing on screen auto-resolves form families (Hero vs Crowned)."]),
  }),
  Object.freeze({
    rev: "r112", date: "2026-08-12",
    tweaked: Object.freeze([
      "Parser matches the real GO screen: status bar filtered, numbers-first HP, stylized CP banner, superscript nicknames.",
      "Row buttons only render when they can actually do something.",
    ]),
  }),
  Object.freeze({
    rev: "r110–r111", date: "2026-08-12",
    added: Object.freeze([
      "Screenshot scanning: bulk photo intake with review rows and Accept/Edit — engine downloads on first Scan tap (~7.6MB, one-time), offline after.",
      "Scan button on the dex grid.",
    ]),
  }),
  Object.freeze({
    rev: "r108–r109", date: "2026-08-12",
    added: Object.freeze(["Three-lane home briefing — Mega, Tier 5, and Shadow each get their own dismissible card."]),
  }),
  Object.freeze({
    rev: "r107", date: "2026-08-12",
    added: Object.freeze([
      "Size class, height/weight, buddy level, and Max flags on instances; showcase score estimate; size baselines for every form.",
    ]),
    tweaked: Object.freeze([
      "PvP \"Yours\" lines assume level 51 only when Best Buddy is recorded.",
      "Gym band wording says defense (\"Beats Grass attackers\"), not offense.",
    ]),
  }),
  Object.freeze({
    rev: "r106", date: "2026-08-12",
    tweaked: Object.freeze([
      "\"Update failed → retry\" loop fixed (compressed server responses broke the update check).",
      "Expired bosses filtered from the briefing — the home page stops lying about the rotation.",
    ]),
  }),
  Object.freeze({
    rev: "r96–r105", date: "2026-08-11",
    added: Object.freeze([
      "The delight program: field briefing + timeline, layered gym coverage grid, living-dex mark mode, quick-add sheet, share cards.",
      "Rotation hotfix lane (operator screenshots as the sensor); publish lockfile.",
    ]),
    tweaked: Object.freeze(["61 findings from the measured audit wave."]),
  }),
]);
