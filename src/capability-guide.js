// "What this app can do" — the capability tour (operator ask 2026-08-13:
// "something in the more section that details the capability of the field
// guide"). One line per feature with WHERE it lives; maintained by hand —
// when a feature ships or dies, this list is part of the change.
// Honesty rule for this file: describe only what is actually shipped, in
// the same register the features themselves use (estimates called
// estimates, manual steps called manual).

export const CAPABILITY_GUIDE = Object.freeze({
  updated: "2026-08-14",
  intro: "Offline-first battle reference for a raid group: rankings and math are frozen to a verified data packet (see About for the exact cutoff), your roster lives on this device only, and anything estimated says so.",
  sections: Object.freeze([
    Object.freeze({
      title: "Home — the daily brief",
      items: Object.freeze([
        Object.freeze({ name: "Field briefing lanes", where: "Home", what: "One card each for the Mega, Tier 5 legendary, Shadow, and Max lanes of today's rotation — each dismissible on its own, reopening when the rotation changes." }),
        Object.freeze({ name: "Catch numbers on the card", where: "Home briefing", what: "Hundo and IV-floor CP for the featured boss's encounter bands, readable while walking to the raid." }),
        Object.freeze({ name: "Bring-these counters", where: "Home briefing", what: "Your own best counters when the roster knows them; an honest type-chart hint when it doesn't." }),
        Object.freeze({ name: "Timeline", where: "Home", what: "Now / tonight / this-week events from the rotation and events feeds, with the briefing as the NOW node." }),
        Object.freeze({ name: "Max events", where: "Home Max card", what: "Live or next Max Monday with the featured Dynamax Pokémon, Max Battle Days, and how many Max-flagged Pokémon you have. The Max boss rotation itself isn't in any data feed — the card says so." }),
        Object.freeze({ name: "Showcase advisor", where: "Home timeline", what: "During a showcase event, your best-scoring Pokémon with recorded size — the score is a community-derived estimate and labeled as one." }),
        Object.freeze({ name: "Share tonight's plan", where: "Home briefing", what: "One-tap share cards — the featured plan, or the whole rotation in one card." }),
        Object.freeze({ name: "Today strip", where: "Home", what: "Up to five checkable tasks generated from live data — Max events tonight, bosses leaving, gens near completion." }),
        Object.freeze({ name: "Daily quests", where: "Home", what: "Up to three checkable quests from your real state — catch targets, raid logging, streak keeping." }),
        Object.freeze({ name: "Boss countdowns", where: "Home", what: "Chips for bosses leaving within a week, with an honest ready/not-ready roster check." }),
        Object.freeze({ name: "Evolution holds", where: "Home + dex entries", what: "Warns before you evolve into a Community Day — the exclusive move usually requires evolving during the event window." }),
        Object.freeze({ name: "Solo/duo verdicts", where: "Raids → target", what: "Simulated call on whether your best six can solo, duo, or need a group — with per-counter solo pace on owned attackers." }),
        Object.freeze({ name: "XL Advisor", where: "More → Library", what: "Which owned Pokémon justify the level-50 XL push, with computed gains and standard costs." }),
        Object.freeze({ name: "Before you evolve", where: "dex entries", what: "Best copy to evolve, candy cost, ranked-or-not, and the Community Day hold in one card." }),
      ]),
    }),
    Object.freeze({
      title: "Screenshot scanning — the roster without typing",
      items: Object.freeze([
        Object.freeze({ name: "Bulk scan", where: "Dex grid → Scan screenshots", what: "Select many screenshots at once; each becomes a review row. First use downloads the OCR engine (~7.6MB, one-time), offline after." }),
        Object.freeze({ name: "What a scan reads", where: "any mon-info screenshot", what: "Species (nickname-proof — the candy line and catch footer carry it), CP (including the stylized banner via a targeted retry), HP, weight, height, moves when visible, and the nickname itself." }),
        Object.freeze({ name: "IVs from math, not bars", where: "scan review", what: "CP + HP usually pin the exact IV spread and level; ambiguous pairs show tappable candidates. Mega screens solve too — Super Max (+2 levels) is modeled." }),
        Object.freeze({ name: "Form auto-resolve", where: "scan review", what: "Typing on screen or the CP+HP math picks the right form (Hero vs Crowned, Mega X vs Y); a real ambiguity shows pick buttons, never a guess." }),
        Object.freeze({ name: "Appraisal narrowing", where: "scan review", what: "Add the appraisal screenshot to a batch: its Attack/Defense/HP bars are read as pixels and resolve exact IVs when they land on a valid spread; the verdict phrase still narrows as a fallback." }),
        Object.freeze({ name: "Two-part scans", where: "scan review", what: "A moves-screen photo merges into its Pokémon's row by species, even out of order." }),
        Object.freeze({ name: "Evidence view", where: "each scan row", what: "\"What the scanner saw\" shows the verbatim OCR text with a copy button — every miss is debuggable." }),
      ]),
    }),
    Object.freeze({
      title: "Roster — keep, improve, prune",
      items: Object.freeze([
        Object.freeze({ name: "Quick-add and edit", where: "any dex entry", what: "CP, IV selects with star-tier narrowing, movesets with optimal tags, shiny/lucky/mega level (through Super Max), size, buddy level, Max flags, height/weight." }),
        Object.freeze({ name: "Poke Genie import", where: "More → My Roster", what: "Bulk CSV import of an existing collection." }),
        Object.freeze({ name: "Purge Planner", where: "More → Library", what: "Conservative transfer suggestions as in-game search strings — every recorded, shiny, lucky, hundo, trade-bait, XXS/XXL, or buddy copy is structurally kept." }),
        Object.freeze({ name: "Duplicate Advisor", where: "More → Library", what: "Keep/transfer verdicts across duplicate copies; the best of each group is always a keep." }),
        Object.freeze({ name: "Power-Up Planner", where: "More → Library", what: "Which owned attacker gives the most damage per 1,000 dust against the current rotation — costs from the real tables, gains labeled estimates." }),
        Object.freeze({ name: "Remove and clear", where: "dex rows / More → About", what: "Per-copy Remove behind a confirm; regex bulk-remove with preview-first; full clear behind a double confirm." }),
        Object.freeze({ name: "Trade Planner", where: "More → Library", what: "Trade bait and per-friend offers — precious singles always protected; friendship level and lucky odds live in-game, not here." }),
        Object.freeze({ name: "Hundo Wall", where: "More → Library", what: "Your hundos, shinies, luckies, giants and minis as a trophy room, with a shareable brag card." }),
        Object.freeze({ name: "Field Journal", where: "More → Library", what: "An automatic play diary — saved catches, gen completions, raid results you log, and a visit streak — with a weekly recap card. Lives on this device like everything else." }),
        Object.freeze({ name: "Type Mastery", where: "More → Library", what: "18-type attacker bench meters with honest bands and the best next build for weak lanes." }),
        Object.freeze({ name: "Compare", where: "More → Library / any dex entry", what: "Two Pokémon head-to-head — stats, rankings presence, gym verdicts, your copies." }),
        Object.freeze({ name: "Best Buddy Planner", where: "More → Library", what: "Who gains most from the Best Buddy level, with computed estimates." }),
        Object.freeze({ name: "Milestone badges", where: "Hundo Wall", what: "Streaks, saves, hundos, shinies, raid wins, gens — derived from your journal and roster, honest progress when unearned." }),
        Object.freeze({ name: "Backup and restore", where: "More → About", what: "Everything as one JSON file — export, AirDrop, merge or replace on another device." }),
      ]),
    }),
    Object.freeze({
      title: "Battle answers",
      items: Object.freeze([
        Object.freeze({ name: "Raid target tool", where: "Raids", what: "Counters per boss with weather, encounter bands, DPS-vs-practical movesets, and honest availability badges (Elite TM, event-only, legacy)." }),
        Object.freeze({ name: "Raid Group", where: "More → Raid Group", what: "Share no-secrets roster packs by AirDrop; the app answers group questions — best six across everyone, assignments per boss, power-up overlap." }),
        Object.freeze({ name: "Your battle party", where: "Raids → target", what: "The best six from your actual roster vs the selected boss — role, why, gap chips, and a deterministic battle sim (clear time, faints, relobbies) with its assumptions listed." }),
        Object.freeze({ name: "Gym defense", where: "Gyms", what: "Defender rankings, \"Beats X attackers\" bands (defense, not offense), an 18-type coverage grid against your collection, and a lineup builder with per-lead caps." }),
        Object.freeze({ name: "PvP", where: "PvP", what: "Great/Ultra/Master rankings, recommended movesets and rank-1 IVs, Anti-Meta board, My Team slots, and your own instances ranked against the 4,096 IV space — level 51 assumed only when Best Buddy is recorded." }),
        Object.freeze({ name: "Pokédex", where: "Dex", what: "Real flavor text and species categories, per-form stats, hundo and boss values, weaknesses, multi-role optimal offense with a second-charge suggestion, gym verdicts, league cards, Super Max availability, evolution chains, shiny artwork toggle, sibling-form switcher, two-panel layout on tablets." }),
        Object.freeze({ name: "Surprise me", where: "Dex grid", what: "A random un-caught entry to hunt; gen-completion stamps celebrate a true 100% — never sooner." }),
      ]),
    }),
    Object.freeze({
      title: "Reference library",
      items: Object.freeze([
        Object.freeze({ name: "Guides", where: "More → Library", what: "Budget attackers, future-proof investments, Megas/Primals/Super Megas, type coverage planner, living-dex collection, Shop & Storage value guide." }),
        Object.freeze({ name: "Learning pages", where: "More / bottom routes", what: "Battle basics, Max basics, type chart, glossary, egg pool, Team GO Rocket lineups, gym leaderboard." }),
        Object.freeze({ name: "Celebrations", where: "saves, quests, badges", what: "Hundo and shiny saves burst, quest ticks bounce, badges shimmer — all silent under Reduce Motion." }),
        Object.freeze({ name: "The honesty model", where: "everywhere", what: "Data is frozen to a verified packet with its cutoff shown in About; anything the data can't back renders as an honest absence, and estimates always carry a label." }),
      ]),
    }),
  ]),
});
