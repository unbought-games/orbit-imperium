# Migration status and resume log

Audit baseline: `0c235fd6d27422374abf61ea44e39c015a9c1675`, 2026-11-10.
The inventory/audit is complete for the scope described in AUDIT.md. Implementation,
replacement-equivalence validation and final CI cutover remain open.

| Stream | State | Last completed slice | Next slice | Implementation / verification revision |
| --- | --- | --- | --- | --- |
| 01 Resources/quotes | Merged | PR #387 | Follow-up evidence in test-migration-resources.md; no new assignment | `d8b750211ef90a896e6b833ea28aa20c385ce20b` |
| 02 Catalog/progression | Not started | — | Comparison controls/item variants | — |
| 03 Dispatch/fleets | Not started | — | Submission/outcome feedback | — |
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
