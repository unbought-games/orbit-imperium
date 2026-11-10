# Remaining e2e migration: audit and daily workstreams

This is the durable handoff for finishing the testing overhaul after phase one,
PR #385. Audited **2026-11-10**, against merged revision
`0c235fd6d27422374abf61ea44e39c015a9c1675`. This plan supersedes the earlier
proposal for two large implementation chats. **No implementation stream has
started as part of this audit.**

Start with [STATUS.md](STATUS.md), then read only the selected brief and its
inventory. The [audit](AUDIT.md) records shared findings, retirement gaps,
server/acceptance obligations and validation evidence. [FILES.md](FILES.md)
indexes every current browser spec. The frozen [manifest](inventory/manifest.json)
records provenance and ownership.

## Complete scope

| Boundary | Expanded cases | Files | Treatment |
| --- | ---: | ---: | --- |
| Required application fixtures | 816 | 73 | Includes 39 journey candidates and 777 feature integrations; every case assigned to 01–08 |
| Isolated components | 271 | 27 | Also audited by 01–08; moving a test here is not automatically the cheapest valid boundary |
| Production homepage | 10 | 1 | Required separately; owned by 09 |
| Explicit acceptance browser cases | 22 | 13 | Owned by 09; remain explicit-only |
| Script/native acceptance | Not a Playwright count | See audit matrix | Recovery, migrations, containers, rolling updates and other native probes |
| Original pre-migration application inventory | 1,183 | 76 | Retained by owner for historical reconciliation; not an additional current suite |

The **1,119 current browser rows** and **1,183 historical rows** are exported
under `inventory/`. These are collection results, not newly executed tests.
Historical rows link the appropriate migration ledger and list exact-name
matches where available. A name match is **not coverage equivalence**. The
three original files no longer in the application inventory are
`action-sheet.spec.ts`, `identity-typography.spec.ts`, and
`harvest-reports.spec.ts`; their histories belong to 05, 07 and 08 respectively.

## Ten workstreams

Each stream may take multiple daily sessions. The first slice is deliberately
smaller than the stream. Case counts are ownership inventories, not promised
replacement counts or token estimates.

| ID | Workstream | Application / component cases | First slice |
| --- | --- | ---: | --- |
| [01](workstreams/01-resources-and-quotes.md) | Resources, quotes and production controls | 108 / 0 | Quick-build restrictions and held quotes |
| [02](workstreams/02-catalog-and-progression.md) | Catalog, manufacturing and technical details | 131 / 67 | Comparison controls and duplicate item variants |
| [03](workstreams/03-dispatch-and-fleets.md) | Dispatch, Galaxy, fleets and mission controls | 120 / 99 | Submission/outcome feedback |
| [04](workstreams/04-empire-and-settings.md) | Empire, lifecycle and settings | 56 / 13 | Present versus carried wealth/inventory |
| [05](workstreams/05-shell-and-navigation.md) | Shell, navigation, public layout and primitives | 154 / 52 | Density and selection layout variants |
| [06](workstreams/06-startup-hud-and-tutorial.md) | Startup, auth, recovery, HUD and tutorial | 139 / 5 | Buffered HUD pagination and refresh |
| [07](workstreams/07-social-and-identity.md) | Social, alliances, recruitment and identity | 49 / 28 | Directory filtering and compact controls |
| [08](workstreams/08-reports-and-cleanup.md) | Reports, sharing, deletion and history | 59 / 7 | Independent rollback and archive outcomes |
| [09](workstreams/09-harness-and-acceptance.md) | Shared harness, contracts and explicit acceptance | 0 / 0; owns 32 other browser cases | Unexpected API diagnostics and deliberate errors |
| [10](workstreams/10-cutover-and-reliability.md) | Journey gate, CI cutover and agent guidance | Cross-cutting | Review the 39 candidates; final cutover after 01–09 |

