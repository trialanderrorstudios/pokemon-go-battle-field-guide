import { escapeHtml } from "./views/home.js";
import { jargonTerm } from "./glossary.js";

// First-visit orientation copy, one entry per router.js ROUTES id. Beginner
// voice: what this page is for, what to tap first, where the data comes
// from. `inline: true` marks views that already teach in their own body
// copy (Basics, Gyms) — those get only the small "?" affordance, wired to
// scroll back to that existing content, not a duplicate card.
export const GUIDE_COPY = Object.freeze({
  home: Object.freeze({
    title: "New to battling? Start here",
    body: `New to battling? Read the plain-language Basics page first, then import or star the Pokémon you already own so recommendations use your roster, and check This Week for what's worth doing right now.`,
    links: Object.freeze([
      Object.freeze({ href: "./#more", label: "Optional: set trainer level & team" }),
      Object.freeze({ href: "./#basics", label: "1. Battle Basics" }),
      Object.freeze({ href: "./#more", label: "2. Import or star Pokémon" }),
      Object.freeze({ href: "./#coach", label: "3. This Week" }),
    ]),
  }),
  raids: Object.freeze({
    title: "Sizing up a raid boss",
    body: `Search or tap a boss to see if it's worth the trouble and which attackers counter it best, including a ${jargonTerm("hundo")} ${jargonTerm("cp", "CP")} target and picks from Pokémon you own. Data is this app's bundled raid, type, and moveset reference, refreshed each release — not live from the game.`,
  }),
  gyms: Object.freeze({
    title: "Gyms teach as you scroll",
    body: `This page is its own gym guide — attacker builds, the two-player stagger plan, defender placement, and ${jargonTerm("motivation")}/${jargonTerm("cp-decay", "CP decay")} are explained inline below. Tap ? again to jump back to the top. You can also use a Siri Shortcut or iOS automation to quick-log a defender via URL: <code>?log=1&amp;gym=&lt;gym-name&gt;&amp;mon=&lt;form-id&gt;#gyms</code> — opens the drop form prefilled.`,
    inline: true,
  }),
  pvp: Object.freeze({
    title: "Picking a PvP team",
    body: `Choose a league (Great, Ultra, or Master) to see ranked picks with recommended movesets and the ideal rank-1 IVs — ${jargonTerm("league-cp-caps", "league CP caps")} limit Great and Ultra, Master League has no cap. Data is this app's bundled PvP rankings for its current data cutoff, not live battle results.`,
  }),
  more: Object.freeze({
    title: "Your roster and settings",
    body: `Import your Pokémon (a Poke Genie CSV export works) or add them one at a time, mark favorites with the star, and adjust text size, theme, and offline updates further down. Everything here stays on this device — use "Back up my data" to save it as one file, and moving to a new phone or tablet is just export on one device, AirDrop the file over, then restore on the other.`,
  }),
  triage: Object.freeze({
    title: "Sorting your box",
    body: `This page runs every Pokémon you've imported through the app's raid and PvP checks and sorts them into keep, invest, PvP, and transfer-candy piles, each with a plain reason. It has its own intro card on first visit — tap "How buckets are decided" there for the full explanation.`,
    inline: true,
  }),
  basics: Object.freeze({
    title: "This page is the beginner guide",
    body: `Battle Basics explains raids, gyms, PvP, moves, dodging, weather, and CP/IV in plain language from top to bottom — there's nothing to tap, just read down the page. Tap ? again to jump back to the top.`,
    inline: true,
  }),
  types: Object.freeze({
    title: "Reading the type chart",
    body: `Tap any type to see what it's strong against, weak to, and resisted by. This is the game's fixed 18-type chart, so it never changes with events or updates.`,
  }),
  glossary: Object.freeze({
    title: "Looking up a term",
    body: `Every bit of jargon used elsewhere in this app is defined here in plain language — scroll or use your browser's find-on-page to look one up.`,
  }),
  drill: Object.freeze({
    title: "Practicing type matchups",
    body: `Pick a direction (Effective against or Weak to), then tap the type you think answers the flashcard. This drills the same fixed type chart as the Type Chart page — no live data involved.`,
  }),
  swap: Object.freeze({
    title: "Mid-battle helper",
    body: `Pick your team in Step 1, who you're facing in Step 2, and this suggests your best lead and next swap in Step 3 — handy to check right before or during a PvP battle.`,
  }),
  coach: Object.freeze({
    title: "Your weekly digest",
    body: `This Week rounds up the best raids to fight, what's worth powering up, a buddy pick, and a suggested PvP team in one scroll — refreshed with this app's weekly data cutoff, not live game state.`,
  }),
  maxbasics: Object.freeze({
    title: "How Max Battles work",
    body: `Plain-language rules for Max Battles specifically — Max Particles to enter, the Max Meter filling mid-fight, and what Max Moves do. This is reference content, not live game state.`,
  }),
  today: Object.freeze({
    title: "Your open-every-day checklist",
    body: `A daily rundown pulled from what's already elsewhere in the app: today's Raid or Spotlight Hour, whether it's worth your free raid pass, your active gym defenders, and this week's top Coach picks. Check items off as you go — the list resets fresh tomorrow.`,
  }),
  eggs: Object.freeze({
    title: "What can hatch",
    body: `Grouped by egg distance (1 km through 12 km), with shiny eligibility and hatch CP for each Pokémon in the pool. This is this app's bundled egg chart at its data cutoff, not live from the game.`,
  }),
  delta: Object.freeze({
    title: "What changed since last time",
    body: `Compares this release's PvP rankings, moveset picks, raid boss rotation, and species list against the previous one — Pokémon you own are called out first, then everything else that moved.`,
  }),
  tricks: Object.freeze({
    title: "Community-known tips and shortcuts",
    body: `Curated mechanics and shortcuts grouped by category — Trading, Raids, Candy &amp; XP, Gyms, PvP, Quality of Life, and Community. Each tip cites its source and shows a "verified" date so you know how current it is; tap a category to expand it.`,
  }),
});


