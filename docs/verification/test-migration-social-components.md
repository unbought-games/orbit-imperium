# Social and alliance component migration

## Delivery status

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`.
Owned branch: `emick/social-component-tests` in the managed
`social-component-tests/orbit-imperium` worktree. No push, PR, merge, shared
fixture/config/runner/package change, or changelog edit.

This remains a **partially validated migration**. The parent integrated the
production/component commit and ran its component suite serially. A separate
correction commit addresses the two explained fixture/test defects below. This
follow-up commit contains application-test consolidation only: **apply it after
the replacement suite passes, including both corrected cases**. No application
retirement is authorized by a pending or failed replacement result.

The candidate leaves 24 expanded application cases in these four files (eight
social, eleven alliance, two public recruitment entry, three alliance identity),
down from 38 immediately before consolidation. The expired-cursor case is
restored because the real screen's recovery live region was not covered by the
controller test. Unique route, session, actual polling, transport and unmatched
layout assertions remain in the application tests. No optional quarantine or
nonblocking migration is introduced.

Production behavior is preserved by extracting:

- `social/messages-view.tsx`: the existing workspace JSX and local message drafts.
  `social/screen.tsx` retains route selection, polling ownership, profile watches,
  and read acknowledgements. Rendering does not require an application session.
- `alliances/recruitment-directory-view.tsx`: existing directory controls/results;
  the route wrapper retains the query and real asynchronous directory hook.
- `alliances/sections.ts`: navigation derived from authoritative permissions,
  including the assignment-only manager and lost-membership cases.

The isolated scenarios use actual production components and controllers with
prepared in-memory external responses. They never bootstrap the application or
call its API. The fixture ports are not evidence of server authorization,
persistence, membership mutation or retention limits. Those belong to the real
controller/engine/database tests named below. Static renders cover content and
disabled markup only; focus, selection, scrolling, menus and layout remain real
browser assertions.

## Parent registrations

Add these imports and scenario entries to the parent's
`apps/web/tests/components/main.tsx`:

```tsx
import { SocialStory } from './social.story'
import { AllianceStory, RecruitStory } from './alliance.story'
import { RecruitmentStory, PublicRecruitmentStory } from './recruitment.story'

// In the existing scenarios record:
'social-workspace': SocialStory,
'alliance-panels': AllianceStory,
'alliance-recruit': RecruitStory,
'alliance-directory': RecruitmentStory,
'public-alliance-directory': PublicRecruitmentStory,
```

Committed files under `tests/components` are the three uniquely named stories
and their three `*.component.spec.ts` files only. Local `main.tsx`, `fixture.ts`,
`index.html`, `tsconfig.json`, root Playwright config, and component Vite config
were copied from the parent solely for validation and remain uncommitted.
A temporary local Vite cache directory was set to
`/tmp/orbit-social-vite-cache` after an optimizer-cache incident. Do not copy that
machine path into shared configuration. Parent integration should isolate Vite
cache locations across concurrently active worktrees.

## Replacement names

The following short IDs name exact test titles, not broad files:

| ID            | File and exact test title                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-scroll      | `components/social.component.spec.ts`: `background delivery preserves composer focus, selection, geometry and older-history anchor` (1440 and 390px)                |
| S-controls    | Same: `search, filters, message alignment, keyboard submission and menu focus use actual controls` (1440 and 390px)                                                 |
| S-states      | Same: `empty history, failed refresh, long Markdown and blocking preserve usable controls` (1440 and 390px)                                                         |
| S-retry       | Same: `uncertain submission locks edits and retries the original body before clearing its draft`                                                                    |
| S-contacts    | Same: `contact menus and one-way circular composer expose their resulting state` (390px)                                                                            |
| S-categories  | Same: `message categories share the heading and collapse into a keyboard-accessible mobile menu` (1440, 390 and 320px within the original keyboard/layout contract) |
| S-submit      | `social.spec.ts`: `submits a direct message from its deep link and returns to the conversation list at ${width}px` (1440 and 390px)                                 |
| A-board       | `components/alliance.component.spec.ts`: `notice form previews safe Markdown, publishes, pins, edits and changes pages`                                             |
| A-roles       | Same: `role form delegates permissions, member editor assigns multiple roles and leadership confirms transfer`                                                      |
| A-locked      | Same: `locked member role editor can cancel without submitting`                                                                                                     |
| A-draft       | Same: `saving an unrelated role retains an edited notice draft across unmount`                                                                                      |
| A-reading     | Same: `long pinned notice keeps selection, focus and scroll across parent updates` (390 and 1440px)                                                                 |
| A-settings    | Same: `recruitment form submits preferences and creates then disables a selectable invitation` (390 and 1440px)                                                     |
| A-affiliation | Same: `departed authors use current affiliation and roster overrides stale affiliation`                                                                             |
| A-recruit     | Same: `application form preserves rejected edits and recruitment mode changes its controls`                                                                         |
| A-create      | `alliances.spec.ts`: `creates an alliance from its route and returns to membership home`                                                                            |
| D-empty       | `components/recruitment.component.spec.ts`: `filters preserve input and focus when results become empty` (1440 and 390px)                                           |
| D-pages       | Same: `desktop pagination resets when language and recruiting filters combine` (1440px only)                                                                        |

Deterministic contracts used by the dispositions:

- `client-model/social.test.ts`: uncertain command identity, overlapping sequence
  merges, stale conversation completions, logout, read acknowledgements,
  incremental page draining, queued older requests behind successful/failed polls,
  and `a hidden conversation leaves the inbox but opening it again reads retained
