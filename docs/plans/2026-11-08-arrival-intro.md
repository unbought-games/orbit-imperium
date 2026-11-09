# Arrival intro for new empires

## Intent

A player who joins a universe should feel they have arrived somewhere before they
see a dashboard. Today a new player lands on Empire overview with 1,000 metal, a
planet called "Planet", a card pointing to Briefing and, on the current build, a
"Now available" announcement about the Intergalactic Research Network covering
the screen on mobile. The arrival intro replaces that first moment with a short,
quiet scene: the player wakes from hypersleep, the orb introduces itself, and the
player chooses how they are addressed, what their homeworld looks like and what
it is called. The scene ends by handing them directly to Briefing.

The choices are real. They persist and show everywhere the title, planet art
and planet name already appear, including to other players.

## Goals

- Every empire that joins after release sees the scene exactly once, before
  anything else in the game.
- The player chooses a title, a homeworld appearance and a homeworld name, then
  lands on Briefing.
- It feels slow and atmospheric without making the player wait: the long fade is
  background, never a gate on reading or acting.
- It works as well on a phone as on desktop, including swiping between planets.

## Non-goals

- Changing the planet appearance after the intro. Owner direction: allow further
  customization in the future.
- The broader pass on the orb's personality and copy across the application.
  This design only drafts the intro's script and voice notes for it.
- New planet artwork. Add a template later only if a climate band feels thin.
- Audio, voice-over or animated planet renders.
- Any gameplay effect. Appearance and title remain cosmetic; art never implies
  climate, temperature, production or eligibility.

## Anti-goals

- A tutorial wall. The scene is four short exchanges, not instructions.
- Waiting for the fade. If text only appears minutes in, the feature has failed.
- Locked supporter teasers on the very first screen of a free player's game.
- Losing a player's choices, or trapping them in the scene, because one save
  failed.

## Audience and eligibility

- Shows for new human memberships created after this release, through both local
  signup and Unbought Account enrollment (`HostedJoin` / `UniverseEnrollment`).
- Never shows for memberships that existed before the release, or for bots.
- Shows once per empire (account × universe). Joining a second universe shows it
  again for that empire.
- Completion is an authoritative server fact, not browser storage. A pending
  arrival on any device opens the scene; once completed it never returns.

Owner decision vs. builder call: once-per-new-empire and exclusion of existing
players were proposed by Claude and not objected to; treat them as decided.

## The scene

### Atmosphere

- Background starts at pure black and eases to the application's navy
  background over about three minutes (owner: "like minutes"). The exact
  duration is a tunable constant.
- The orb flickers into view about one to two seconds in, like a failing light
  catching. It then sits centered above the text, idle-pulsing.
- Text is centered in a narrow column (roughly 34–40 characters wide on desktop,
  full width minus gutters on mobile). Lines fade in one at a time; each step's
  input appears with or just after its question.
- `prefers-reduced-motion`: no flicker, a short fade (a few seconds), lines
  appear without animation.
- The game shell, navigation, HUD, announcements and advisor are not visible
  during the scene. Game data may load underneath so the hand-off is instant.

### Steps and draft script

The orb speaks every line. This is a first draft for wordsmithing, written in
the voice described below; final copy is the owner's call.

1. **Wake**
   - "…Signal restored. Your vitals look steady."
   - "Good morning. You've been in hypersleep for a long time."
   - "We're on final approach to the world you've been given to command."
2. **Title** (dropdown of titles available to this empire)
   - "Before we make planetfall: how should I address you?"
   - Live preview under the dropdown using the title's `address`, for example
     "“Welcome aboard, Admiral.”"
   - Button: "That's me"
3. **Planet appearance** (carousel, see below)
   - "Very good, {address}. Look out the viewport. Your world is coming into
     view."
   - "What do you see?"
   - Button: "That's it"
4. **Planet name** (text input with dice button)
   - "A fine world."
   - "Every world deserves a name. What should we call it?"
   - Button: "Name it"
5. **Hand-off**
   - "{Name}. It suits it."
   - "There's a lot of work ahead to build an empire from nothing. I know
     you're up to it."
   - "Let's get down there and start with the basics."
   - Button: "Begin" → Briefing for the homeworld.

