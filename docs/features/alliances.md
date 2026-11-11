# Alliances

Alliances are scoped to a universe epoch. Creation and membership have no resource cost. A player has at most one current alliance and five pending applications. Open recruitment joins immediately; Application recruitment requires approval; Closed blocks new requests while allowing existing applications to be processed. Create, join and accept withdraw every other pending application atomically.

The galaxy marks other players in your current alliance with a blue row accent and a visible "Your alliance" badge, alongside their public alliance tag. The marker compares alliance IDs within the same universe using current, unexpired player profiles, and leaves vacation, inactivity and beginner-protection indicators visible. Your own planets retain the "You" label.

Alliance membership currently does not prevent attacks or espionage. Mission eligibility checks ownership, vacation, player lifecycle and beginner protection; it does not check alliance membership. The galaxy alliance marker identifies a relationship, not combat immunity.

The HTTP surface is `POST /api/v4/universes/{id}/alliances/query`, `POST /api/v4/universes/{id}/alliances/commands` and unauthenticated `GET /api/v4/universes/{id}/alliances/{alliance}`. Private POSTs use the existing session, Origin, CSRF, current-player/epoch and protocol checks. The public endpoint is independently rate limited, returns only public summary fields and derived scores, and never records presence. All responses disable caching.

The pure `orbit_engine::alliances` domain owns recruitment, membership, combined role permissions, delegation and noticeboard policy. The application layer owns DTOs and private projections. The PostgreSQL adapter revalidates binding in the transaction, takes a social-subsystem advisory lock per universe/epoch, and commits source facts, bounded audit and immutable retry receipt together. This serializes competing accepts, joins, founder creation, role changes and pin limits without inserting gameplay commands. Database uniqueness additionally protects case-insensitive names/tags and current membership.

Commands carry an immutable command ID and expected revision. Create/join/apply/withdraw allow a null revision; all other actions require the observed alliance revision. Exact retries return the original acknowledgement even after rename, leave or disband. Reusing an ID with a different action/revision conflicts. Receipts retain a canonical intent hash, never deleted post or application text. Failed commands roll back completely. Application withdrawal caused by joining increments affected alliances' revisions.

The default Member role supplies baseline permissions. Named role assignments combine with this baseline. Leader is implicit and exclusively owns transfer/disband. Grantable rights are separate from act rights; role mutation and assignment must stay within the actor's delegation ceiling and cannot promote the actor or remove a superior's authority. ViewActivity requires ViewMembers and ProcessApplications requires ViewApplications. Transfer is immediate and resets the old leader to ordinary membership. Leaders must transfer or disband before leaving.

A nonmember never receives an AllianceDetail, including its leader field. ViewMembers gates roster, ViewActivity gates coarse activity, ViewApplications gates pending requests and ViewAudit gates audit facts. Optional unauthorized fields are omitted, not returned as empty private objects. Activity uses source gameplay presence and exposes only Recent (under 15 minutes), Away (under seven days), or Inactive. Read queries do not refresh presence.

Noticeboard source Markdown is bounded to 100 posts, five pinned posts, 120 title characters and 8000 body characters. The oldest unpinned post rolls off on insertion. Pages contain 20 posts with pins first. Opaque UUID page cursors bind an offset to an alliance revision; a changed revision returns Conflict and requires restarting pagination, so pin/unpin and rolloff cannot duplicate results across observations. No cursor state or rendered HTML is persisted.

`alliance_memberships` is the authoritative current source for identity and ranking integration. `alliance_affiliation_history` preserves source identity in half-open intervals `[valid_from,valid_until)`. Create/join open intervals; leave/kick/disband close intervals; rename closes/reopens every member's interval. Same-millisecond transitions may create zero-length intervals; observations at that millisecond see the latest committed identity. Disband preserves these historical facts and command receipts. Delayed report capture reads the interval at the event time; legacy absence remains unknown.

The schema stores role definitions and assignments, Markdown, membership/application facts and bounded audit; member counts, effective permissions, activity labels and scores are derived. Public ranking enrichment uses the ranking subsystem's authoritative asset observation.

Validation: 19 engine policy tests, two application projection tests and six real PostgreSQL/HTTP tests pass. Focused native suites are `make _db-alliances` and the alliance engine/application test filters. Exact source digest, timings, intermediate compilation issues and cleanup are recorded in `docs/plans/alliance-backend-handoff.md`.

