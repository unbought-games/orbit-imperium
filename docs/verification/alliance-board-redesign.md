# Alliance board redesign — 2026-11-10

Base revision: `28809f92`, plus the uncommitted board/header implementation in
this checkout. No PR, CI run, or deployment was requested.

## Behavior

- Always-visible composer; title and body are individually optional. Server
  deserialization defaults either omitted field to an empty string, with the
  normal engine policy rejecting a notice whose title and body are both blank.
- The existing Markdown security and length limits remain enforced. Preview was
  removed as requested; renderer safety remains covered by the Markdown unit
  tests and server content-policy tests.
- Notice content comes first, metadata/insignia below, and the action menu at the
  top right. Edit replaces the notice with an editor, retaining failed drafts.
  Cancel discards the edit draft. Delete retains a confirmation dialog.
- Existing pinned-first, newest-first ordering is unchanged in the server.
  Older-page reads append server-projected posts to the authoritative store.
  Cursor expiry restarts from the newest page rather than mixing revisions.
- Only post-command refreshes and older-page reads retain the board while the
  request is in flight. Other alliance forms retain their existing lifecycle.

## Checks

- `npm test -- src/client-model/alliances.test.ts src/features/alliances/markdown.test.ts`:
  13 passed; latest run 210ms. Covers append, concurrent-load rejection,
  expired-cursor replacement, transient failure retention, access-loss clearing,
  existing command identity and safe Markdown rendering.
- `npm run test:components -- alliance.component.spec.ts --workers=1`:
  11 passed; bundle preparation 7,830ms, suite 8.4s. Exercises open composer,
  empty rejection, body-only creation, title-only edit, failed-edit retention,
  menu pin/edit/delete, cancel/focus, append, role forms, drafts and reading
  stability at mobile/desktop widths.
- `npm run test:ui -- alliances.spec.ts --workers=1`: 11 passed;
  bundle preparation 4,927ms, suite 14.9s. Retained route wiring, privacy,
  uncertain-command retry, draft, reading and expired-cursor live-region checks.
- Focused Make server invocation:
  `CARGO_TARGET_DIR=/Users/ethan/unbought/orbit-imperium/target make _server SERVER_TESTS="cargo nextest run -p orbit-engine -p orbit-application --lib -E 'test(alliances::)'" BRIDGE_TESTS=true DB_TESTS=true`:
  28 alliance engine/application tests passed; compilation 38.11s, execution
  0.048s. Unrelated server/bridge/database suites were not selected. New tests
  cover optional create/edit content, omitted JSON fields, blank rejection and
  atomic rejection; existing authorization, size, Markdown, pins and cursor
  tests remain intact.
- Component and application TypeScript checks, focused ESLint, Prettier,
  `cargo fmt --all --check`, contract drift/schema checks and `git diff --check`.

## Failures and corrections

The first component run passed 10 and failed one role-editor case (13,778ms
preparation, 30.8s suite). Keeping every alliance form mounted introduced two
visible role-name fields where the established flow previously remounted the
form. The implementation was narrowed to post refreshes and older-page reads;
the original role test passed unchanged on the affected-suite rerun. This was a
product scope regression, not a test repair or a passing retry without a fix.

An initial TypeScript check caught an inaccurately typed form-change event;
`useAllianceDraft` now accepts the actual React FormEvent and still narrows the
edited control before retaining values. Formatting findings were corrected.
An initial focused Make invocation had a shell quoting error and stopped before
running tests; the corrected invocation above completed. No tests were deleted,
retried for luck, or given larger timeouts.

## Running implementation

The existing local development checkout serves the preview at port 55398.
Task-owned development processes were restarted after compiling the changed
backend; the retained local playground database was preserved. Live browser
checks published body-only and title-only notices, verified them after reload,
pinned the older sample above newer notices, edited/saved content, opened the
menu and cancelled editing. The owner's existing `hello` and `nice` examples
were retained. The free Starwing insignia was saved and equipped for the local
`user` account and is visible in the author footer.

Inspected captures in the originating chat cover the board, menu, and editing
states at 1179×1314 and 390×844. The browser viewport was restored afterward.
The development server remains running for owner review. Test runners and their
temporary bundle servers exited normally. No hosted runner or merge-queue wait
applies; no production build or database suite was run for this change.
