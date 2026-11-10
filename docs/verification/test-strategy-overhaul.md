# Test strategy overhaul verification

Base revision: `a119915ffaeb881a7f54d65542478f4788bd4210`.

## Changes and coverage accounting

Application browser checks now use a temporary, precompiled fixture bundle.
Compilation finishes before assertions begin; development previews are retained,
but this artifact is not used for releases. Isolated components use a separate
test-only gallery, actual production views/controllers, controlled external
ports, and a guard against game API traffic and page errors.

CI keeps three disjoint required classes: tagged application journeys, isolated
components, and remaining feature integrations. The inventory policy checks their
union, shard forwarding, and placement of every browser file. Unconverted unique
browser assertions remain required; they are not quarantined or described as
unit coverage. Full-system acceptance and production-homepage checks retain their
separate purposes. Routine execution-deadline and merge-protection policies are
unchanged.

Detailed original-scenario dispositions and named replacements:

- [Dispatch](test-migration-dispatch.md)
- [HUD](test-migration-hud.md)
- [Progression](test-migration-progression.md)
- [Catalog content](test-migration-catalog-content.md)
- [Reports](test-migration-reports.md)
- [Shell and profiles](test-migration-shell-profiles.md)
- [Shell components](test-migration-shell-components.md)
- [Social and alliances](test-migration-social-components.md)
- [Galaxy and fleets](test-migration-galaxy-fleets.md)
- [Tutorial and settings](test-migration-tutorial-settings.md)

The integration-owned moves preserve all 12 action-sheet assertions, 48 isolated
detail-preview cases, and three identity typography cases in the component
gallery. The three detail cases involving real application completion/routing
remain application tests. NumberInput selection/caret/native submission uses
two isolated mouse/touch cases, with a representative Dispatch wiring case and
both coordinate-entry application cases retained. LoadingPresence timing remains
in its unit tests; two component cases retain geometry, inert content and focus.
The remaining directory journey verifies actual query delivery, editable controls
and recovery without installing a clock that can already be in the past.

## Baseline and failure accounting

Dependency installation took approximately four seconds. The baseline client
run passed 1,498 tests in 165 files in 9.40 seconds. The original application
suite ran 1,183 cases: 1,167 passed and 16 failed in 1,859.056 seconds, after
6.881 seconds of module preparation. No retries were enabled.

Parallel validation across separate worktrees caused shared-host contention:
load reached 45.5 on 12 cores. The run remains failed validation. Contention is
not proof that every assertion failure was infrastructure-caused, and these
failures are not counted as 16 proven flakes. Evidence was retained under
`test-results/test-strategy/baseline-a119915f`. Subsequent expensive validation
has one owner and runs serially across chats; this is now in AGENTS and the skill.

The first integrated application run passed 834 of 835 cases in 735.465 seconds,
after 4.693 seconds of bundle preparation, with two workers. Its one failure
waited for a development `tsr-split` URL rather than the actual built Defense
chunk. Inspection of Vite's emitted asset manifest identified the corresponding
chunk. The interception now handles that built path while preserving the held
preload, body switch, direct load and history assertions. The affected case
passed in 3.4 seconds of runner time. This was a fixture-runner compatibility
correction, not an unchanged retry or a timeout increase.

The first integrated component run passed 257 of 272 cases in 287.222 seconds
with one worker. The individual ledgers retain its authored-fixture failures and
repairs. Ambiguous locators, missing price metadata, missing caller layout
context, diagnostic-output overflow and invalid touch cleanup were diagnosed
before repair. The combined-modality tooltip replacement failed again after its
one repair; it was removed and the unchanged original touch-only application
coverage restored. That unsuccessful migration did not erase source coverage.

## Product defects and review findings

Component isolation exposed Motion's initial-only preference hook in the action
sheet/popover. Both now use the existing subscribing reduced-motion hook. The
popover test proved the old exit delay remained after changing preference; the
repaired product passes without relaxing that assertion. Its new test then needed
one explained clock repair to execute FloatingFocusManager's queued focus frame.