history` (new).
- `features/social/presentation.test.ts`: preview/name search, unread filters,
  sorting and calendar-day grouping. `contact-options.test.ts`: available contact
  actions. `messages-view.test.ts` (new): initial versus background loading,
  retained content/error/retry, blocked explanation without composer.
- `client-model/alliances.test.ts`: revoked authority, immutable retries, corrected
  conflicts, unrelated draft invalidation and cursor recovery. New:
  `publishing replaces the board with the authoritative page instead of appending
to stale notices`; cursor recovery now also checks its precise notice text.
- `features/alliances/recruit.test.ts` (new): own/other membership, pending and
  application-limit states, closed/open recruitment, unresolved-command disabled
  fields. `sections.test.ts` (new): transfer removes management sections,
  assignment-only authority, absent roles and lost membership.
- `client-model/alliance-directory.test.ts`: older-response suppression,
  retained results through reloading/error, combined filters and pagination.
  `features/alliances/markdown.test.ts`: unsafe HTML/images/protocols.
- Existing real retention enforcement:
  `crates/engine/src/alliances/tests.rs::noticeboard_rolls_oldest_unpinned_and_enforces_five_pins`
  and `crates/storage-postgres/tests/alliances.rs::board_is_bounded_pin_races_and_revision_bound_pages`.
  These Rust tests were inspected but not rerun in this child chat.

## Every original expanded scenario

There were 38 cases at the base revision (15 social, 16 alliance, four
recruitment, three alliance identity). Each viewport/action expansion is listed
separately. **Candidate removal** below means this consolidation commit deletes
that original only after the parent passes its replacement suite. Retained cases
remain executable; every residual assertion that prevented removal is stated.
The 38 original identities remain listed even when their final test name changes.

| Original case                                                                                                          | Disposition and replacement                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| social: conversation action announces unread state and clears it after reading                                         | Retain app: uniquely connects route selection with `useReadPosition` and the inbox accessible name. Controller unread permutations remain deterministic.                                                                                                                                                                                                  |
| social: conversation paging, safe Markdown, uncertain send retry and blocking                                          | Candidate removal: S-scroll, S-states, S-retry and contact-options/Markdown units. Preserve the original query limit of 50 in the new application polling case; S-submit retains real send transport. Blocked-contact action exclusion is an exact contact-options unit assertion.                                                                        |
| social: mobile friends and one-way circulars                                                                           | Retain app: mobile friend entry selects the actual route, the circular command goes through the real adapter, and the original absence of reply-all and full-document overflow assertions remain. S-contacts covers local controls but does not replace all of these wiring assertions.                                                                   |
| social: new messages arrive incrementally and hiding preserves history                                                 | Retain app for the hidden-conversation deep link; incremental ordering and preserved data also have deterministic coverage. This case can later be shortened to the route contract.                                                                                                                                                                       |
| social: history polling preserves layout, scroll and composer at 1440px                                                | Candidate removal: S-scroll 1440px covers exact geometry, focus, selection, follow-bottom and prepend anchoring. New application polls message history at five seconds without replacing the loaded thread preserves initial loading, 4999/5000ms cadence, no background loading replacement and pagination availability through the actual polling hook. |
| social: history polling preserves layout, scroll and composer at 390px                                                 | Candidate removal: S-scroll 390px retains responsive geometry and native editing assertions. The same real polling-hook cadence is checked once in the new application polling case; no viewport-specific timer behavior is assumed.                                                                                                                      |
| social: empty history stays loaded during polling and displays the first incoming message                              | Retain app: the original compares empty-thread composer bounding boxes during an actual held poll. S-states covers focus/content but does not duplicate that empty-layout equality assertion.                                                                                                                                                             |
| social: initial and background history errors remain visible and Refresh retries                                       | Retain app: the real Refresh control and polling lifecycle are distinct event wiring from S-states Retry messages control. Preserve all original error, content, focus, enabled and loading assertions.                                                                                                                                                   |
| social: chat layout, search and composer at 1440px                                                                     | Candidate removal: S-controls 1440px, S-contacts and presentation units. Move Send button in-viewport and full-document overflow assertions to S-submit at 1440px; command transport and return navigation remain there.                                                                                                                                  |
| social: chat layout, search and composer at 390px                                                                      | Candidate removal: S-controls 390px, S-contacts and retained mobile friends app case. S-submit now runs at 390px too, preserving Send button in-viewport and full-document overflow in the actual mobile shell.                                                                                                                                           |
| social: empty, error, blocked and long-message states at 1440px                                                        | Candidate removal: S-states 1440px retains retry, empty, long Markdown, inner history overflow and blocked-composer assertions. S-submit retains whole-document bounds in the real shell.                                                                                                                                                                 |
| social: empty, error, blocked and long-message states at 390px                                                         | Candidate removal: S-states 390px plus the mobile S-submit document-bound assertion and messages-view static state tests.                                                                                                                                                                                                                                 |
| social: message categories share the heading and collapse into a keyboard-accessible mobile menu                       | Candidate removal: S-categories preserves the original heading alignment, keyboard selection, Escape focus return, 320px bounds and search-icon hit target assertions.                                                                                                                                                                                    |
| social: background message poll accepts older history and preserves edits at 1440px                                    | Candidate removal: S-scroll 1440px and deterministic queued-poll tests preserve single older-request dispatch, busy pagination, anchor position and editing through controlled completion ordering.                                                                                                                                                       |
| social: background message poll accepts older history and preserves edits at 390px                                     | Candidate removal: S-scroll 390px plus the same deterministic queued-poll tests. Actual timer wiring stays in the single application polling case.                                                                                                                                                                                                        |
| alliances: discovery applications preserve rejected drafts, withdraw and create an alliance                            | Retain app unchanged: discover/create links, create-route reload, withdrawal, returned application/home state, and distinct identities after definitive rejection are not all asserted by the isolated controls. A-create remains the short representative membership route journey.                                                                      |
| alliances: leader accepts recruits, edits delegated roles, assigns multiple roles and transfers leadership             | Candidate removal: A-roles preserves form payloads, role renaming, multiple assignment, transfer review and post-transfer controls. sections.test.ts preserves exact disappearing management destinations; server tests remain the authority boundary.                                                                                                    |
| alliances: noticeboard renders safely, creates, pins, edits and loads a stable older page with responsive layouts      | Candidate removal: A-board retains publish/pin/edit payloads, preview refresh and older/newer page replacement. A-reading covers long board bounds at 390/1440px; noticeboard controls fit the intermediate 768px viewport retains the intermediate-width assertion.                                                                                      |
| alliances: open and closed recruitment and existing membership drive the available controls                            | Retain app unchanged: public-profile reload, Join completion, self-alliance selection from discovery and hidden Create link are real route/membership wiring that A-recruit and static state permutations do not fully replace.                                                                                                                           |
| alliances: lost membership clears private board, roster and administration after an access-denied reload               | Retain app: reload/access-loss wiring; model tests independently prove private state and draft clearing.                                                                                                                                                                                                                                                  |
| alliances: notice rolloff comes from refreshed server pages and retains pinned notices                                 | Removed after deterministic replacement passed: new authoritative-page controller test. The original's 100-post limit assertions only tested its own mock server. Real engine/PostgreSQL retention tests named above own that invariant; A-board retains real DOM page replacement.                                                                       |
| alliances: uncertain command retry reuses identity and does not send an edited duplicate                               | Retain app unchanged: non-welcome Retry last command invokes the real completion route, disables the application controls and removes the pending retry control. Welcome retry cases cover a separate entry branch.                                                                                                                                       |
| alliances: departed notice authors use authorized current profile tags while roster membership overrides stale tags    | Retain app unchanged: real profile observation delivery and anchor-trigger dossier behavior across desktop/mobile are not replaced by A-affiliation prepared observations and non-UUID button triggers. No shared profile component changes.                                                                                                              |
| alliances: a delegated manager can dismiss a locked member role editor without submitting                              | Candidate removal: A-locked preserves the authority explanation, disabled save, enabled/clickable cancellation, returned assignment control and absence of submitted commands.                                                                                                                                                                            |
| alliances: expired noticeboard cursors recover to fresh notices                                                        | Restored original app case: controller tests prove cursor recovery state but do not mount screen.tsx recovery live-region markup. AllianceStory duplicates that status wrapper, and its expired preparation is unused. Preserve the real screen status, fresh heading and retry query assertions.                                                         |
| alliances: saving an unrelated role retains an edited notice draft                                                     | Candidate removal only after the corrected A-draft passes: real draft hook and form unmount/remount retain both edited fields. First integrated run failed before filling due to ambiguous label lookup; the correction and one-repair budget are recorded below.                                                                                         |
| alliances: alliance reading at 390px / long pinned notices preserve reading, selection and focus through live updates  | Retain mobile app case unchanged: actual overview refresh, selected passage, focused-link scroll position, mobile viewport-height change, visible pagination and navigation to the public alliance page. The component proves rendering preservation but not game-session refresh wiring.                                                                 |
| alliances: alliance reading at 1440px / long pinned notices preserve reading, selection and focus through live updates | Candidate removal: A-reading 1440px preserves desktop selection, focus, scroll, viewport resize and pagination bounds. Retained 390px app case covers the shared overview-refresh and real public-link route contracts once.                                                                                                                              |
| alliances: alliance search combines language and recruiting filters and keeps compact controls at 1440px               | Retain app unchanged: authenticated filter reset, checked state, badge counts, loaded empty pagination removal and actual query transport are not all present in D-pages/D-empty. The previously deleted mobile combined-filter journey stays deleted.                                                                                                    |
| alliances: welcome Join retry returns to alliance home with the original command                                       | Retain app: successful retry must invoke route completion, not only the command controller.                                                                                                                                                                                                                                                               |
| alliances: welcome Apply retry returns to alliance home with the original command                                      | Retain app: application completion has a distinct resulting home state.                                                                                                                                                                                                                                                                                   |
| recruitment 1440px: public discovery filters are usable and no-result states preserve the search controls              | Consolidate: retain public directory loads alliance links without overflowing at 1440px for real public-route response and populated-row bounds. D-empty 1440px owns filter changes, retained input and empty-state bounds.                                                                                                                               |
| recruitment 390px: public discovery filters are usable and no-result states preserve the search controls               | Consolidate only after corrected D-empty 390px passes: retain public directory loads alliance links without overflowing at 390px for real public-route response and populated-row bounds. The component owns filters/empty states; its first diagnostic-output overflow defect is recorded below.                                                         |
| recruitment 1440px: recruitment managers opt into discovery and create or disable a reusable invitation                | Candidate removal: A-settings 1440px preserves preference values, three-command sequence, selected invitation URL, confirmation, disable result and document overflow.                                                                                                                                                                                    |
| recruitment 390px: recruitment managers opt into discovery and create or disable a reusable invitation                 | Candidate removal: A-settings 390px preserves the same form and command payload assertions at phone width. Command authorization/persistence belongs to the server, not either fixture.                                                                                                                                                                   |
| alliance-identity: reports show historical alliance tags even when current player profiles have changed                | Retain app: report-context and live-profile wiring. Shared profile/report components belong to other chats.                                                                                                                                                                                                                                               |
| alliance-identity: legacy reports and redacted shares never fill affiliation from live profiles                        | Retain app: redacted shared route has no alliance links; its name overstates legacy-report coverage, and this migration does not invent missing historical evidence.                                                                                                                                                                                      |
| alliance-identity: identity-included public shares retain historical alliance links without loading a game session     | Retain app: public route stays session-free and makes exactly one API request.                                                                                                                                                                                                                                                                            |

## History and failure record

Read the parent test-design skill, browser contracts, failure classification,
testing strategy and repair ledger before migration. Relevant history includes
`6292946b` (response-aware fixture navigation), `c9538cdc` (discovery UX),
`ee94ec6c` (background interaction preservation), and `d128d349` (chat design).
The ledger records the consumed readiness repair for the open/closed recruitment
case. The removed public-recruitment auth journey and removed mobile combined
filter journey are not recreated here. No current failing assertion was repaired
by moving or renaming its scenario.

Local browser attempt 1 used the parent's copied harness and a shared
`node_modules` symlink. Two tests failed at the component-ready marker before
any feature interaction. A separate read-only browser diagnostic observed three
`504 (Outdated Optimize Dep)` responses and an empty body. This is confirmed
Vite optimizer infrastructure failure; no feature assertion repair consumed.
JSON evidence was preserved at `/tmp/social-components-initial-infrastructure.json`.

Attempt 2 used a task-local temporary Vite cache. It was interrupted at the first
mount by the parent's host-contention coordination request (one interrupted,
18 not run). It did **not** establish that the cache workaround fixed mounting.
Evidence is `/tmp/social-components-interrupted.json` and the worktree's
`test-results/components/` trace/failure capture. The blank failure capture is
not visual validation. Do not classify this interrupted run as a passing retry
or as proof of a second test defect.

## Validation and remaining owner work

All commands ran against the base SHA plus this worktree's uncommitted changes;
no CI revision or merge queue was involved. Node 24.18 was used for the focused
unit and lint work after the parent's coordination message. Early browser and
initial typecheck used the shell's default runtime; final parent validation must
use `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