// ponytail: dismissal is a single localStorage flag per route, not a
// roster-backed preference — disposable UI state, matching the app.js
// whats-new/update-banner dismissal pattern, not worth an IndexedDB write.
function dismissedKey(route) {
  return `guide-dismissed:${route}`;
}

export function isGuideDismissed(route, storage) {
  return storage?.getItem?.(dismissedKey(route)) === "1";
}

export function dismissGuide(route, storage) {
  storage?.setItem?.(dismissedKey(route), "1");
}

export function showGuide(route, storage) {
  storage?.removeItem?.(dismissedKey(route));
}


function linksRow(links) {
  if (!links?.length) return "";
  return `<p class="guide-links">${links.map((link) => `<a class="safe-escape" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join(" ")}</p>`;
}


// One component for every view: a dismissible card the first time, then a
// small "?" pill that brings it back. Views that already teach (`inline`)
// skip the card entirely and get only the "?", wired to scroll back to
// their own existing content instead of duplicating it in a card.
export function renderGuide(route, storage) {
  const copy = GUIDE_COPY[route];
  if (!copy) return "";
  if (copy.inline) {
    return `<div class="guide-toggle-row"><button type="button" class="guide-toggle" data-action="scroll-app-top" title="${escapeHtml(copy.body.replace(/<[^>]+>/g, ""))}" aria-label="${escapeHtml(copy.title)} — jump to this page's guide">?</button></div>`;
  }
  if (isGuideDismissed(route, storage)) {
    return `<div class="guide-toggle-row"><button type="button" class="guide-toggle" data-action="show-guide" data-guide-route="${escapeHtml(route)}" aria-label="Show the ${escapeHtml(copy.title)} guide again">?</button></div>`;
  }
  return `<div class="fallback-section whats-new-card guide-card" role="note">
    <p><strong>${escapeHtml(copy.title)}</strong></p>
    <p>${copy.body}</p>
    ${linksRow(copy.links)}
    <button type="button" data-action="dismiss-guide" data-guide-route="${escapeHtml(route)}">Got it</button>
  </div>`;
}
