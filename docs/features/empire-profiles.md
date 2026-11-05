# Empire profiles and lasting history

Every enrolled empire has a profile at `/profiles/empire/{player}`. Clicking a
player name opens it; keyboard focus and mouse hover retain the compact dossier.
The account menu opens `/profile`, the account owner's collection of empires.
`/profiles/{profile}` is the lasting Orbit collection link. Profile identifiers
are separate from authentication subjects and account IDs.

## Curating and sharing

Profiles initially contain identity, current available insignia/supporter display,
current alliance, and applicable social and enrollment links. No profile setup is
required. **Choose moments** opens the owner's automatically recorded history.
The owner selects entries, adds captions and chooses featured presentation.
Selection never changes dates, game facts or earned results. Unselected history
is owner-only. Selected history is visible to fellow members of that universe and
epoch. Each universe profile has a separate **Make profile public** switch,
defaulting off; public visibility exposes that same selected timeline anonymously.
The public Orbit overview includes only public empire profiles, without counts of
private memberships. Its owner can also see private and removed empires.

Any signed-in reader who can see an event can explicitly publish a commemorative
record. The preview explains permanence before **Publish permanent card**. This
creates `/commemorations/{publication}` with the event and the caption at initial
publication. Anyone can read or forward that link. No other participant's consent
is required. Names and coordinates may be shared. Battle details use the original
recipient's observation; an incomplete contact never acquires another recipient's
outcome. Private server fields still cannot be manufactured by publication.
Basic profiles, digital access, sharing and browser printing are free.

Removing an entry removes its placement, not its publication. Changing a caption
on the timeline does not rewrite the previously published caption. Revocable
unlisted report shares keep their existing semantics: report deletion revokes
those links. Inbox deletion does not erase retained battle sources. These two
publication actions intentionally have different lifecycles.

## What is retained

History is bounded by supported event types, not a general command/event warehouse:

- Enrollment and its original timestamp, including unknown legacy timestamps.
- Successful colonization facts and abandonment, including stable body identity.
- Alliance joins, exits, kicks and disbands; rename intervals are not new joins.
- Completed battle observations, historical visible identities and paid-asset
  observations needed for deterministic recommendations.
- Authoritative campaign participation/results and closure.

New events are captured in the same transaction as their source transition.
Immutable mission reports remain the single battle payload source. Archive foreign
keys prevent physical purging of referenced reports; ordinary inbox cleanup only
changes recipient state. Name and authored appearance observations are retained
from the time they become known, so delayed events do not use a future identity.
Appearance history stores recipes/references, never paid asset originals or billing
snapshots. A saved appearance reference records the authored selection, not proof
of supporter access or of a restricted design having been rendered. Renderers
must resolve installed content using the existing cosmetic
policy and free fallback. This feature does not bundle private cosmetic content.

Migration 0036 preserves available old report, colony, abandonment and affiliation
evidence. Missing dates, historical names, appearance or strength remain unknown.
Existing shared-report names are publication-time evidence, not reconstructed
battle-time names. Backfill cannot recover already destroyed evidence or ownership
of an empire whose account link was removed before this feature.

Current totals, event summaries, profile counts, significance and visibility are
derived from source facts. User selections, disclosure choices, original
observations and removal/closure decisions are persistent source records.

## Battle recommendations

Version 1 considers the greater of committed military paid value and the player's
permanent paid-value loss. It requires at least 20,000 resource units and either
10% of the whole empire, or 25% of the ship value **and** 2% of the whole empire.
All comparisons use integers and event-time observations. This is an initial,
testable product calibration, not a claim that these thresholds are optimal.
Losing a lone cargo in a large empire does not qualify; a major engagement can
qualify even if the fleet survives. Unknown old baselines do not earn automatic
recommendations. Recommendations are not achievements and do not restrict which
retained battles an owner may feature. Raw valuation observations are never
returned by profile APIs.

## Deletion, closure and corrections

Removing an empire hides its profile from other players and the web. The owning
account retains the history and selections. Reenrollment creates a separate player
identity/chapter. Existing publications remain available. An account detachment
hides its profiles, removes personal timeline selections and account-name lookup
history, and leaves already published records under recorded in-game names.
Coordinated Accounts deletion remains an operational integration, not a new
self-service cross-service deletion UI.

Campaign closure ends play without deleting the universe/archive. Profiles remain
readable with their chosen visibility. Archive endpoints authorize using persistent
ownership and participation, without bootstrapping a live game. Operators must not
implement campaign closure by deleting memberships or resetting a universe: those
are different historical events. Do not purge referenced report/universe rows.

The storage adapter exports `record_campaign_result` and
`record_campaign_closure` for the authoritative campaign transaction. They record
source identity, outcome, beneficiaries and times with retry/conflict checks;
result entries are available for selection and publication. They do not decide
victory, stop the simulation, migrate empires or invent campaign dates. Those
scenario lifecycle mechanics remain separate work. The invitation boundary uses
existing `/join/{universe}` and recruitment discovery; there is no second referral
system. Closed or removed empires point visitors to the next available recruitment
choices instead of promising a particular future campaign.

Operators can use the transactional `correct_history_event` boundary to append a
reasoned correction with a unique source ID. Original facts and reports are kept.
The latest correction applies to timeline details and published records, visibly
labelled with its reason. Corrections cannot turn ContactLost into a full combat
observation; corrected payloads pass through the same recursive disclosure
allowlist. No player HTTP endpoint can issue corrections.

## API and verification

OpenAPI documents `/api/v4/empire-profiles/{player}`, `/api/v4/orbit-profiles/{id}`,
`/api/v4/my-profile`, `/api/v4/history/{event}`, and
`/api/v4/commemorations/{publication}`. Reads disable caching, do not record
presence, and return a generic unavailable response for unauthorized records.
History pages use stable keyset pagination (50 entries). Edits require account
authentication, same-origin/CSRF protection, an expected profile revision and a
command ID. Removal and editing serialize on the same profile row.

Focused checks: `make _db-empire_history _db-empire_history_upgrade`, the existing
colonization/attack-groups/alliance/deletion suites, application significance tests,
and fixture-only profile/navigation browser checks. See
[implementation verification](../verification/empire-profiles.md).