Passed, serially:

- Eight focused Vitest files, 42 tests, 5.98s runner (before presentation file
  separation); one worker.
- After separation and the hidden-history regression: messages-view/social,
  16 tests, 0.911s runner; one worker.
- Navigation authority extraction: sections, three tests, 0.168s runner.
- Exact cursor recovery notice assertion: alliances, ten tests, 0.209s runner.
- Scoped source ESLint, Prettier checks, and `git diff --check`.

These are 46 distinct passing unit cases, not the sum of overlapping reruns.
Setup and runner-wait phases were not separately instrumented. The first Vite
startup reported 0.923s and task-local restart 2.094s; complete browser preparation
and contention wait are unavailable. All child-owned Vite, browser and full
TypeScript processes were stopped. Nothing was pushed or enqueued; merge delay
is not applicable.

Initial TypeScript found a remaining `model` reference during directory view
extraction; it was corrected to `authenticated`. The next typecheck was cancelled
on parent request, and later file separation/helper moves have **not** had a
completed full typecheck. Scoped lint is not a substitute for that check.

Parent owns the serial validation window and remaining integration:

1. Register the five scenarios above; run the three component specs with one
   worker, current parent runner and isolated optimizer cache.
2. Run source and component TypeScript checks. Re-run affected units only if
   further corrections change their behavior.
