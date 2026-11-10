# Alliance audit redesign — 2026-11-10

Base revision: `c6821956` (Settings committed at the owner's request). Validation
covers the uncommitted Audit changes above that revision.

## Behavior and compatibility

- Replaced cards and raw command/target IDs with a compact semantic table:
  Player, Action, Target, Date / time. Newest-first ordering remains server-owned.
  Local dates include the year and seconds; the column title identifies the
  local time zone. Mobile targets move beneath the action, retaining identities.
- Added optional immutable subject context to audit events: a player ID, the role
  name at the time, or the notice title at the time. These are historical facts,
  not a cache of current role/post state. Historical events deserialize without
  the new field. Existing target IDs remain in the API for compatibility.
- API projection resolves old player targets independently of roster membership,
  old accepted/rejected/withdrawn applications from retained Apply event IDs,
  and roles/notices from full alliance source state. New snapshots win over
  current names. Missing historical objects have explicit human-readable fallbacks.
- New events distinguish role create/update, notice pin/unpin, and invitation
  create/replace/disable. Historical ambiguous pin and invitation events retain
  generic wording rather than inventing an action direction. Automatic leadership
  succession identifies the successor; ordinary empire removal has no misleading
  leader target.
- Names of deleted accounts may be unavailable. Player display names are resolved
  through existing identity data; this does not create an account-name archive.
  No historical migration/backfill or production mutation was performed.

## Validation

- Focused engine/application library tests: 32 passed, build 18.16s, tests 0.036s.
  Includes new historical-context, deleted subject, application consumption,
  legacy deserialization and projection tests, plus existing privacy coverage.
- PostgreSQL alliance suite: 11 passed, compilation 29.98s, runner preparation
  0.25s, execution 38.185s. Added assertions that accepted/kicked target names
  remain resolved after the target leaves the roster. Existing concurrency,
  authorization, replay, revocation and HTTP privacy checks pass.
- Two client model tests passed (initial 160ms), covering legacy target resolution,
  snapshot precedence, unavailable objects and honest old-action wording.
- Two responsive Audit component cases passed: preparation 3,628ms, tests 1.3s.
  Initial desktop density assertion found a 58px row (limit 56px), while mobile
  passed. Reduced vertical padding and line height in production CSS; unchanged
  assertions passed. No test repair, deletion, timeout increase or lucky retry.
  Tests cover long deleted notice labels, timestamps, names, absent raw target IDs,
  compact density, overflow and the empty state.
- Application fixture suite: 11 passed, preparation 4,476ms, tests 13.4s.
- Component/application TypeScript, focused ESLint, Prettier, Rust formatting,
  contract compilation/generated drift and diff checks passed. Client fixture
  types were narrowed after validation without changing runtime behavior; focused
  type/model checks were repeated.

## Local review and cleanup

Rebuilt the existing development server (42.11s) and restarted it on the existing
55398 playground. Inspected and captured populated Audit at 1440×1000 and 390×844;
existing names, application histories, role names and notice titles resolve in
that real local history. No sample history was fabricated or edited.

The first disposable database setup hit Docker's exhausted default subnet pool
before tests ran. After inspecting existing networks, a task-only Compose override
used a free explicit subnet. The isolated validation project, database volume and
network were removed after the passing suite; no other containers were stopped.
Temporary dependency linking and the Compose override were removed. The local
app remains running with Audit selected and its viewport override reset. No
push, Audit commit, hosted CI run or deployment was performed.