Suggested initial order: **01, 02, 08, 07, 04, 03, 06, 05, 09, 10**. This is a
convenience order, not a dependency chain. 01–08 can start independently on their
owned files. Move 09 earlier if a shared fixture defect blocks a slice. 10 can
prepare the journey contract matrix early, but cannot remove the broad feature
cohort until the domain dispositions and acceptance evidence are complete.

## Daily-session contract

1. Start from current main and read this stream's status. Compare only its owned
   files and shared dependencies against the snapshot; do not repeat the global
   inventory/audit. New main tests become explicit delta rows under an owner.
2. Pick one behavior family and state its protected regression. Use the existing
   production seams and coverage identified in the brief. Refactor missing seams
   without duplicating derived state or mocking the production behavior.
3. Add and validate meaningful lower-layer coverage. Retain each useful browser
   assertion until its replacement passes. Preserve native input/layout/focus
   where static rendering is insufficient, and real HTTP/DB coverage for server
   invariants. Every removed assertion needs a named replacement or rationale.
4. Finish a coherent slice and record the revision, exact coverage mapping,
   validation, repair history, unresolved contracts and next smallest slice in
   STATUS.md. Keep the unconverted suite required. Do not mark the whole stream
   done after completing its first slice.
5. Publishing/PR/merge follow the user's instructions for that session. A workstream
   brief is not blanket permission to merge or deploy. Leave local work committed
   and clearly identified if publishing is not requested.

If work overlaps, nominate one validation owner. Serialize browser suites,
production builds and full typechecks across the machine; parallel worktrees do
not isolate resources. A single daily chat can own its own validation. Shared
fixture/runner edits belong to 09; final selection/global guidance to 10.
Domain-owned component registry additions can be handed to the active integration
owner without waiting for all of 09. Coordinate these small shared edits explicitly.

`05` alone owns `shell.spec.ts`, even when it embeds a fleet, report or economy
assertion: other owners send exact title paths and replacement evidence.
`04` owns the existing `tutorial-settings.component.spec.ts`; `06` can add a
separate tutorial scene/spec or coordinate a serial edit. These boundaries prevent
hidden cross-stream conflicts.

## Access before these documents are merged

The audit is published on `emick/test-migration-audit`. If a new implementation
checkout does not yet contain this directory, fetch that branch and read the
selected document without replacing its source tree:

```sh
git fetch origin emick/test-migration-audit
git show origin/emick/test-migration-audit:docs/verification/e2e-migration/README.md
```

Prefer merging the documentation-only branch into main before starting multiple
streams so their status records share one home. Until then, preserve slice
handoffs on their implementation branches and link them from the audit status;
do not silently drop the audit or rerun it because the selected checkout lacks it.

## Low-token lookup

Do not load every CSV into a chat. Each brief names its own current and historical
CSV. Filter by file or exact case ID before reading a source body:

```sh
python3 - <<'PY'
import csv
path = 'docs/verification/e2e-migration/inventory/01-current.csv'
for row in csv.DictReader(open(path)):
    if row['file'].endswith('/building-quotes.spec.ts'):
        print(row['id'], row['title_path'], row['source_declaration_lines'])
PY
```

Full title ancestry and project distinguish cases with identical leaf titles.
Use IDs for handoffs, while preserving the displayed title for humans. Frozen
CSV rows are not updated to pretend a changed test is the same original case;
record additions, removals and renames in STATUS.md, with predecessor IDs.

## Done means done

Every original/current/delta case has a final disposition; every worthwhile
replacement passed; retired browser-specific gaps are explicit; remaining
application journeys each name a unique integration risk; the temporary broad
feature cohort is removed only then. Deterministic and relevant isolated component
coverage remain required. Explicit acceptance, runner commands, selection tests,
diagnostics and the test-design skill agree. Exact PR/queue/main validation and
five naturally occurring subsequent merged PR lifecycles supply operational
reliability evidence. Until that evidence exists, report structural migration and
operational follow-up separately rather than claiming the entire overhaul complete.