3. Run the two new short app journeys and retained route/reload cases against
   the parent's final shared fixture and exact integrated revision.
4. Capture and inspect final chat, directory, notice, role and recruitment states
   at desktop/mobile sizes. The new component specs write labelled captures for
   chat, directory empty state, notice reading and recruitment settings when run;
   no successful capture exists yet. Display final images in the originating
   implementation chat before any UI PR can be enqueued or merged.
5. Resolve each explicit residual contract note in the inventory, then retire
   only originals whose replacements passed. This commit intentionally leaves
   those original scenarios enabled while validation is paused.

## Integrated component failure diagnosis and first corrections

Parent's serial integration run completed with 257 passed and 15 failed overall
(4.8 minutes); that aggregate includes unrelated owners. Within this scope,
all nine social cases passed, ten of eleven alliance cases passed, and two of
three directory cases passed. Read-only evidence: `/tmp/orbit-components-integrated.log`
and the parent worktree's `test-results/test-strategy/components-integrated/`.
The parent owns the exact integrated tree record; its current HEAD when inspected
was `93cc09fea72b4f1f32c2864bef4dea3a1147ebfe`, with integrated working-tree changes.
Do not treat that HEAD alone as an exact description of all tested source.

- `saving an unrelated role retains an edited notice draft across unmount` failed
  at its first fill: `getByLabel('Notice title', { exact: true })` resolved to the
  new-notice input and the hidden edit-notice input with value `Welcome aboard`.
  This was a migration locator defect, before any persistence assertion. The
  original app case uses accessible textbox-role locators, which exclude the
  closed details editor. Its one correction restores that same semantic locator
  for both draft fields, scoped to the form containing Publish notice, on entry and after remount. No ordinal, timeout, retry or
  assertion change. Audited the other notice label callers: A-board explicitly
  selects the new editor or scopes edits to its article; they did not have this
  ambiguous locator. No previous repair of this newly introduced locator defect
  exists in the source history or repair ledger inspected here.
