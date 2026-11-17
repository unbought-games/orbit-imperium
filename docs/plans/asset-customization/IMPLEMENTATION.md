# First slice implementation contract

2026-11-16. This document supersedes conflicting proposals in the earlier study
documents. Owner approved implementation and one final PR for acceptance/UX review;
do not merge the final PR into main or deploy before that review.

## Product decisions

- Account-owned reusable ship designs; independent per-empire equipment pinned to
  immutable design revisions. Ship target starts with LightFighter.
- Emblems are explicitly empire-owned. Fix mutable account-template coupling:
  migrate each current empire's visible recipe to independently owned data.
  Existing account templates may remain reusable, but updates do not mutate another
  empire. Preserve history and unsupported/absent selections, and handle old clients.
- Authored ships follow the current empire emblem automatically, including edits,
  removal/default and access fallback. Never require resaving each ship.
- UUID render requests and account-owned UUID image artifacts. NO cross-account
  content-addressed bake deduplication. Immutable source/package hashes remain.
- Save records a design revision and selection transactionally; image creation is
  asynchronous. At most one running and one latest pending render per empire/target.
  New pending work supersedes older pending work. Running obsolete work may finish
  but must never activate. Persist exact authorized rendering input snapshots.
- Requests are idempotent; retries cannot duplicate designs/jobs. Preserve user
  edits and previously usable artwork during recoverable failure.
- Primary/accent named dyes; a guaranteed free dye set without hosted services.
  Real game emblems: none/full/layers; near-wing/paired placement. No automatic
  hue, contrast, outline or emblem simplification. Protected red propulsion/glass.
- Full-screen hangar: background fades in, ship arrives from depth, controls slide
  in; reduced motion and mobile remain usable. Ordinary ship ordering stays intact.
- All new UI, direct editor entry and appearance fetches require
  import.meta.env.DEV && import.meta.env.VITE_SHIP_CUSTOMIZATION === 'true'.
  Production UI and resource ordering must stay unchanged. Backend is fully secure
  and additive, independent of UI availability.
- No AI generation/credits, arbitrary uploads, deployment, or other 13 ship assets.

## Ownership and handoff

Integrator owns client-model/ship-appearance-types.ts, API adapter/controller/provider,
shared route/provider wiring, final test configuration and integrated validation.
Backend owns Rust crates, SQL migrations and OpenAPI additions (regenerate TS last).
Runtime owns tools/ship-appearance, packages/ship-appearance, free runtime skin
assets, renderer service Dockerfile and tool scripts. Hangar owns
features/ship-customization; Shipyard owns features/shipyard and fleet-inventory
presentation, and its narrowly scoped progression integration. Coordinate any
shared-file changes explicitly. Each chat commits its work but makes NO separate PR.
Integrator cherry-picks into emick/ship-customization-slice and opens the final PR.

Only integrator runs browser suites, builds and full typechecks on this host.
Focused cheap deterministic checks may run independently. Backend may run one
focused Rust compile/test at a time after notifying integrator via its handoff;
never overlap expensive validations. Record exact checks/failures and pending work.

## Public client contract

Canonical types: apps/web/src/client-model/ship-appearance-types.ts.
POST /api/v1/universes/:universe/ship-appearances with existing
{context:{binding,request_id},action} envelope and CSRF/session controls.
Every action returns ShipAppearanceState with matching binding and request_id.
Actions Load, Save, Equip, Reset, Cancel, Retry. Save.equip=true is atomic intent;
rendering completes later. Stale expected revisions return conflict; forged
ownership/dyes/targets rejected. No client-supplied URLs or rendered pixels.
Equipment records return latest render status and available display artwork.
Status stages queued/rendering/preparing/ready/failed/superseded/canceled.

## Rendering service seam

Versioned internal HTTP renderer adapter, separate Node runtime from Rust API.
Backend owns durable jobs, authorization, current selection, storage publication;
renderer accepts immutable trusted JSON inputs and returns PNG/WebP variants.
Initial endpoint POST /v1/render, configurable shared bearer credential; no browser
access. Request: {version:1,request_id,package_id,package_revision,colors:{primary,
accent},emblem:{recipe,appearance,treatment,placement}|null}. appearance is the
server-resolved real InsigniaAppearance (including resolved colors/art); renderer
must restrict asset fetching to trusted configured origins or installed assets.
Response: {version:1,request_id,renderer_version,variants:[{width,height,mime_type,
data_base64}]}. Render inputs/outputs strictly bounded. Runtime/backend coordinate
exact supported package revision and emblem texture contract before final wiring.
Backend adapter is replaceable and owns cancellation/recovery capabilities; no
provider coupling in player API. Artifact UUID per successful output, write bytes
before ready, stale worker completions fenced. No long DB transactions during render.

## UI seam

Integrator exports useShipAppearances() from shell/ship-appearances-context.tsx:
{snapshot:ShipAppearanceState|null,loading:boolean,error:string,
perform(action):Promise<boolean>,reload():Promise<void>}. Shared observations in
Zustand; drafts local. Provider mounted only behind gate and scoped by binding.
Hangar exports ShipCustomizer({target,onClose}) from features/ship-customization/
ship-customizer.tsx; target is canonical ship ID string. Shipyard opens it through
the integrator-owned launch seam; no localStorage production persistence.
Runtime exports a browser preview component/adapter with explicit package and
resolved paint/emblem inputs; cheap fallback while package loads.

## Acceptance

Real local backend save/equip/reload; two-universe emblem isolation; current emblem
changes refresh ships without saving them; A/B/C render supersession and retries;
invalid access/ownership; fallback retention; transparent size variants; desktop
and mobile full-screen interaction captures; production flag-off behavior.
Focused deterministic/HTTP/DB tests carry permutations. One short frontend journey
plus explicit actual local persistence exercise proves wiring. No CI full-system
expansion. Final PR stays open for owner acceptance.
