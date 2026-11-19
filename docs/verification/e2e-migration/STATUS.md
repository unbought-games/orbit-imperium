# Migration status and resume log

Audit baseline: `0c235fd6d27422374abf61ea44e39c015a9c1675`, 2026-11-10.
The inventory/audit is complete for the scope described in AUDIT.md. Implementation,
replacement-equivalence validation and final CI cutover remain open.

| Stream | State | Last completed slice | Next slice | Implementation / verification revision |
| --- | --- | --- | --- | --- |
| 01 Resources/quotes | Merged | PR #387 | Follow-up evidence in test-migration-resources.md; no new assignment | `d8b750211ef90a896e6b833ea28aa20c385ce20b` |
| 02 Catalog/progression | Merged | PR #406 | Owned migration complete; post-merge failures assigned to 03/06 below | `7b2fa0612740ca40ad579a02e460a912f0e9da03` |
| 03 Dispatch/fleets | Merged | PR #417 | Complete handoff in test-migration-dispatch-fleets.md | `7d57e0532827fffe2bde0da65f03e8045b460dda` |
| 04 Empire/settings | Merged | PR #446 | Complete handoff in test-migration-empire-settings.md; retained layout gaps remain explicit | `3e5540e1d9834ca45ecd007f853b3f793720431b` |
| 05 Shell/navigation | Merged | PR #448 | Complete handoff in test-migration-shell-navigation.md | `3292240300c4addd3a499a69622f2cb6af41e7c9` |
| 06 Startup/HUD/tutorial | Merged | PR #456 | Complete handoff in test-migration-startup-hud-tutorial.md; combined caption-sequence gap explicit | `150db24f196c01fabcc7181b6f4f10ffa454ddb0` |
| 07 Social/identity | Merged | PR #461 | Complete handoff in test-migration-social-identity.md | `5508c75b5c40d45b1db1781afc1b2dde1bdda693` |
| 08 Reports | Delegated | — | Whole stream through merge with mandatory fresh adversarial review | Chat `01a1f17b-bd5d-7b81-b1b7-e07b5eb14524` |
| 09 Harness/acceptance | Not started | — | Unexpected-operation diagnostics | — |
| 10 Cutover/reliability | Guidance/reconciliation merged; final cutover pending | PR #462; light retrospective recorded | Final decision after 08/09, preserve required feature cohort | `1a8db8508f3c6ed0b13a67c1ca010d1a1856ddb6` |

## Slice record template

Append one entry per bounded slice; update the table above. Link this entry from
the PR/handoff. Do not merely write “tests pass” or “migration complete.”

- Stream, date, owner chat, branch/PR, implementation revision and tested revision:
- Source/spec files changed:
- Original current/baseline case IDs and full title paths:
- Assertion-to-replacement map (new test path and exact test name), or retirement rationale:
- Unique application/browser protection still retained; known gaps:
- Commands, result counts, setup/execution times, cleanup; expensive checks pending:
- Failure classification, exact attempt evidence, prior repair and disposition:
- Shared-file/cross-owner handoffs and whether accepted:
- New main tests, renamed cases, removed cases and their predecessor IDs:
- Next smallest slice, with exact files/cases:

## Completion ledger

| Obligation | Owner | Evidence needed | State |
| --- | --- | --- | --- |
| All 816 application and 271 component rows disposed | 01–08; reconciled by 10 | Case mapping and passing replacement evidence | Open |
| Historical 1,183-row ledger and new-main delta reconciled | 01–08; reconciled by 10 | Explicit retirement gaps and final identities | Open |
| Actual server invariants covered | Domain owners; 09 integration | Exact unit/HTTP/DB test names and results for changed contracts | Open |
| Explicit/production acceptance matrix | 09 | Revision-bound results, cleanup and any declared omissions | Open |
| Final small journey gate and selection union | 10 | Unique contract for each retained journey; no unassigned feature cohort | Open |
| Commands, guidance and obsolete scaffolding | 09/10 | Final Make/npm/config/skill audit | Open |
| PR, merge group and resulting main validation | Final implementation owner | Exact revisions and all attempts | Open |
| Five subsequent natural merged-PR lifecycles | 10 follow-up owner | First-attempt outcomes and phase timings, including infrastructure/cancellations | Open |

## 2026-11-10: stream 01 assignment

Assigned the full Resources, quotes and production controls workstream to chat
`01a1c830-b10b-7d70-a7b1-a96a254133af` (Migrate resource and quote tests end to end).
The owner explicitly requested implementation end to end and a PR. This supersedes
the brief's generic first-slice stopping advice for this assignment. The chat owns
implementation, coverage mapping, validation, CI and review fixes; it must leave
the PR open for owner inspection without enqueueing or merging. No implementation
or passing validation is claimed by this delegation record. Other streams remain
unstarted.

## 2026-11-12: rebase and stream 02 assignment

Fetched main `c39cb5df489e12f557c4acb7e1163846064560db` and rebased the audit
branch cleanly. Confirmed stream 01 merged in PR #387 on November 11 at
`d8b750211ef90a896e6b833ea28aa20c385ce20b`; its focused verification and case
ledgers are on main. Frozen audit CSV contents remain the original snapshot;
CSV line endings were normalized without changing parsed records.