- `directory controls 390px / filters preserve input and focus when results become
empty` failed the root overflow assertion. The failure PNG visibly shows the
  test story's unbroken JSON diagnostic line extending beyond the viewport;
  production directory controls fit above it. The one fixture correction makes
  that output wrap anywhere. The root overflow assertion remains unchanged.
  Audit found the same raw JSON-output pattern in RecruitStory; its diagnostic
  output receives the same wrapping rule. No production CSS, hidden overflow,
  screen width, timeout or assertion is changed. This also does not recreate the
  historically removed mobile combined-filter journey.

These corrections are prepared in a separate commit from application retirement.
No browser/build/typecheck was started by this child. Parent must run each
corrected failing case once and inspect the results; this is not a green result
or permission to rerun repeatedly. If either defective test fails again after
this correction, follow the existing one-repair disposition rule, retaining
its useful deterministic coverage and its original app protection until the
coverage decision is explicit.

The same pre-validation correction commit audits all three owned component specs
and replaces every direct `page.screenshot` call with the existing
`diagnosticScreenshot` helper. Capture is inactive unless
`ORBIT_TEST_SCREENSHOTS=1`; geometry, focus, selection, overflow and form
assertions stay unconditional. No screenshot-specific preparatory interaction was
found: font readiness and scrolling in the notice test serve its actual reading
and viewport assertions. This is a capture-policy correction, not a second
stabilization or a replacement for the recorded failure diagnostics.

