// Shop & storage value guide (operator ask 2026-08-13: "shop item priority?
// what is a good amount of storage to shoot for? what shop items are good
// values?"). Hand-curated from a sourced research pass (2026-08-13):
// GamePress coin-guide consensus, Pokémon GO Hub storage/coin guides, and
// official Niantic/Scopely announcements — source NAMES are cited inline;
// URLs deliberately stay out of shipped content (public-safety scanner
// forbids external links, and the honesty register wants the confidence
// label to travel with every claim anyway).
//
// Honesty labels: "confirmed" (official or multiple sources),
// "community consensus" (long-standing shared guidance, no official word),
// "estimate" (synthesis where no authority gives a number). Storage caps
// move every few months — lastVerified is part of the data, not decoration.

export const SHOP_GUIDE = Object.freeze({
  lastVerified: "2026-08-13",
  freeCoins: Object.freeze({
    label: "confirmed",
    text: "Free coins: 1 coin per 10 minutes your Pokémon defends a gym, capped at 50 coins per day across ALL gyms combined (hit at 8h20m of total defense). Unchanged under Scopely.",
    source: "Pokémon GO Hub · Niantic Help Center",
  }),
  storage: Object.freeze({
    upgradeCost: Object.freeze({
      label: "confirmed",
      text: "Every upgrade is 200 coins for +50 slots — same rate for the item bag and Pokémon storage.",
      source: "Pokémon GO Wiki · The Click",
    }),
    caps: Object.freeze({
      label: "confirmed (moves often)",
      text: "Current maximums: 12,650 Pokémon / 12,000 items (raised twice in 2026 alone — Feb and Jul). Expect another raise within months.",
      source: "Pokémon GO Hub · Dexerto",
    }),
    targets: Object.freeze([
      Object.freeze({
        who: "Casual daily player",
        label: "community consensus",
        text: "600–1,000 in each pool is a comfortable floor — below that you fight the bag every session. Item bag first: balls and potions pile up faster than Pokémon do.",
        source: "GamePress coin guides · Pokémon GO Hub",
      }),
      Object.freeze({
        who: "Active raider / collector",
        label: "estimate",
        text: "No authority publishes a hard number — the honest answer is 'push toward the cap as coins allow.' Raid weekends burst your bag, and a living-dex habit plus shiny/XXL keepers eat Pokémon storage permanently. Storage never expires; buy it whenever coins are idle.",
        source: "synthesis of Pokémon GO Hub storage articles",
      }),
    ]),
  }),
  priorities: Object.freeze([
    Object.freeze({ rank: 1, item: "Item bag upgrades", verdict: "Best coins you can spend — permanent, and the single biggest quality-of-life fix.", label: "community consensus" }),
    Object.freeze({ rank: 2, item: "Pokémon storage upgrades", verdict: "Second — permanent. Collectors should treat this as rank 1.", label: "community consensus" }),
    Object.freeze({ rank: 3, item: "Super Incubators", verdict: "Best consumable, especially during half-hatch-distance events. Buy for events, not day-to-day.", label: "community consensus" }),
    Object.freeze({ rank: 4, item: "Lucky Eggs", verdict: "Great while leveling; near-worthless once XP stops mattering to you.", label: "community consensus" }),
    Object.freeze({ rank: 5, item: "Premium / Remote Raid Passes", verdict: "Worth it when you actually raid — buy in bulk into raid-heavy weekends, never as a default.", label: "community consensus" }),
    Object.freeze({ rank: 6, item: "Event ticket boxes", verdict: "Judge each on its unique rewards, not the discount badge.", label: "community consensus" }),
    Object.freeze({ rank: 7, item: "Cosmetics", verdict: "Pure vanity — fine if that's what you enjoy, but storage always wins on value.", label: "community consensus" }),
    Object.freeze({ rank: 8, item: "Poké Balls / Potions / Revives", verdict: "Never. Stops and gifts hand these out free — buying them burns coins for nothing.", label: "community consensus" }),
  ]),
  boxes: Object.freeze({
    label: "community consensus",
    text: "Box math: add up what the contents cost individually — a good box clears roughly a 40–60% discount. But the discount is a trap unless you'd genuinely use EVERY item before your bag overflows: discarded overflow erases the savings. Great Boxes usually carry the best percentage; Ultra Boxes the biggest absolute savings if (and only if) you need the volume.",
    source: "iMore · Pokémon GO Hub box analyses",
  }),
  remotePasses: Object.freeze({
    label: "confirmed",
    text: "Remote Raid Pass: 195 coins single, 525 for three. Daily cap is 10 remote raids (raised May 2025), and events often lift it. Prices unchanged since April 2023.",
    source: "official Niantic post · GameSpot",
  }),
  webStore: Object.freeze({
    label: "confirmed (bonus size unverified)",
    text: "The official web store (store.pokemongo.com) grants bonus coins and web-exclusive bundles on the same purchases — buying coins there beats in-app when you buy at all. The exact bonus percentage varies by bundle; check before buying.",
    source: "official web-store launch post",
  }),
});
