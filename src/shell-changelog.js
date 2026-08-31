// Shell version history in patch-note style (operator ask 2026-08-13:
// "simple style patch notes about what was added, removed or tweaked").
// Hand-maintained, newest first; every APP_SHELL_REVISION bump adds its
// entry in the same change — the release isn't done without it. Entries
// before r106 predate detailed records and are grouped honestly.

export const SHELL_CHANGELOG = Object.freeze([
  Object.freeze({
    rev: "r168", date: "2026-08-31",
    tweaked: Object.freeze([
      "Every live Mega and Tier 5 boss is now its OWN briefing card with its own verdict, catch hundo, and dismiss \u2014 replacing r167's lines-under-one-card approach (today: six Mega cards and three Regi cards instead of one Latios pick).",
      "The \"leaves today/in N days\" countdown rows now carry each boss's catch hundo, so the numbers survive card dismissals.",
    ]),
  }),
  Object.freeze({
    rev: "r167", date: "2026-08-31",
    tweaked: Object.freeze([
      "Multi-boss raid days no longer hide behind the single lane pick \u2014 the Mega/Tier 5/Shadow briefing cards now list every OTHER live boss in their lane (\"Also in this lane today\"), each with its catch hundo and window. Today that surfaces all five Ascension Megas instead of just Latios.",
    ]),
  }),
  Object.freeze({
    rev: "r166", date: "2026-08-31",
    added: Object.freeze([
      "Home briefing: Research & GO Pass encounters card \u2014 the Mega Finale choose-your-partner research (Chespin / Fennekin / Froakie) with the hundo and floor CP at the level-15 research catch, live for the event window.",
    ]),
    tweaked: Object.freeze([
      "The whole Road-to-the-Finale raid week is in the rotation: each day's Mega Ascension boss (Victreebel+Dragonite+Malamar, Falinks, Skarmory, Starmie, Raichu X+Y), Mega Latias and Mega Latios all week, Armored Mewtwo and Mega Mewtwo X/Y on the finale weekend \u2014 hundo catch values included.",
      "Rotation feed parsing: multi-species headlines that repeat the Mega/Shadow prefix per name, plus \"Armored Mewtwo\" and \"(Hero of Many Battles)\" names, now resolve instead of being skipped.",
    ]),
  }),
  Object.freeze({
    rev: "r165", date: "2026-08-30",
    added: Object.freeze([
      "Spread Checker (More \u2192 Library): pick any species, set the IVs from an alert-map sighting, and get the whole verdict \u2014 per-league rank of 4096 with CP@level, the species' real meta standing, raid and gym context, evolutions walked automatically (checking a Spheal answers about Walrein), and an honest one-line call.",
    ]),
    tweaked: Object.freeze([
      "Evolve-advisor copy lines now include the CP the copy reaches at its league's level.",
    ]),
  }),
  Object.freeze({
    rev: "r164", date: "2026-08-29",
    tweaked: Object.freeze([
      "Gym defender rows' \"Best answers\" render one counter per line instead of a comma-run of names and movesets.",
    ]),
  }),
  Object.freeze({
    rev: "r163", date: "2026-08-26",
    added: Object.freeze([
      "The evolve advisor now also covers the event's bulk spawns WITHOUT bonus moves — a collapsible \"worth hunting?\" list giving each line's honest verdict (this event: Numel, Drifloon, Elgyem, Pawmi, and Foongus are all candy-and-dex value only).",
    ]),
  }),
  Object.freeze({
    rev: "r162", date: "2026-08-25",
    tweaked: Object.freeze([
      "Advisor IV targets moved onto their league's own rank line (\"Great League: #1 — target 0/15/10 @ L23.5\", per league), and gym-role rows now say the truth about IVs: gym defense wants bulk, a hundo is the safe chase.",
    ]),
  }),
  Object.freeze({
    rev: "r161", date: "2026-08-25",
    tweaked: Object.freeze([
      "Every advisor row now leads with each rank as its own bold line — per PvP league, per raid lane (Shadow labeled), gym defense — plus the species' standing gym defender rank out of all 955 (Corviknight: #7, who knew).",
    ]),
  }),
  Object.freeze({
    rev: "r160", date: "2026-08-25",
    tweaked: Object.freeze([
      "Ships the shadow fixes that missed r159's build: \"as Shadow:\" labels on dual raid claims, and the standing Frustration warning on the advisor card.",
    ]),
  }),
  Object.freeze({
    rev: "r159", date: "2026-08-25",
    tweaked: Object.freeze([
      "Advisor move recipes are labeled slot lines now — Fast / Charged / 2nd Charged (with unlock dust) per role, the event move flagged in place — instead of a sentence you had to parse at the TM screen.",
      "Shadow-sibling raid claims are labeled (\"as Shadow: Dark raid #1\") instead of reading as a duplicate, and the advisor carries a standing warning: evolving a Shadow keeps Frustration and does not reliably grant the event move — clear it at a Rocket takeover first.",
    ]),
  }),
  Object.freeze({
    rev: "r158", date: "2026-08-25",
    tweaked: Object.freeze([
      "The PvP IV target on advisor rows is its own bold accent line now (\"Great League target: 0/15/10 @ L23.5\") instead of a trailing clause you could glance past.",
    ]),
  }),
  Object.freeze({
    rev: "r157", date: "2026-08-25",
    added: Object.freeze([
      "The evolve advisor now prints the full move recipe per role — \"Raids (Steel): Bullet Punch + Meteor Mash\", \"Master League: Shadow Claw + Meteor Mash & Earthquake (2nd slot: 75,000 dust)\", gym defense sets included — straight from each role's own optimal-set data.",
    ]),
  }),
  Object.freeze({
    rev: "r156", date: "2026-08-25",
    tweaked: Object.freeze([
      "The evolve-move advisor got its own row layout — the borrowed list styling was collapsing text into vertical one-character columns on portrait tablets (the \"garbled cards\" reports). Rows now carry an explicit hunt-priority number (#1 first), a species with two granted moves shows as one row, and a Shadow sibling's raid rank no longer inflates a wild catch's priority.",
    ]),
  }),
  Object.freeze({
    rev: "r155", date: "2026-08-25",
    tweaked: Object.freeze([
      "Fixed: the evolve-move advisor card vanished after the r154 gate — Home never loads the rankings files it was waiting for. They now ride Home's existing deferred fetch (the roster-gap teaser's lane), so the card fills in a few seconds after Home opens.",
      "PvP advice lines on the advisor now carry the exact rank-1 target spread (\"Target: 0/15/10 @ L23.5\") from the same math the dex league cards use.",
    ]),
  }),
  Object.freeze({
    rev: "r154", date: "2026-08-25",
    tweaked: Object.freeze([
      "Fixed: the evolve-move advisor rendered confident wrong skips on cold boot (Lickilicky, Great League #1, read as \"not worth it\") because Home drew the card before the rankings data loaded — verdicts now wait for real data behind an honest loading line.",
      "The advisor now counts gym-defense upgrades too: Togekiss Aura Sphere (+20.1% defense output), Metagross Meteor Mash (+22.3%), Feraligatr Hydro Cannon (+23.7%) flip to evolve on their gym value.",
    ]),
  }),
  Object.freeze({
    rev: "r153", date: "2026-08-25",
    added: Object.freeze([
      "Event evolve-move advisor on Home: during an event granting evolution-exclusive moves (Worlds week now), every grant gets an evolve/skip verdict with the real reasons \u2014 which ranked roles the move headlines with its measured margin, which of YOUR copies to evolve (hundo ordering for raid/Master roles, league-spread ordering for Great/Ultra \u2014 a hundo is not the PvP pick), and skips collapsed with the set that beats them named. Grant lists are curated per event and validated at build.",
    ]),
  }),
  Object.freeze({
    rev: "r152", date: "2026-08-24",
    tweaked: Object.freeze([
      "Elite TM Planner rows now say how much the elite move is actually worth: \"+6.4% over the best TM-able set\" (measured with the same DPS engine that ranks attackers) or \"no TM-able alternative\" when nothing else fills the role. The planner already only suggested elite moves that ARE the optimal set \u2014 now it shows the margin too.",
    ]),
  }),
  Object.freeze({
    rev: "r151", date: "2026-08-23",
    added: Object.freeze([
      "Move details, finally with numbers: every move sheet shows power, duration, energy, DPS, EPS (fast) and damage-per-energy (charged) \u2014 labeled as base rates, no STAB/weather.",
      "Elite TM Planner (More \u2192 Library) \u2014 which of YOUR Pok\u00e9mon deserve the free World Championships Elite TMs: never-returning exclusives rank above Community-Day-Classic moves (those come back every December), event-only moves correctly excluded.",
    ]),
    tweaked: Object.freeze([
      "Dex entries outside the top-100 defender ranking now say so honestly (a score verdict over ~950 eligible, not missing data) \u2014 the Gardevoir question.",
    ]),
  }),
  Object.freeze({
    rev: "r150", date: "2026-08-23",
    added: Object.freeze([
      "Appraisal bars read as pixels: when a CP+HP scan is ambiguous (the Gardevoir 3005/143 case \u2014 8 possible spreads), include the appraisal screenshot in the batch and its Attack/Defense/HP bars resolve the exact IVs automatically \u2014 a bar read only counts when it lands exactly on a mathematically valid spread. Scan evidence shows each bar's fill percentage.",
    ]),
  }),
  Object.freeze({
    rev: "r149", date: "2026-08-23",
    tweaked: Object.freeze([
      "CP banner reading, round four: sunny-weather screens put the white CP text on a bright background where every existing preprocess dissolved it (the Slaking 3798 report) — a new near-white-isolation pass keeps only the brightest pixels as ink before OCR.",
    ]),
  }),
  Object.freeze({
    rev: "r148", date: "2026-08-22",
    added: Object.freeze([
      "Every dex entry's PvP league cards now show the optimal stat distribution even outside the ranked top 150 — the true best IV spread, level, and CP for Great and Ultra (computed from the same stat-product model the Yours lines use), and the plain truth for Master (no cap, hundo is simply best).",
    ]),
  }),
  Object.freeze({
    rev: "r147", date: "2026-08-22",
    added: Object.freeze([
      "Raid Days join the briefing with their own lead lane — Starmie Super Mega Raid Day shows today with catch values (hundo 1476 on the base-Starmie encounter), and a single-day window can no longer lose its card to a week-long boss. Future \"Super Mega Raid Day\" placeholders without a named species stay honestly absent until announced.",
    ]),
  }),
  Object.freeze({
    rev: "r146", date: "2026-08-20",
    added: Object.freeze([
      "Hardening audit (six dimensions, adversarially verified): the Raid Group members list actually displays now (its data was never wired to the view), gym coverage bands stay open across refreshes, Type Mastery / Buddy Planner / XL Advisor / Power-Up Planner got their missing styling (plus the badge shelf, countdown chips, and sim line whose styles had silently never shipped), dismissal writes can't crash on full storage, and five new device-journey tests cover the scan flow, battle party, Compare chip, dex deep-links, and quest-to-journal path.",
    ]),
  }),
  Object.freeze({
    rev: "r145", date: "2026-08-20",
    tweaked: Object.freeze([
      "Fixed: the hundo/shiny confetti never fired (a scope bug its own safety net swallowed silently) — and the same sweep caught two sibling bugs: the dex Compare chip and the push-permission toggle both crashed on tap. All three share one fix, and a new test bans the whole bug class.",
    ]),
  }),
  Object.freeze({
    rev: "r144", date: "2026-08-19",
    tweaked: Object.freeze([
      "The Max card now headlines the boss that is live RIGHT NOW (Dynamax Magikarp this week) instead of leading with next Monday's schedule — the upcoming Max Monday demotes to a note line under it.",
    ]),
  }),
  Object.freeze({
    rev: "r143", date: "2026-08-19",
    added: Object.freeze([
      "The fun-effects pass: a gold particle burst when you save a hundo (purple for a shiny), the save confirmation pops instead of appearing, quest checkmarks tick with a bounce, the streak flame breathes, and earned badges shimmer once. All of it stays quiet under Reduce Motion.",
    ]),
    tweaked: Object.freeze([
      "The loading screen now centers itself in the viewport instead of stranding at the top on tall portrait screens (iPad report).",
    ]),
  }),
  Object.freeze({
    rev: "r142", date: "2026-08-19",
    added: Object.freeze([
      "The weekly raid rotation now follows the events feed automatically \u2014 Tier 5, Mega, and Shadow raid lanes flip the moment their week starts (Lunala and Mega Swampert today), including multi-boss weeks, with future weeks held back until their day. Operator reports still override.",
    ]),
    tweaked: Object.freeze([
      "Fixed: the briefing's raid lanes went empty when a rotation week rolled over before the operator reported it (Groudon/Mega Garchomp expired, nothing replaced them).",
    ]),
  }),
  Object.freeze({
    rev: "r141", date: "2026-08-17",
    tweaked: Object.freeze([
      "Live Max Battle boss lines on the briefing now carry catch values \u2014 hundo CP and the IV-floor CP at the level-20 catch, straight from the raid target tool.",
    ]),
  }),
  Object.freeze({
    rev: "r140", date: "2026-08-17",
    tweaked: Object.freeze([
      "Fixed: the briefing disagreed with itself on Max Monday (the event line said Magikarp while the current-boss row still said Beldum). Max Monday bosses now derive straight from the events feed \u2014 no more waiting on a manual Monday report \u2014 and future Mondays stay out of the \"live now\" lines until their day arrives.",
    ]),
  }),
  Object.freeze({
    rev: "r139", date: "2026-08-16",
    added: Object.freeze([
      "Sim everywhere \u2014 the Raid Target page now shows a solo/duo/group verdict simulated from your actual best six, and each counter you own (in the detailed view) carries its simulated solo pace and faint count.",
      "XL Advisor (More \u2192 Library) \u2014 which owned Pok\u00e9mon are worth pushing past level 40, with real CPM gains and the standard XL cost table.",
      "Before-you-evolve checklist on dex entries \u2014 which copy to evolve (shiny/lucky flagged), candy cost, whether the evolved form is ranked, and the Community Day hold in one card.",
      "Day-streak flame on Home and quest completions now land in the Field Journal's weekly recap.",
      "App-icon shortcuts: Field Journal and My Roster join the long-press menu.",
    ]),
  }),
  Object.freeze({
    rev: "r138", date: "2026-08-16",
    added: Object.freeze([
      "Hold off on evolving \u2014 a Home advisory and a banner on affected dex entries when a Community Day is coming for a species' line: evolve during the window (not before) for the usually-granted exclusive move. Flips to \"evolve now\" while the event is live.",
    ]),
  }),
  Object.freeze({
    rev: "r137", date: "2026-08-15",
    tweaked: Object.freeze([
      "Fixed: \"Share the whole rotation\" crashed on device (\"Can't find variable: state\") since r132 and then dumped you on the Raids tab — the share action now gets its rotation data the same way every other share card does.",
    ]),
  }),
  Object.freeze({
    rev: "r136", date: "2026-08-15",
    added: Object.freeze([
      "Battle simulation \u2014 the raid party panel now runs a deterministic fight sim (real damage formula, energy, faints, relobbies) over your best six, with every simplification listed under \"Simulation assumptions\".",
      "Type Mastery (More \u2192 Library) \u2014 18-type bench meters: honest bands, your best owned attacker per type, and the best next build for the thin lanes.",
      "Daily quests on Home \u2014 up to three checkable tasks generated from your real state (catch targets, raid logging, streak keeping, gen closing).",
      "Milestone badges on the Hundo Wall \u2014 streaks, save counts, hundos, shinies, raid wins, gen completions; unearned ones show honest progress.",
      "Boss countdown chips on Home \u2014 \"leaves in N days\" with an honest ready/not-ready check against your roster.",
      "Compare (More \u2192 Library, or the Compare chip on any dex entry) \u2014 two Pok\u00e9mon head-to-head: stats with winners marked, rankings presence, gym verdicts, your owned copies.",
      "Best Buddy Planner (More \u2192 Library) \u2014 which owned Pok\u00e9mon gains the most from the +1 buddy level, with computed damage-ratio estimates.",
    ]),
  }),
  Object.freeze({
    rev: "r135", date: "2026-08-14",
    added: Object.freeze([
      "Field Journal (More \u2192 Library) \u2014 an automatic diary of your play: every catch you save (scans, quick-adds, imports), gen completions, raid results you tap in, and a day-streak that survives even when old entries age out.",
      "Weekly recap card \u2014 saves, scans, hundos, shinies, raids won this week, in one line of chips.",
      "Raid quick-log \u2014 Won/Lost buttons for today's live bosses, right on the journal page.",
    ]),
    tweaked: Object.freeze([
      "Fixed a day-boundary bug west of UTC \u2014 \"today\" in the briefing, share cards, and journal now ends at YOUR midnight, not London's.",
    ]),
  }),
  Object.freeze({
    rev: "r134", date: "2026-08-14",
    added: Object.freeze([
      "Raid Group (More → Your stuff): export your roster as a small no-secrets pack, AirDrop it, import the group's packs — then get group answers per boss: the best six across everyone with names attached, who fields what, and power-up overlap notes.",
    ]),
  }),
  Object.freeze({
    rev: "r133", date: "2026-08-14",
    added: Object.freeze([
      "Your battle party — the Raid Target page builds the best six from YOUR roster vs the selected boss, with honest role/why lines, a qualitative readiness band (never a fabricated battle sim), and gap chips naming what you're missing.",
      "Live-data layer: new species gap-fill from the current masterfile (named honestly, excluded from all battle math) and an automatic, fail-safe masterfile refresh in the pipeline with a weekly what-moved diff report.",
    ]),
  }),
  Object.freeze({
    rev: "r132", date: "2026-08-14",
    added: Object.freeze([
      "Real Pokédex flavor text and species categories on every entry — straight from the game's own text.",
      "Hundo Wall trophy case (More → Library) with a shareable brag card.",
      "Shiny artwork toggle on dex entries (~1,100 shiny sprites, cached like the rest).",
      "Surprise me — a random un-caught dex entry to hunt, from the collection grid.",
      "Gen-completion stamps on the living dex — celebrations only at a true 100%.",
      "Today strip on Home — up to five honest, checkable tasks from live data.",
      "Share the whole rotation — one card covering every live boss's plan.",
    ]),
  }),
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