## Separate application consolidation candidate

Prepared on top of the component-correction commit, with no production,
component, shared fixture, runner, configuration or package changes. The parent
will apply these removals only after the named replacement cases pass. The
retirement diff is deliberately conservative where the isolated test does not
exercise the original owner: public-route bootstrap, profile observation wiring,
normal/welcome retry completion, private-data reload, Refresh event wiring and
actual timer registration remain in application tests.

The new polling case is the original cadence assertion extracted from the
1440px layout journey, not a recreated retired failure. It retains the precise
4999/5000ms boundary and the original 50-message query bound. Completion is
response-gated before subsequent assertions; gate release is guaranteed on
failure. All geometry/selection/scroll permutations stay in S-scroll. Both
representative Send app viewport cases retain the previously unmatched
in-viewport Send button and whole-document overflow assertions.

Static review checked all 38 original rows against actual remaining test bodies.
Twenty-four application expansions remain: social 8, alliances 11, recruitment
2, alliance identity 3. Relative to the 38-case pre-consolidation application
suite, this removes 14 net cases while restoring the expired-cursor case and
preserving unmatched assertions. No test was skipped, quarantined, rescheduled,
or given another timeout/retry. No application browser, build or TypeScript run
was launched in this child; the parent owns validation of this exact candidate.
Formatting is applied to changed social/recruitment specs and the ledger; the
alliance file preserves existing formatting around untouched cases to keep the
restoration/removal diff reviewable. `git diff --check` is the local structural
verification, not a claim of runtime success.


## Integrated verification

The parent integrated this group and completed serial validation. See the
[combined verification record](test-strategy-overhaul.md) for final inventory,
passing runs, repairs, retained failures, visual evidence and cleanup. Earlier
“pending parent validation” entries above describe the historical handoff.
