# Migration status and resume log

Audit baseline: `0c235fd6d27422374abf61ea44e39c015a9c1675`, 2026-11-10.
The inventory/audit is complete for the scope described in AUDIT.md. Implementation,
replacement-equivalence validation and final CI cutover remain open.

| Stream | State | Last completed slice | Next slice | Implementation / verification revision |
| --- | --- | --- | --- | --- |
| 01 Resources/quotes | Merged | PR #387 | Follow-up evidence in test-migration-resources.md; no new assignment | `d8b750211ef90a896e6b833ea28aa20c385ce20b` |
| 02 Catalog/progression | Merged | PR #406 | Owned migration complete; post-merge failures assigned to 03/06 below | `7b2fa0612740ca40ad579a02e460a912f0e9da03` |
| 03 Dispatch/fleets | Delegated | — | Whole stream through merge; inspect recorded moon-fleet failure | Chat `01a1d61e-5bb1-79f3-8182-afcea36275c9` |
| 04 Empire/settings | Not started | — | Present/carried wealth and inventory | — |
| 05 Shell/navigation | Not started | — | Density/selection layout | — |
| 06 Startup/HUD/tutorial | Not started | — | Buffered pagination/refresh | — |
| 07 Social/identity | Not started | — | Directory filters/compact controls | — |
| 08 Reports | Not started | — | Independent rollback/archive outcomes | — |
| 09 Harness/acceptance | Not started | — | Unexpected-operation diagnostics | — |
| 10 Cutover/reliability | Waiting for implementation evidence | — | Candidate journey contract matrix | — |

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
