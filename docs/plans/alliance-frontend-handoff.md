# Alliance frontend handoff — complete

All implementation is in the assigned shared worktree on `feat/alliances`, uncommitted. No push, PR, deployment, or branch changes.

## Implemented

- Generated-schema aliases and strict adapter validation, request/binding/command correlation, same-origin authenticated commands and credential-free public GET.
- Narrow additive GamePort/http/Coordinator methods. Alliance 403/404 errors stay local; only 401/EpochChanged trigger session recovery. Coordinator regression covers both query and command NotFound.
- Screen-scoped Zustand controller with stale-request suppression, immutable command ID/intent retry after uncertain outcomes, double-submit blocking, refresh after commit and clearing private data on denied access.
- Directory/search/pagination (20 items), creation, open joins, applications, withdrawals, member roster/coarse activity, application administration, custom roles and delegation, multi-role assignment, notice creation/edit/delete/pin/pagination, profile/recruitment settings, leadership transfer, leave/disband and audit.
- Editing drafts retain only explicitly edited fields across refresh and section changes; no localStorage/sessionStorage copies. Clear on permission/membership/session loss. Confirmations identify destructive targets.
- Safe basic Markdown disables raw HTML/images and allows only http/https/mailto/root-relative/anchor links.
- Public recruitment page bypasses auth/bootstrap, displays ranking when available, links stable universe UUID entry to canonical named game route after authentication.
- Shared PlayerName on roster/applications/board/audit. Roster identity explicitly uses current summary. Visible author/profile watchers use parent's `useProfilePlayers`; departed authors can display a fresh current affiliation, with no fabricated old tag. Applicants explicitly unallied.
- Successful Create/Join/Accept/Leave/Kick/Disband/Update/Transfer and successful uncertain retries call parent's identity refresh hook, fencing stale identity responses and updating shell labels immediately. Three affected recruitment/roles/transfer scenarios passed in 6.9s after this final integration; TypeScript and scoped lint passed again.
- Community navigation, protocol-four-only route, no-planet route support, search preservation and generated route tree. Updated old navigation/shell expectations.

## Contract integration

Read backend `alliances/reads.rs`. Directory intentionally has `alliance: null` and uses pages of 20; controller separately reads Mine before offering membership actions. Unallied Mine fetches the directory. Foreign detail uses public GET, never private Detail. No contract or dependency changes required. `markdown-it` already exists; local declaration covers its small used API.

## Validation

Base revision: `308785d86af4d5fb361c24f0e7f9fbeaea0c98e2`. Frontend owned/additively-edited file snapshot SHA-256 (sorted paths + NUL + file bytes + NUL): `77e318769c0d7d4785a8720611e17cbc678c32e6113c2ca5f1f8aa0815fa70aa`. Shared worktree includes concurrent backend/identity/ranking changes; coordinator owns final integrated digest.

- `npm test -- ...alliances.test.ts ...coordinator.test.ts ...adapters/alliances.test.ts ...markdown.test.ts ...navigation-model.test.ts ...routes.test.ts`: 64 tests, six files passed, 1.42s final run.
- `npx tsc --noEmit -p apps/web`: passed.
- Scoped ESLint across all frontend ownership/new files and additive integration files: passed.
- `git diff --check`: passed.
- Eight alliance browser scenarios passed together in 10.4s with screenshots. Covers rejected drafts surviving refresh, creation/applications/withdrawal, role creation and administration, board edit/pin/paging, unauthenticated public privacy, Open/Closed joins, denied access, server-returned rollover, and immutable retry IDs.
- Subsequent expanded role test explicitly edits a custom role and assigns two custom roles; it and public page passed in 3.5s.
- After adding current identity watchers, three affected scenarios (roles/transfer, revoked access, departed-author fresh tags + roster override) passed in 4.2s. There are now nine alliance scenarios total; parent will run final integrated fixture suite.
- Updated legacy protocol shell navigation fixture passed in 2.4s.
- First browser run had one ambiguous test locator (`Role name` in collapsed/expanded editors). Fixed unique accessible permission names and visibility-aware role-name locator; reruns passed.
- Parent's full unit run initially exposed old navigation destination expectations; updated and focused navigation suite passed.

Visual inspection: mobile 390px board and desktop 1440px public page checked. Also browser overflow assertions at 390/768/1440. Fixed public CTA contrast discovered during visual QA; subsequent screenshot checked. Evidence `test-results/alliance-390-board.png` and `test-results/alliance-1440-public.png` (also other viewport captures). Scoped browser runner exited cleanly and cleaned its Vite/Chromium processes; no Docker resources used.

No known frontend gaps remain. PostgreSQL/service authorization and true server rollover are backend tests; fixture tests assert rendering/commands and refresh behavior, not real persistence. Parent owns final whole-repo validation.

Frontend worker is finished and has stopped source edits for coordinator verification.
