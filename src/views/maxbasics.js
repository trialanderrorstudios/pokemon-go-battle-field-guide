// Static, teachable Max Battles content. Sourced from LeekDuck's own reporting
// (leekduck.com/posts/dynamax-and-max-battle-details-released/ and
// leekduck.com/posts/go-bigger-with-gigantamax-pokemon-in-new-max-battles/).
// No boss-specific counter rankings ship here — see docs/max-battles-spike.md
// for why: the sourced material only carries a per-species letter grade, not
// per-boss matchup data, so this page teaches mechanics instead of ranking
// counters this app can't back with real numbers.
export function renderMaxBasics() {
  return `<div class="more-view">
    <a class="safe-escape" href="./#basics">Back to Basics</a>
    <section class="more-section" aria-labelledby="maxbasics-title">
      <p class="status-kicker">New to Max Battles?</p>
      <h2 id="maxbasics-title">Max Battles, plain and simple</h2>
      <p>Max Battles are cooperative fights against a Dynamax or Gigantamax Pokémon at a Power Spot — a raid-like encounter, but with its own map location, its own currency, and its own move set.</p>
    </section>
    <section class="more-section" aria-labelledby="maxbasics-powerspots-title">
      <h2 id="maxbasics-powerspots-title">Power Spots</h2>
      <p>Power Spots are map locations separate from gyms and PokéStops, appearing daily in random spots and expiring on their own timer. Visiting one gives you 100 Max Particles, plus a 20-particle bonus the first time you visit that spot.</p>
    </section>
    <section class="more-section" aria-labelledby="maxbasics-particles-title">
      <h2 id="maxbasics-particles-title">Max Particles</h2>
      <p>Max Particles (MP) are the currency that gets you into a Max Battle. You earn them by visiting Power Spots (100, +20 first-time bonus) and by walking (300 MP per 2 km). You can bank up to about 800 MP a day this way, and MP can also be bought with PokéCoins. Entering a battle costs MP up front — 250 for an easier boss, more for a tougher one — but that MP is only spent if you actually beat the boss.</p>
    </section>
    <section class="more-section" aria-labelledby="maxbasics-moves-title">
      <h2 id="maxbasics-moves-title">Max Moves</h2>
      <p>A Dynamaxed Pokémon still uses its usual Fast and Charged Attacks — but once its Max Meter fills, it gets a three-turn window to unleash Max Moves instead: <strong>Max Attack</strong> (a damaging move whose name and type vary by Pokémon — Max Geyser for Water types, Max Flare for Fire types, and so on), <strong>Max Guard</strong> (cuts incoming damage), and <strong>Max Spirit</strong> (heals your team). Spend Max Particles and Candy (or Candy XL) on the Pokémon's info screen before battle to power these up.</p>
    </section>
    <section class="more-section" aria-labelledby="maxbasics-party-title">
      <h2 id="maxbasics-party-title">Party size and trainers</h2>
      <p>Each trainer brings up to three Pokémon. A Dynamax Max Battle can be fought solo or with up to four trainers total. A Gigantamax Max Battle scales up further — up to 40 trainers, split into groups of four or fewer, can all pile onto the same boss.</p>
    </section>
    <section class="more-section" aria-labelledby="maxbasics-controls-title">
      <h2 id="maxbasics-controls-title">In the battle</h2>
      <p>Tap the screen for a fast attack and to build energy toward a Max Move; swipe to dodge the boss's attacks or to collect energy icons that fill your meter faster. If every one of your Pokémon faints, you're not out — you can still cheer to boost your teammates' meters.</p>
    </section>
    <section class="more-section" aria-labelledby="maxbasics-farm-title">
      <h2 id="maxbasics-farm-title">What to farm as a beginner</h2>
      <p>You'll need a Dynamax or Gigantamax Pokémon of your own to take part — Special Research at the start of a Max Battle event is the usual way to get your first one. Beyond that, prioritize Candy for your Dynamax Pokémon and Max Particles so you're never turned away from a Power Spot.</p>
    </section>
  </div>`;
}