Final integrated validation, exact implementation revision, failures and cleanup are recorded in [Alliance validation](../verification/alliances.md).

With allied holding enabled, current members and accepted friends can defend each
other’s planets. See [Allied holding and Alliance Depot](../operations/alliance-depot.md)
for prepaid duration, host capacity, resupply, and relationship-change rules.

Automatic empire cleanup transfers a removed leader's authority using recent
activity, continuous membership tenure, and stable player ID as deterministic
criteria. Members pending deletion cannot acquire leadership. Voluntary empire
deletion requires transferring leadership or disbanding first. See
[Empire deletion and inactivity cleanup](empire-deletion.md) for exact selection,
fleet handling, and retention rules. Successor nominations remain deferred.

## Recruitment and invitations

Alliances can opt into recruitment discovery with optional languages, new-player
preferences and activity expectations. Existing alliances start unlisted and all
preferences start unset. Unset preferences do not match a specific filter.
`ManageRecruitment` controls these settings and invitation links; public profile
text retains its existing `EditProfile` permission. Activity expectations are
self-described, not enforced attendance requirements.

The public directory at `/alliances` selects a universe; `/alliances/{universe}`
and in-game discovery list only opted-in alliances whose recruitment is Open or
Application. Closed alliances keep their preferences but disappear from this
list. Public pages and explicit in-game name/tag lookup remain available for
unlisted groups. The directory uses the existing public description, not a
second recruitment biography.

Each alliance can have one active, reusable invitation. Managers create, replace
or disable it. It has no expiry, use cap, creator affiliation requirement or
membership privilege. Replacing or disabling invalidates the old link, while
the public alliance page and normal joining rules remain available. The current
token is visible in private detail only with `ManageRecruitment`. Receipt replay
never creates a second link or resurrects a disabled one. Links resolve against
the current universe epoch and alliance, so renames preserve them and disband or
reset invalidates them.

An invitation identifies the alliance and universe. Its public page carries that
destination through signup/sign-in and explicit ordinary universe enrollment.
Existing members of the universe skip enrollment. The game welcome offers an
explicit join, or an editable application requiring submission and approval,
plus Start playing to reach the overview. Existing alliance membership and pending
applications are respected. Neither an invitation nor viewing its welcome creates
a membership, application or friendship. Admission and recruitment eligibility
are rechecked by the existing transactions.

Anonymous reads are rate-limited and omit private membership/application content.
The HTTP API adds `GET /api/v4/universes/{id}/recruitment` (search, language,
beginners, activity, offset) and `GET /api/v4/universes/{id}/invitations/{token}`.
The invitation page is `/invite/{universe}/{token}`. Both it and the public
alliance page provide crawler metadata and a downloadable PNG at `/image`.
Rendering uses one deterministic template, bundled fonts and public name/tag;
it does not publish restricted cosmetic originals or introduce alliance insignias.

Migration `0035_alliance_recruitment.sql` adds authored preference JSON and the
current invitation token. Counts, eligibility, universe availability, filtering,
and previews are derived. Recruitment definitions use stable values separate
from UI labels; add future fields/options through the domain model, contract,
shared UI definitions and tests. No generic form-builder or reward system is
required. Personal friend invitations remain separate work under issue #201;
recruitment discovery extends issue #202.

Optional analytics distinguish invitation/directory page views and confirmed
enrollment, application and joining events. Tokens, application text and link
creator identity are not included in those custom events. These observations
are not referral entitlements or an authoritative record of player retention.


## Identity, Hall, and public presentation

Alliance navigation opens the Hall, retaining game navigation while omitting the
planet/resource strip in alliance views. Shared identity, private Hall prose, and
per-template public content have separate sources. Flagship, Transmission, and
Citadel use the same published identity; inactive template content is retained.
The editor offers normal fields, Markdown/autolink support, a full-page preview,
and explicit saves. Uploaded artwork is alliance-owned and customization is free.

New-player recruitment appears inside the orb-led arrival sequence after planet
naming. Local signup and universe enrollment retain the selected alliance as
source intent; membership and applications still require explicit normal actions.
Existing players use the direct welcome/admission path.

See [Alliance customization and uploads](../operations/alliance-customization.md)
for permissions, media lifecycle, storage, operator limits, and upgrade details.