Toast activation now distinguishes pointer gestures from fresh keyboard/assistive
activation. Raw pointer movement prevents an accidental open before Motion's drag
callback; cancellation does not permanently disable keyboard activation.

Independent review prevented coverage loss: four healthy production-settings
cases and a mounted profile update were restored; buffered HUD pagination remains
covered; expired-noticeboard live status remains covered; and fleet disclosure
now verifies changed membership while staying expanded. Controller tests are not
credited with those DOM, storage, focus or route contracts.

## Integration status

Final inventory: **816 application cases** (39 tagged journeys and 777 remaining
required feature integrations), **272 isolated component cases**, and the
separate 10-case built-homepage check. The small journey cohort is implemented;
the remaining feature integrations are still mandatory. This does not claim that
every application contract has become an isolated component.

| Validation | Result |
|---|---|
| Component suite after explained repairs | 272 passed, no skips/retries; 144.831 s with two workers |
| Post-consolidation navigation, selection, social and alliance files | 38 passed; 41.333 s with two workers |
| Final public-directory entry variants | 2 passed; 0.901 s with two workers |
| Final application inventory reconciled against passing runs | All 816 full title paths/projects have passing evidence; no missing case |
| Tooling | 130 passed; one existing opt-in Docker check skipped |
| Client | 1,744 passed in 186 files; 6.37 s |
| Rust workspace, bridge and storage-library runs | 752 + 47 + 10 passed; execution 29.761 s, 1.034 s and 0.019 s |
| Clippy, Rust formatting, frontend lint/format, contracts and boundaries | Passed |
| Component/fixture TypeScript | Passed |
| Production frontend build and prerender | Passed after the fixture typing correction below |
| Built-homepage production assets | 10 passed; 3.3 s |

The complete `make check` attempt passed its tests/static checks but failed its
last build step on a newly authored readonly-array fixture type in
`alliances/recruit.test.ts`. Replaced its deep readonly assertion with the actual
mutable input tuple contract. The affected six tests passed (0.270 s runner),
and the complete `npm run build` phase then passed. That failed attempt remains
recorded; no Rust or already-passing browser run was repeated for this type-only
correction. New component fixture types also caught a missing capability reason
and a widened protocol discriminant before final validation.

The application evidence comes from the full integrated run, its one explained
bundle-URL repair, and the changed files after consolidation. Reconciliation uses
full suite ancestry and project, not file plus leaf title, which is not unique.
The full-run starting revision was
`93cc09fea72b4f1f32c2864bef4dea3a1147ebfe` with working-change SHA-256
`1e7a235f976ba67e261a77cb56139379e04c6eab20babba7f11c0e14ebc3f2f5`.
The validated implementation snapshot is
`80839e2484ee82b10624fdf1c91ed61107f930ef`; the following commit only records this
verification revision. Local runner allocation wait was not separately measured; no GitHub CI,
merge-queue delay or post-merge result is claimed.

Inspected final real-component captures for notifications and Harvest controls at
1280×900 and 390×844, including the popover/sheet branches and changed motion
preference while open. Crops are in `test-results/test-strategy/visual/` and are
displayed in the originating chat. The first manual capture attempt used Vite's
default port and failed before browser startup because another service owned it;
the capture then used the existing reserved-port helper. Initial notification
captures caught the entrance fade; refreshed captures wait for the actual settled
opacity/transform, without changing the component or adding a sleep.

All validation browsers and Vite servers were closed. Application test bundles
were removed by the runner; retained failure logs, reports, traces and screenshots
remain local under `test-results/test-strategy/`. No Docker resources were started
for this frontend migration. Lockfiles and CHANGELOG remain unchanged. No PR,
push, deployment or repository-protection change is part of this verification.