A quiet "Skip intro" control is available throughout. Skipping saves any choice
the player already confirmed, uses defaults for the rest (Commander, the
planet's slot art, and a random name rather than "Planet"), records completion
and opens Briefing. Owner decision: keep the skip subtle, for players who want
to get straight into the action.

### Title step

- Options come from the empire's existing `title_choices` (empire profile).
  Show only choices whose availability is `available` for this empire: free
  titles for everyone, supporter titles only for eligible supporters or holders
  of permanent grants, earned titles only once earned. Do not show locked titles.
- Default selection is Commander.
- The control is a dropdown per the owner. A native `<select>` (shared `Select`)
  is acceptable and gives good mobile behavior.
- Saving uses the existing per-empire title selection; no new title model.

### Planet appearance step

Owner decision: offer only looks that match the homeworld's real orbit.

Current art is chosen by orbit slot (`resolvePlanetArt(position)`, slots 1–15,
hot inner to cold outer). Homeworlds sit in positions 4–12. Group slots into
climate bands from the existing art:

| Band      | Art slots | Homeworld positions |
| --------- | --------- | ------------------- |
| Hot       | 1–4       | 4                   |
| Temperate | 5–8       | 5–8                 |
| Cold      | 9–15      | 9–12                |

- The options are every art slot in the homeworld's band. The planet's own slot
  art is first and preselected.
- Bands are a pure function of position, defined once and shared by client
  validation, server validation and tests.
- Mobile: one large planet centered, horizontal swipe with scroll snapping, dots
  showing position. Desktop: the same carousel with previous/next buttons and
  arrow-key support. The selected planet is the one centered when "That's it" is
  pressed.
- Use the existing responsive WebP sizes; load the large size only for the
  visible and adjacent planets.
- Planet art keeps empty alt text; the carousel announces "Planet look N of M".

### Name step

- Same validation as rename today: 1–40 characters after trimming, no control
  characters (`planetNameError`).
- The dice button fills the input with a random name. Names come from a small,
  original, freely licensed word list shipped in the public repository (for
  example two-part names like "Vesper Reach" or single invented names). Every
  generated name must pass validation. Pressing the dice again replaces it.
- The input starts empty with a placeholder; "Name it" is disabled until valid.

## Persistence

- **Arrival status**: new server-owned fact per membership: pending for new human
  memberships, complete for every existing membership and all bots. Exposed in
  the session or bound view so the client can decide to render the scene. A
  migration must mark existing memberships complete without touching anything
  else.
- **Title**: existing empire profile identity (`title_id`).
- **Planet name**: existing `RenamePlanet` world action.
- **Planet appearance**: new optional per-body presentation record holding a
  chosen art slot. It is presentation data, not engine/game state: keep it out
  of ordered world replay, like insignia equipment. When absent, art is derived
  from position exactly as today (do not store the default). When present,
  every place that resolves body art (`resolveBodyArt`, Galaxy, location
  previews/cards, overview, planet rail) uses it, for every viewer. The server
  rejects slots outside the body's climate band.
- The appearance write is an ordinary owner-authorized "set this planet's look"
  operation, not something only the intro may call, so later customization can
  reuse it. For now only the intro exposes it in the interface. (Claude's call.)
- **Completion**: finishing (or skipping) submits the title, appearance and
  name, then records completion. Completion must only be recorded once all of
  the player's choices are saved. Submission is idempotent and retry-safe: a
  lost response or double click cannot apply choices twice or strand the player.
  If saving fails, the scene stays on its final step with the error and a retry;
  the drafted choices remain.
- Choices are local drafts until that final submission. Reloading mid-scene
  restarts it with the defaults; that is acceptable.

## Related changes

- Announcements: a player should not receive announcements dated before they
  joined (derive from the membership's join time). This applies to every
  announcement, since the curated list is feature news. Memberships with an
  unknown join time keep today's behavior. This also fixes the current
  first-landing overlap. (Claude's call.)
- Advisor celebrations and route lessons stay hidden while the scene is open.
- After the scene, Briefing is the first screen. Leave the overview's
  "Your next step is in your briefing" card unchanged for later visits.

## Orb voice notes (seed for the later personality pass)

The orb currently speaks in two registers. HUD captions are quippy and
meme-adjacent ("Loading... jk", "Finally 5G", "Another tasteful space shed.").
Briefing and the advisor are earnest and instructional ("This world is yours,
Commander."). The intro should establish the character the rest can converge on:

- A ship-and-colony intelligence that has been awake while you slept. Loyal,
  competent, calm.
- Warm and plain-spoken. Short sentences. Addresses the player by title.
- Dry understatement is welcome on low-stakes moments; it never undercuts the
  player or the moment, and avoids internet slang.
- Clear and serious when something matters: attacks, losses, mistakes.

## Quality bar

- Unit tests: band membership and options per position, random-name validity,
  scene step progression and skip, announcement join-time filtering.
- HTTP/database tests: migration marks existing memberships complete; new human
  memberships start pending and bots complete; appearance validation by band;
  completion idempotency and ordering (no completion without saved choices).
- Browser tests at desktop and mobile widths: full flow including swipe and
  keyboard carousel navigation, dice, skip, reduced motion, and that Briefing is
  the landing page afterwards; a pre-existing player never sees the scene.
- Screenshots of every step at desktop and mobile, inspected and shown in chat.

## Left to the builder

- Exact animation curves and timings, apart from the multi-minute fade.
- Whether the scene is a route or an overlay rendered before the game shell.
- Exact API shapes and how completion sequences the three saves, within the
  idempotency and ordering rules above.
- The random-name word list, within the licensing rule.