Assigned the full Catalog, manufacturing and technical details workstream to
chat `01a1d2ad-3969-7510-85ea-d05e9a356ab3` (Complete catalog and progression
test migration). The user explicitly requested /pr and /finish-pr through a
confirmed merge. This assignment supersedes the earlier review hold for this
new workstream. The child owns implementation, relevant main-delta reconciliation,
validation, PR creation, CI/review fixes and merge-queue follow-through. It must
not stop after the suggested first slice or claim completion at queue enrollment.
No implementation or passing validation is claimed by this delegation record.

## 2026-11-13: rebase and stream 03 assignment

Fetched main `e9de5904c7132b07b24a89918a8b0415ebea0199` and rebased the audit
branch cleanly. Confirmed stream 02 merged in PR #406 at
`7b2fa0612740ca40ad579a02e460a912f0e9da03`. Its current/historical/delta
ledgers and verification handoff are on main.

Assigned the whole Dispatch, Galaxy, fleets and mission-controls stream to chat
`01a1d61e-5bb1-79f3-8182-afcea36275c9` (Complete Dispatch Galaxy and fleets test migration),
with explicit /pr and /finish-pr authorization through confirmed merge. The
child owns implementation, relevant main-delta reconciliation, validation and
CI/review/merge-queue follow-through. No implementation success is claimed by
this assignment. Preserve newer Enter-submit (#412), fleet-card navigation
(#407), and canonical selected-body path requirements.

PR #406's separate post-merge main run `43359549586` recorded two non-stream-02
failures; these must not disappear behind the green PR/merge-group results:

- 03: `moon fleet operations 1440 > Galaxy moon actions and quick espionage
  bind the moon rather than its planet`, job `131669658465`, artifact
  `14006839869`. Correct moon-bound spy command, missing reopened dialog after
  conditional click; mechanism unconfirmed, no repair applied by 02. Inspect
  current code and complete repair history before classifying/acting.
- 06: `foreground refresh confirms an accepted response with accessible reduced
  motion`, job `131669658426`, artifact `14007912034`. Missing HUD caption after
  overview response release; mechanism unconfirmed, no repair applied by 02.
  Owner 06 must reconcile this evidence with later fixes when launched.

The stream-02 handoff also explicitly retains Cruiser attack and Large Cargo
transport launch journeys for stream 03. Those exact launch cases are a narrow
cross-file handoff; their catalog/comparison/manufacturing assertions remain
owned by stream 02. Frozen CSVs stay unchanged; record the delta during 03.

## 2026-11-16: rebase and stream 04 assignment

Fetched main `816b01c197fcb53d768141d9c3db3445f9fbc4fc` and rebased the audit
branch cleanly. Confirmed stream 03 merged in PR #417 at
`7d57e0532827fffe2bde0da65f03e8045b460dda`. Its source handoff and case ledgers
are on main; the originating chat reports PR, queue and main CI passed. The
Arrival repair and retired desktop moon journey gap remain in that record.

Assigned the whole Empire, lifecycle and settings stream to chat
`01a1e652-17b2-7ae2-b2b5-92de627738e4` (Complete Empire lifecycle and settings
test migration), explicitly authorized to use /pr and /finish-pr through
confirmed merge. No implementation/validation success is claimed by this
assignment. Other unassigned workstreams remain unstarted.

The child must reconcile #444 Empire personalization, #439 Base UI overlays and
#445 in-memory order retries against the frozen audit. Historical references to
persisted/restored retry state are not permission to restore intentionally removed
behavior. Keep the frozen inventories unchanged and record current-main deltas,
including justified obsolete assertions, in the stream-04 handoff. Preserve
canonical selected-body paths and the retired desktop vacation scenario's history.

## 2026-11-17: rebase and stream 05 assignment

Fetched main `3e5540e1d9834ca45ecd007f853b3f793720431b` and rebased/published
the audit branch cleanly. Confirmed stream 04 merged in PR #446 at that revision.
Its originating chat reports PR, queue and main CI passed; local validation
passed 22 application, 41 component and 29 database cases. The focused handoff
and current/historical/delta ledgers are on main.

Assigned the full Shell, navigation, public layout and primitives stream to
chat `01a1e9c6-d23e-7fe2-8118-f85d3787a333` (Complete shell and navigation test
migration), explicitly authorized to use /pr and /finish-pr through confirmed
merge. The assignment includes all owned case dispositions and relevant
current-main reconciliation, not only the suggested first slice. No implementation
or validation success is claimed by this delegation record.

Stream 04 retained four full-shell application layout cases after failed
component migrations, including command-view overflow and long fleet names/
manifests. Preserve the original healthy coverage and exhausted replacement
history documented in test-migration-empire-settings.md. The child also owns
reconciliation of canonical routeTarget paths, Base UI overlays, account-link
new-tab behavior, fixed resource-header overscroll, personalized Empire identity
and in-memory-only retries. Other streams' unfinished domain coverage must not
be silently removed while splitting mixed shell cases.

## 2026-11-17: rebase and stream 06 assignment

Fetched main `73e865124518c02fb69a10f476e816d1f9b419a1` and rebased/published
the audit branch cleanly. Confirmed stream 05 merged in PR #448 at
`3292240300c4addd3a499a69622f2cb6af41e7c9`. Its source handoff and current/
historical/delta ledgers are on main; the originating chat reports 137 application
and 89 component cases validated, with make check, PR, queue and main CI passing.
Its two geometry-measurement repairs retain their documented allowances.

Assigned the full Startup, authentication, recovery, HUD and tutorial stream to
chat `01a1ec36-06a1-71f1-843d-e11abfdced0e` (Complete startup HUD and tutorial
test migration), explicitly authorized to use /pr and /finish-pr through a
confirmed merge. No implementation or validation success is claimed by this
delegation record. The child owns reconciliation of the historical HUD-caption
failure recorded above; no green retry or previous stream completion closes it.

The handoff emphasizes current canonical routeTarget paths, Base UI overlays,
in-memory retries (#445), removed report-read confirmation messaging (#452),
and removal of the retired transition journal (#451/#454). Historical fixtures
must not reinstate intentionally removed product behavior. Frozen inventories
remain unchanged; current-main deltas belong in the stream-06 ledger.

## 2026-11-18: rebase and stream 07 assignment

Fetched main `03fd2a622acec3a99eda582c959d7783f274b87f` and rebased/published
the audit branch cleanly. Confirmed stream 06 merged in PR #456 at
`150db24f196c01fabcc7181b6f4f10ffa454ddb0`. Its originating chat reports all
115 final browser cases, PR, queue and main CI passed, with no queue removals
or actionable review findings. The combined held-HTTP/reduced-motion caption
case was retired under the unexplained-failure rule; its exact browser-sequence
gap and separate passing contracts remain documented in the focused handoff.

Assigned the full Social, alliances, recruitment and identity stream to chat
`01a1ef30-f8b3-7a63-8fd3-ca561afc616f` (Complete social alliances and identity
test migration), explicitly authorized to use /pr and /finish-pr through
confirmed merge. No implementation or validation success is claimed here.

The child must preserve the expired-cursor live recovery region and mounted
bot-to-human identity refresh until observable replacement coverage passes.
Reconcile newer alliance management, recruitment templates, universe-bound
invitations, deep links, uploads/greeting, emblem caching/ownership and Empire
identity against frozen inputs. Use canonical routeTarget paths, current Base UI
overlays and in-memory retries. Paid/private cosmetic originals and deployment
details remain excluded from public fixtures and documentation.

## 2026-11-18: accelerate guidance and adversarial review

The owner requested a separate chat for skill lessons/examples, journey-tag and
coverage-ledger reconciliation, and a reusable adversarial subagent. Assigned to
`01a1ef3c-3b4e-7110-8cdd-ccf62826d8ba` (Harden test guidance and add an adversarial
test reviewer). The skill must mandate fresh-context independent review after
new/materially changed browser e2e tests; rigorous evidence-based findings must
challenge minimality, critical-path value, placement, actual behavior and races.
The child must verify a supported agent configuration/invocation and behaviorally
validate the reviewer, not merely add a passive checklist.

This is an early bounded portion of stream 10, not completion of the final gate.
Do not remove unfinished feature coverage, start the broad measurement project
or duplicate the active social/identity stream. The parent recorded a light
[retrospective](RELIABILITY-2026-11-18.md): 61/62 main workflows passed, all on
attempt 1; the latest 40 consecutive runs passed. The one historical failed
workflow and report limitations remain explicit. No scheduled monitoring added.

## 2026-11-18: rebase and stream 08 assignment

Fetched main `7449be126307cf788c2f47083922c73e70f582f4` and rebased/published
the audit branch cleanly. Confirmed stream 07 merged in PR #461 at
`5508c75b5c40d45b1db1781afc1b2dde1bdda693`; its originating chat reports 37
application/54 component cases and first-attempt PR/queue/main CI passes.

The accelerated guidance portion of stream 10 merged in PR #462 at
`1a8db8508f3c6ed0b13a67c1ca010d1a1856ddb6`. Fresh-context independent review
using browser_test_reviewer is now mandatory after new/material browser-test
changes. The verified invocation and evidence requirements are in the current
test-design skill. The final feature-cohort cutover remains pending; the journey
review ledger is not permission to deselect unmatched coverage.

Assigned the whole Reports, sharing, deletion and history stream to chat
`01a1f17b-bd5d-7b81-b1b7-e07b5eb14524` (Complete reports sharing and cleanup test
migration), explicitly authorized for /pr and /finish-pr through confirmed merge.
The handoff requires the real fresh-context adversary and recorded dispositions,
not self-review or green CI as a substitute. No implementation success is claimed
by this assignment.

Reconcile current database report-read behavior (#404), archive shortcut (#413),
timestamps (#431), in-memory retry semantics (#445), removed read confirmation
copy (#452), sharing-revocation review (#470), orb outcome/age display (#484) and
Dreadnought report contracts (#483) where they touch the owned source. Preserve
actual HUD/shell wiring from 05/06 and retired report sequence repair history.
