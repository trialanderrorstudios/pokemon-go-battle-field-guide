// Plain-language jargon glossary. Single source of truth for the #glossary
// page and the tap-any-jargon helper used at high-traffic render sites.
export const GLOSSARY = Object.freeze([
  {
    id: "cp",
    term: "CP",
    definition: "Combat Power — one number that rolls a Pokémon's level and stats into a rough power score. Handy for quick comparisons, but leagues cap it, so bigger isn't always better.",
  },
  {
    id: "iv",
    term: "IV",
    definition: "Individual Values — small hidden bonuses (0–15 each for Attack, Defense, and Stamina) that make two Pokémon of the same species and level slightly different in strength.",
  },
  {
    id: "stat-product",
    term: "stat product",
    definition: "Attack × Defense × HP for one specific IV spread, built up to a league's CP cap. It's the standard way to compare two IV spreads for PvP — a rank of \"#247 of 4096\" means 246 other IV spreads produce a higher stat product than this one at that cap.",
  },
  {
    id: "hundo",
    term: "hundo",
    definition: "A Pokémon with perfect 15/15/15 IVs — the best possible stats for its encounter level. Short for \"100%.\"",
  },
  {
    id: "fast-move",
    term: "fast move",
    definition: "The move you trigger by tapping the screen. It hits quickly for modest damage and builds energy toward your charged move.",
  },
  {
    id: "charged-move",
    term: "charged move",
    definition: "A stronger move that costs saved-up energy from fast moves. It hits much harder, but you can't use it until enough energy builds up.",
  },
  {
    id: "tm",
    term: "TM",
    definition: "Technical Machine — an item used to change a Pokémon's moves. An Elite TM can unlock a move the Pokémon can't normally relearn, like a limited-time or legacy move.",
  },
  {
    id: "shadow",
    term: "Shadow",
    definition: "A Shadow Pokémon was corrupted by Team GO Rocket. It hits harder and takes more damage than its regular form, and can be \"purified\" to remove that trade-off.",
  },
  {
    id: "meta",
    term: "meta",
    definition: "The most common top-ranked Pokémon in a league right now — not everyone's team, but the ones showing up across many opponents' rankings.",
  },
  {
    id: "mega",
    term: "Mega",
    definition: "A temporary, more powerful evolution activated with Mega Energy. It boosts that Pokémon (and its type-mates) in raids and gyms for a limited time, then reverts.",
  },
  {
    id: "primal",
    term: "Primal",
    definition: "Like a Mega Evolution, but exclusive to Kyogre and Groudon — a temporary, powered-up form activated with their own Primal Energy.",
  },
  {
    id: "weather-boost",
    term: "weather boost",
    definition: "In-game weather refreshes roughly every hour and boosts specific move types, giving Pokémon using those moves extra damage and a higher level (and IV floor) when caught.",
  },
  {
    id: "raid-tiers",
    term: "raid tiers",
    definition: "Raids are grouped into tiers (1, 3, 5, Mega, and so on) by difficulty and the boss's strength. Higher tiers need more trainers or stronger teams.",
  },
  {
    id: "league-cp-caps",
    term: "league CP caps",
    definition: "PvP leagues limit how strong (by CP) your Pokémon can be — Great League caps at 1500, Ultra League at 2500. Master League has no cap at all.",
  },
  {
    id: "pvpoke-sim-rating",
    term: "sim rating",
    definition: "A simulated 1-on-1 battle score from PvPoke, out of 1000. 500 means an even fight; higher favors the Pokémon shown, lower favors its opponent. It's a computer simulation, not a real recorded battle.",
  },
  {
    id: "meta-leaders",
    term: "the meta",
    definition: "This app doesn't have real usage or ladder-share data, so \"the meta\" here is a proxy: the top-ranked picks in this app's own Top 50 for that league. Treat it as a rank cutoff, not confirmed popularity.",
  },
  {
    id: "stardust",
    term: "Stardust",
    definition: "A currency earned from catching, trading, and other activities, spent alongside Candy to power up a Pokémon's level.",
  },
  {
    id: "candy",
    term: "Candy",
    definition: "A species-specific currency used to power up or evolve a Pokémon. XL Candy is a rarer version needed to push a Pokémon past level 40.",
  },
  {
    id: "dodge",
    term: "dodge",
    definition: "Swiping left or right just before an enemy attack lands, cutting most of its damage in raids and gyms. There's no dodge in PvP; swapping Pokémon is your defense there instead.",
  },
  {
    id: "stagger",
    term: "stagger",
    definition: "Two players attacking the same gym defender with their start times offset, so the defender is always under attack from someone. Used to clear a strong defender faster than either player could alone.",
  },
  {
    id: "motivation",
    term: "motivation",
    definition: "A gym defender's heart-shaped meter. It falls from time passing and from losing battles; feeding it Berries raises it back up. As it falls, the defender's CP progressively drops, and at zero it leaves the gym the next time it loses a battle.",
  },
  {
    id: "cp-decay",
    term: "CP decay",
    definition: "As a gym defender's motivation falls, its CP temporarily drops too, making it easier to beat. Higher-CP defenders lose motivation faster, so a lower-CP specialist can actually hold a gym longer.",
  },
  {
    id: "breakpoint",
    term: "breakpoint",
    definition: "The next power-up level where a move's damage-per-hit rounds up to a new whole number. Below a breakpoint, extra power-ups don't add any damage per hit; at it, they do.",
  },
  {
    id: "buddy-hearts",
    term: "hearts",
    definition: "Affection points earned with your current buddy Pokémon by walking, feeding treats, playing, battling, taking snapshots, and visiting new PokéStops together. They add up toward that Pokémon's buddy level.",
  },
  {
    id: "best-buddy",
    term: "Best Buddy",
    definition: "The highest buddy level, reached at 300 hearts. While a Best Buddy is set as your active buddy, it gets a small permanent CP boost — about one power-up level's worth.",
  },
  {
    id: "meta-group",
    term: "meta group",
    definition: "This app's stand-in for \"what's commonly used\": the top-ranked picks in a league by pvpoke's meta-weighted score. It's a proxy, not real ladder usage or pick-rate data — this app doesn't have live battle stats.",
  },
]);


export const GLOSSARY_BY_ID = Object.freeze(
  Object.fromEntries(GLOSSARY.map((entry) => [entry.id, entry])),
);


export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}


// Wraps a rendered label in a checkbox+label disclosure so a tap reveals (and
// a second tap dismisses) the plain-language definition inline, with no
// custom JS event wiring needed. Uses <span>/<input>/<label> rather than
// <details>/<summary> because call sites embed this inside <p>, <small>, and
// <strong> — <details> is flow content, not phrasing content, so browsers
// force-close the enclosing <p> at its start tag and eject it as a sibling.
// Falls back to a plain escaped label if the id isn't a known glossary term.
let jargonInstanceCount = 0;
export function jargonTerm(id, label = id) {
  const entry = GLOSSARY_BY_ID[id];
  if (!entry) return escapeHtml(label);
  const instanceId = `jargon-${escapeHtml(id)}-${jargonInstanceCount++}`;
  return `<span class="jargon-term" data-jargon-term="${escapeHtml(id)}"><input type="checkbox" id="${instanceId}" class="jargon-toggle"><label for="${instanceId}" class="jargon-label">${escapeHtml(label)}</label><span class="jargon-def">${escapeHtml(entry.definition)}</span></span>`;
}
