import { jargonTerm } from "./glossary.js";

// Curated, sourced Tips & Tricks. Every entry cites where the mechanic is
// documented and carries a user-visible "verified" stamp (rendered by
// views/tricks.js) so a stale tip is easy to spot and re-check later —
// nothing here is a live game-state read, all of it is reference content.
export const TIP_CATEGORIES = Object.freeze({
  trading: "Trading",
  raids: "Raids",
  candy: "Candy & XP",
  gyms: "Gyms",
  pvp: "PvP Basics",
  qol: "Quality of Life",
  community: "Community",
});

export const TIPS = Object.freeze([
  // Source: sylvie.fyi/posts/pogo-luckies/ (cross-checked against
  // pokemongohub.net's "How Do Guaranteed Lucky Trades Work" explainer),
  // both retrieved 2026-07. Niantic doesn't publish this rule itself — it's
  // reverse-engineered by the trading community from observed trade results.
  // Cutoff/cap have moved twice since this tip was first written (Feb 2025:
  // 2019-or-earlier/35; New Year's 2026 event: 2020-or-earlier/45) — re-check
  // before trusting the numbers past their verified date.
  Object.freeze({
    id: "trade-guaranteed-lucky",
    category: "trading",
    title: "Trade your oldest Pokémon for a guaranteed Lucky",
    verified: "2026-07",
    body: `If either Pokémon in a trade was caught in 2020 or earlier, the trade is guaranteed to turn Lucky — you don't need both sides to be old, just one. Each account has a hidden counter capped at 45 guaranteed-lucky trades it can trigger (this cutoff/cap has crept forward over time — most recently from 2019-or-earlier/35 to 2020-or-earlier/45 with the New Year's 2026 event); past that cap you can still receive a guaranteed Lucky from a friend's old catch, you just can't trigger any more yourself. Trading two old Pokémon at once wastes the second one — only the oldest catch in the trade matters.`,
  }),
  // Source: Niantic Support "Trading Pokémon" article; registration/rarity-
  // driven cost curve widely documented (e.g. Pokémon GO Hub's trading
  // guide), retrieved 2026-07.
  Object.freeze({
    id: "trade-distance-dust",
    category: "trading",
    title: "Catch distance affects trade Candy, not trade cost",
    verified: "2026-07",
    body: `${jargonTerm("stardust", "Stardust")} cost is driven by whether a Pokémon is already registered in your Pokédex and whether it's a shiny or Legendary/Mythical (a "special" trade) — not by how far apart the two Pokémon were caught. A standard trade of two already-registered, non-special Pokémon always costs a flat 100 Stardust, regardless of distance. What catch distance actually changes is the bonus Candy the trade pays out — the farther apart the two catch locations, the more bonus Candy on top of the usual one Candy per trade.`,
  }),
  // Source: Niantic Support "Trading Pokémon" — standard-trade flat cost and
  // special-trade friendship discount tiers, retrieved 2026-07.
  Object.freeze({
    id: "trade-friendship-discount",
    category: "trading",
    title: "Standard trades always cost 100 Stardust, even at Best Friends",
    verified: "2026-07",
    body: `Only "special" trades (an unregistered Pokémon, or a shiny/Legendary/Mythical) get a friendship discount — a standard trade of two already-registered, non-special Pokémon costs a flat 100 ${jargonTerm("stardust", "Stardust")} at every friendship level, Best Friends included. Special-trade cost falls as friendship climbs, bottoming out at Best Friends around 800 Stardust for one special factor (one side unregistered, or one side shiny/Legendary) up to roughly 40,000 Stardust when both apply. There's no free tier — Best Friend status lowers the cost, it doesn't remove it.`,
  }),

  // Source: widely documented raid-lobby behavior (e.g. Pokémon GO Hub raid
  // guides); the invite-timer reset itself is player-observed and stable
  // across app versions, retrieved 2026-07.
  Object.freeze({
    id: "raid-relobby-timing",
    category: "raids",
    title: "Back out and rejoin to reset the invite timer",
    verified: "2026-07",
    body: `If a raid lobby is short on players, leave it and tap back in before the countdown hits zero — this resets the invite timer without losing your spot or your raid pass/ticket, buying more time for friends to join. It only works before the timer expires, so don't wait until the last second.`,
  }),
  // Source: Niantic's weather-boost mechanics documentation and community
  // testing (e.g. Pokémon GO Hub weather guide), retrieved 2026-07.
  Object.freeze({
    id: "raid-weather-catch-bonus",
    category: "raids",
    title: "Catch raid bosses during matching weather for a higher-level Pokémon",
    verified: "2026-07",
    body: `When the current ${jargonTerm("weather-boost", "weather boost")} matches the raid boss's type, the Pokémon you catch afterward comes in at level 25 instead of the normal flat level-20 raid-catch level (and therefore higher CP) — a flat bump that has nothing to do with your own trainer level. It's the same boss and the same fight either way; only the catch's level changes.`,
  }),
  // Source: standard, long-documented catch mechanics (e.g. Pokémon GO Hub
  // "best catch rate" guide), retrieved 2026-07.
  Object.freeze({
    id: "raid-golden-razz-timing",
    category: "raids",
    title: "Save Golden Razz Berries for the last one or two balls",
    verified: "2026-07",
    body: `A Golden Razz Berry gives the single biggest catch-rate multiplier in the game (2.5×) — bigger than a regular Razz Berry (1.5×). Since Golden Razz Berries are earned in limited amounts (raid rewards, Adventure Sync, and Team GO Rocket battles), feeding one right before your last couple of throws on a tough boss gets more value than using one on every throw from the start.`,
  }),
  // Source: standard catch mechanics guides (e.g. Pokémon GO Hub, Dexerto
  // catch-mechanics breakdowns), retrieved 2026-07.
  Object.freeze({
    id: "raid-curveball-throws",
    category: "raids",
    title: "A Curveball adds a flat catch bonus on top of your throw",
    verified: "2026-07",
    body: `Spinning the Poké Ball before you throw (a Curveball) adds a flat 1.7× catch-rate multiplier that stacks with your throw accuracy (Nice/Great/Excellent) and any berry used. Landing a Curveball plus an Excellent throw plus a Golden Razz Berry combines all three multipliers, which is the strongest catch setup available without an Ultra Ball advantage.`,
  }),

  // Source: standard, long-documented candy mechanics; Pokémon GO Hub's
  // testing that Pinap's doubling doesn't extend to the separate Mega bonus
  // Candy, retrieved 2026-07.
  Object.freeze({
    id: "candy-pinap-mega-stack",
    category: "candy",
    title: "Stack a Pinap Berry with an active Mega for more Candy per catch",
    verified: "2026-07",
    body: `Having a ${jargonTerm("mega", "Mega")} Evolved Pokémon active in your party gives a small bonus ${jargonTerm("candy", "Candy")} on catches of that Mega's type, on top of the normal catch Candy. A Pinap Berry doubles the catch's base Candy, but that doubling doesn't extend to the separate Mega bonus Candy — so using both still nets more total Candy than either alone, just not a fully doubled total.`,
  }),
  // Source: Niantic's Buddy Adventure documentation and Excited-mood/Poffin
  // mechanics, widely summarized (e.g. Pokémon GO Hub buddy guide), retrieved
  // 2026-07.
  Object.freeze({
    id: "candy-buddy-distance",
    category: "candy",
    title: "Feed Poffins (or fill hearts) to shrink buddy walking distance",
    verified: "2026-07",
    body: `Buddy walking distance requirements aren't fixed — filling your buddy's friendship hearts, or feeding it a Poffin, puts it in "Excited" mood, which halves the distance needed for its next walking Candy. Best Buddy status itself doesn't change walking distance or add a catch-Candy bonus for that species; that catch-Candy bonus belongs to the separate Mega Evolution mechanic, not to buddies.`,
  }),
  // Source: standard, well-documented Lucky Egg mechanics (doubles all XP for
  // 30 minutes, including one-time bonuses), retrieved 2026-07.
  Object.freeze({
    id: "candy-lucky-egg-friendship-stack",
    category: "candy",
    title: "Batch friendship level-ups during a Lucky Egg",
    verified: "2026-07",
    body: `A Lucky Egg doubles all XP earned for 30 minutes, and that includes the one-time XP bonus from leveling up friendship with a friend (opening gifts, trading, or battling together). Saving up several friends who are close to their next friendship level and leveling them all up together during one active Lucky Egg doubles every one of those one-time bonuses instead of just your catch/spin XP.`,
  }),

  // Source: Niantic Support "Battling at Gyms" (raw/official-gym-battles.html
  // in this app's own sourced-data manifest) and long-documented berry-type
  // motivation differences, retrieved 2026-07.
  Object.freeze({
    id: "gym-berry-feeding",
    category: "gyms",
    title: "A Golden Razz restores more gym motivation than any other berry",
    verified: "2026-07",
    body: `Feeding a defender restores its ${jargonTerm("motivation", "motivation")} (which otherwise decays over time and after losses) and earns you 20 Stardust per berry, up to 10 berries per Pokémon every 30 minutes. A Golden Razz Berry restores noticeably more motivation per feed than a regular Razz, Nanab, or Pinap Berry, so it's the most efficient berry to spend on a defender you want to keep motivated for longer.`,
  }),
  // Source: Niantic Support "Battling at Gyms" (raw/official-gym-battles.html
  // in this app's own sourced-data manifest), retrieved 2026-07.
  Object.freeze({
    id: "gym-coin-cap",
    category: "gyms",
    title: "Gym coins cap at 50 a day, earned only while defending",
    verified: "2026-07",
    body: `Defending a gym earns 1 PokéCoin per 10 minutes your Pokémon is deployed there, up to a hard cap of 50 coins per real-world day per account. Coins accrue automatically once a defender returns home (no need to check in), but raiding or attacking gyms never earns coins — only successful defense time does.`,
  }),

  // Source: Pokémon GO's official Trainer Battle mechanics — GamePress's
  // "Attack-Based Charged Move Priority" writeup on the Attack-stat tiebreak,
  // retrieved 2026-07. Points to this app's existing Swap page rather than
  // re-teaching full PvP theory here.
  Object.freeze({
    id: "pvp-cmp",
    category: "pvp",
    title: "CMP decides who moves first on a simultaneous charged move",
    verified: "2026-07",
    body: `CMP ("Charge Move Priority") is what decides which Pokémon's ${jargonTerm("charged-move", "charged move")} lands first when both trainers fire one at the same moment — the Pokémon with the higher Attack stat at that moment wins the race. It matters most for close mirror matchups; the Battle Swap page (see the ? button there) walks through applying this live, so it isn't repeated in full here.`,
  }),
  // Source: standard PvP fast-move energy/damage mechanics; pointer to this
  // app's own Swap tool rather than restating full theory, retrieved 2026-07.
  Object.freeze({
    id: "pvp-fast-move-counting",
    category: "pvp",
    title: '"Counting" fast moves tells you when a charged move is coming',
    verified: "2026-07",
    body: `Every ${jargonTerm("fast-move", "fast move")} builds a fixed, known amount of energy — so counting how many fast moves your opponent has thrown tells you almost exactly when they'll have enough energy for a charged move, letting you shield or swap in time. This is a live-battle skill more than a one-off fact; the Swap page's Step 3 applies it to your actual matchup instead of restating the theory here.`,
  }),

  // Source: Niantic Support / long-documented Adventure Sync behavior,
  // retrieved 2026-07.
  Object.freeze({
    id: "qol-adventure-sync",
    category: "qol",
    title: "Turn on Adventure Sync so walking still counts with the app closed",
    verified: "2026-07",
    body: `Adventure Sync lets Pokémon GO track your walking distance in the background using your phone's step/location sensors, even with the app fully closed — that distance still counts toward egg hatching and buddy Candy. It's opt-in per phone permission (Settings inside the app, then your phone's location permission), and it's the only way background walking counts at all.`,
  }),
  // Source: theclick.gg "How Many Gifts Can You Open a Day" 2026 explainer
  // and Niantic's gift-limit documentation, retrieved 2026-07. Limits are
  // Niantic-adjustable, so treat these as the current standard, not fixed.
  Object.freeze({
    id: "qol-gift-limits",
    category: "qol",
    title: "Gifts: one send per friend a day, ~30 opens a day",
    verified: "2026-07",
    body: `You can send one Gift to each friend per day, hold up to 20 in your Bag at once, and open roughly 30 Gifts in a day under Niantic's current standard limit (special events sometimes raise the open cap temporarily). Sending to your most-active friends first, before your daily gift stock runs out, gets the most Stardust/item opens back.`,
  }),
  // Source: this is a first-party in-app toggle (Settings → AR), not a
  // third-party tool or automation — verified non-bannable because it's
  // Niantic's own setting. Explicitly excludes any auto-catch/throw
  // automation, macro, or bot tool: those touch ToS and aren't covered here.
  Object.freeze({
    id: "qol-quick-catch",
    category: "qol",
    title: "Turn off AR to catch faster",
    verified: "2026-07",
    body: `Switching AR off in the catch screen (tap "AR" in the top-right, or disable it in Settings → AR+) skips the camera-overlay load and drops straight into the flat catch background, which loads and throws noticeably faster during a long catch session. It's a built-in Niantic setting, not a third-party tool — this app does not cover or recommend any auto-catch, macro, or automation tool, which risk account action.`,
  }),

  // Source: Niantic Campfire Help Center "Meetup Check-ins and Rewards" and
  // Campfire community-ambassador reward summaries (digancy.com), retrieved
  // 2026-07. Campfire is Niantic's own companion app, so recommending it
  // carries none of the third-party-tool risk above.
  Object.freeze({
    id: "community-campfire-checkin",
    category: "community",
    title: "Check in on Campfire for free event Timed Research",
    verified: "2026-07",
    body: `Niantic Campfire is the official companion app for finding nearby raids and meetups. At an eligible in-person meetup (Community Days, Raid Hours/Days, Research Days, GO Battle Days, and more), tap "Check In" once you've arrived, then open Pokémon GO and claim the Meetup Check-in reward from the Events tab within an hour to unlock that event's free Timed Research. Find it at campfire.nianticlabs.com or your app store — it's first-party, so there's no scraping or account risk involved.`,
  }),
]);

export const TIPS_BY_ID = Object.freeze(Object.fromEntries(TIPS.map((tip) => [tip.id, tip])));
