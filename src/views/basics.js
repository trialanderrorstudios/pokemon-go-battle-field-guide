// Static, honest mapping of the in-game team-leader appraisal (0-3 stars,
// plus three per-stat bars) to a plain verdict. This is reference content
// only — it does not calculate any Pokemon's actual IVs.
export const APPRAISAL_TIERS = Object.freeze([
  Object.freeze({
    stars: 3,
    meaning: "Strong roll — among the better rolls for this species. If all three bars are full too, it's a perfect \"hundo\" — the rarest roll possible, and the game highlights it with a distinct pink/red glow instead of the usual color.",
    verdict: "Worth investing in: Stardust, Candy, and best moves are well spent here.",
  }),
  Object.freeze({
    stars: 2,
    meaning: "Solid roll — clearly above average.",
    verdict: "Fine to invest in if you like this Pokémon or need its type.",
  }),
  Object.freeze({
    stars: 1,
    meaning: "Below-average roll.",
    verdict: "Fine to battle with casually; don't prioritize Stardust here.",
  }),
  Object.freeze({
    stars: 0,
    meaning: "A lower roll — this band is wide and includes plenty of ordinary rolls, not just the worst possible one.",
    verdict: "Better as a Candy or trade source than a long-term investment.",
  }),
]);


function appraisalRow(tier) {
  return `<tr><td>${"★".repeat(tier.stars)}${"☆".repeat(3 - tier.stars)}</td><td>${tier.meaning}</td><td>${tier.verdict}</td></tr>`;
}


function appraisalSection() {
  return `<section class="more-section" aria-labelledby="basics-appraisal-title">
    <h2 id="basics-appraisal-title">Reading a team leader's appraisal</h2>
    <p>Ask your team leader to appraise a Pokémon and it shows an overall rating of 0 to 3 stars, plus three bars (Attack, Defense, HP). Here's what each star rating means in plain terms — this is a reference table, not a calculation of any specific Pokémon.</p>
    <table class="appraisal-table">
      <thead><tr><th scope="col">Stars</th><th scope="col">What it means</th><th scope="col">Plain verdict</th></tr></thead>
      <tbody>${APPRAISAL_TIERS.map(appraisalRow).join("")}</tbody>
    </table>
    <p>Each of the three bars uses the same 0-15 scale for every species — a full bar means that stat rolled the maximum value (15), not just "high for this Pokémon." The leader also calls out one stat as best, which hints at a role: a high Attack bar suits an attacker, while high Defense or HP bars suit a gym defender.</p>
  </section>`;
}


// Plain-language orientation for a total beginner. No tables, no numbers
// beyond what's essential to recognize CP/IV by name.
export function renderBasics() {
  return `<div class="more-view">
    <a class="safe-escape" href="./#home">Back to Home</a>
    <section class="more-section" aria-labelledby="basics-title">
      <p class="status-kicker">New to Pokémon GO battles?</p>
      <h1 id="basics-title">Battle Basics</h1>
      <p>Eight quick things to know before you raid, defend a gym, or fight another trainer.</p>
      <a class="safe-escape" href="./#glossary">See every term in the Glossary</a>
    </section>
    <section class="more-section" aria-labelledby="basics-raids-title">
      <h2 id="basics-raids-title">Raids</h2>
      <p>A raid is a timed team battle against one giant Pokémon guarding a gym. You and other nearby trainers fight it together; if you beat it before time runs out, everyone gets a chance to catch it.</p>
    </section>
    <section class="more-section" aria-labelledby="basics-gyms-title">
      <h2 id="basics-gyms-title">Gyms</h2>
      <p>A gym holds a team of defending Pokémon placed by other trainers. Attack a gym to clear or weaken it, then place one of your own Pokémon to defend it and earn a small trickle of coins over time.</p>
    </section>
    <section class="more-section" aria-labelledby="basics-pvp-title">
      <h2 id="basics-pvp-title">PvP (trainer battles)</h2>
      <p>PvP means fighting another trainer's team of three Pokémon instead of the game's computer-controlled bosses and defenders. Great and Ultra League cap how strong (by CP) your Pokémon are allowed to be; Master League has no CP cap at all, so it's your biggest hitters unrestricted.</p>
    </section>
    <section class="more-section" aria-labelledby="basics-moves-title">
      <h2 id="basics-moves-title">Fast vs. charged moves</h2>
      <p>Every Pokémon has one fast move — tap the screen and it fires for free, building up energy each time. Charged moves cost that saved-up energy but hit much harder, so you'll use them less often.</p>
    </section>
    <section class="more-section" aria-labelledby="basics-dodge-title">
      <h2 id="basics-dodge-title">Dodging (raids and gyms)</h2>
      <p>In raid and gym battles, swiping left or right right before an enemy attack lands cuts most of its damage. It costs you attack time though, so in a group raid against the clock it's often better to skip dodging and keep attacking. There's no dodge in PvP trainer battles — swapping Pokémon is your defensive move there instead.</p>
    </section>
    <section class="more-section" aria-labelledby="basics-swap-title">
      <h2 id="basics-swap-title">When to swap</h2>
      <p>Switch to a fresh Pokémon when yours is about to faint, or when it's stuck facing a type it's just bad against. A fainted Pokémon deals zero damage, so swapping a little early keeps your team hitting harder overall.</p>
    </section>
    <section class="more-section" aria-labelledby="basics-weather-title">
      <h2 id="basics-weather-title">Weather boost</h2>
      <p>The in-game weather refreshes roughly every hour and boosts three move types at a time — sunny weather boosts Fire, Grass, and Ground, for example. Check the weather icon on the map and lean on Pokémon whose moves match it.</p>
    </section>
    <section class="more-section" aria-labelledby="basics-types-title">
      <h2 id="basics-types-title">Why type matchups matter</h2>
      <p>Every move has a type, and every Pokémon has one or two types. Attacking a type your target is weak to does much more damage, and attacking a type it resists does much less — matching your moves to the enemy's type is the single biggest damage lever you have.</p>
      <a class="safe-escape" href="./#types">See the full type chart</a>
      <p><a class="safe-escape" href="./#drill">Practice type matchups →</a></p>
    </section>
    <section class="more-section" aria-labelledby="basics-cpiv-title">
      <h2 id="basics-cpiv-title">CP and IV, in one breath each</h2>
      <p><strong>CP</strong> is one number that rolls a Pokémon's level and stats into a rough power score — handy for quick comparisons, but leagues cap it, so bigger isn't always better. <strong>IVs</strong> are small hidden bonuses that make two Pokémon of the same species and level slightly different in strength; the in-game team-leader appraisal can show you your own Pokémon's IVs, and this app's PvP rankings show the ideal rank-1 IV target for each pick.</p>
    </section>
    ${appraisalSection()}
  </div>`;
}
