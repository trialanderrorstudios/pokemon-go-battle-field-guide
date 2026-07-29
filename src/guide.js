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
    body: `This page is today's checklist: what's on right now, whether it's worth your free raid pass, and where to spend Stardust next. Read the plain-language Basics page first, then import or star the Pokémon you already own so every recommendation here uses your roster.`,
    links: Object.freeze([
      Object.freeze({ href: "./#more/settings", label: "Optional: set trainer level & team" }),
      Object.freeze({ href: "./#basics", label: "1. Battle Basics" }),
      Object.freeze({ href: "./#more/roster", label: "2. Import or star Pokémon" }),
    ]),
  }),
  raids: Object.freeze({
    title: "Sizing up a raid boss",
    body: `Search or tap a boss to see if it's worth the trouble and which attackers counter it best, including a ${jargonTerm("hundo")} ${jargonTerm("cp", "CP")} target and picks from Pokémon you own. Data is this app's bundled raid, type, and moveset reference, refreshed each release — not live from the game.`,
  }),
  gyms: Object.freeze({
    title: "Gyms teach as you scroll",
    body: `This page is its own gym guide — attacker builds, the two-player stagger plan, defender placement, and ${jargonTerm("motivation")}/${jargonTerm("cp-decay", "CP decay")} are explained inline below. Tap ? again to jump back to the top. Track your gym defenses on the Leaderboard page.`,
    inline: true,
  }),
  leaderboard: Object.freeze({
    title: "Tracking your gym defenses",
    body: `Pokémon GO doesn't give apps any gym-hold data, so this is manual tracking: log when you drop a defender and when it comes back, and see your longest and total defense time. Paste-share lets a friend copy your leaderboard text into their own app (and you into theirs) so you can compete without either of you needing an account or server. You can also use a Siri Shortcut or iOS automation to quick-log a defender via URL: <code>?log=1&amp;gym=&lt;gym-name&gt;&amp;mon=&lt;form-id&gt;#leaderboard</code> — opens the drop form prefilled.`,
  }),
  pvp: Object.freeze({
    title: "Picking a PvP team",
    body: `Choose a league (Great, Ultra, or Master) to see ranked picks with recommended movesets and the ideal rank-1 IVs — ${jargonTerm("league-cp-caps", "league CP caps")} limit Great and Ultra, Master League has no cap. The Anti-Meta view surfaces the best role players (Lead, Safe Switch, Closer, and more) outside the ${jargonTerm("meta-group", "meta group")}. Data is this app's bundled PvP rankings for its current data cutoff, not live battle results.`,
  }),
  more: Object.freeze({
    title: "Everything that isn't a battle answer",
    body: `This is the index for the rest of the app. My Roster is where you import your Pokémon (a Poke Genie CSV export works) or add them one at a time; Settings holds trainer level, text size, and theme; the Library holds the long reference lists; About this build holds backups, diagnostics, and where the data came from. Everything stays on this device — "Back up my data" on About saves it all as one file you can AirDrop to a new phone and restore.`,
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
  eggs: Object.freeze({
    title: "What can hatch",
    body: `Grouped by egg distance (1 km through 12 km), with shiny eligibility and hatch CP for each Pokémon in the pool. This is this app's bundled egg chart at its data cutoff, not live from the game.`,
  }),
  rocket: Object.freeze({
    title: "What's Rocket-flavored right now",
    body: `Shadow Raid bosses in this release's rotation, live Rocket-flavored events, and the lineups Giovanni, the leaders, and each grunt can bring. Lineups show what a battle can open with and which Pokémon the feed marks as catchable — not per-battle odds, CP, or movesets.`,
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
  // Collapsed by default. On an iPhone SE the expanded card was the ENTIRE
  // first viewport — a 60-word instruction paragraph and four links, with the
  // search box, week strip and task grid all below the fold. Users dive in
  // rather than read instructions, so the app has to be what they see first.
  // The guide keeps every word; it just starts as one line.
  return `<details class="fallback-section whats-new-card guide-card" role="note">
    <summary><strong>${escapeHtml(copy.title)}</strong></summary>
    <p>${copy.body}</p>
    ${linksRow(copy.links)}
    <button type="button" data-action="dismiss-guide" data-guide-route="${escapeHtml(route)}">Got it</button>
  </details>`;
}
