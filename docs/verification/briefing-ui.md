# Briefing UI validation — November 4, 2026

Base revision: `611d7c156c612a38ef778eb35bc19536ff19dbc7` with the uncommitted changes in this checkout.
SHA-256 of sorted changed `apps/web/` paths and contents (each path and content NUL-delimited): `93b5b6182a9c61e430ab58517fb23881b724fa12fe58daefaf4c1eb3e3ee7fdd`.

## Delivered behavior

- Beginner presentation opens an advisor briefing, with one recommendation and links to the ordinary action screen and full Briefing page.
- Routine operations remain in a collapsed disclosure. Incoming attacks remain outside it. Completed/full-interface accounts retain the operations inbox.
- Briefing owns chapters and receipts; Empire links to it. Existing opening anchors redirect to the new route. Sidebar, mobile menu and guidance links expose the route.
- Beginner dock shows Briefing instead of unused fleet slots. Desktop content reserves dock space from 1024px upward.
- Navigation closes the native dialog before route focus runs; ordinary dismissal retains its exit animation.
- “Show full interface” remains hidden. Player naming of the advisor is a future idea, not implemented here.

## Checks and failure record

1. Focused client tests: 24 passed in 0.798s (tutorial model, route resolution, navigation model). TypeScript and ESLint passed.
2. First browser run: module preparation 1.917s, runner 18.3s. Four passed; two new desktop/mobile navigation checks failed because route-heading focus ran while the exiting dialog still made the page inert. Fixed the navigation close path; retained both assertions.
3. Broader browser run: module preparation 1.857s, runner approximately 60s. 51 passed; four failed. Both new focus checks passed. Three existing HUD assertions predated the branch’s mobile in-flow dock: the 768px case expected a 92px desktop Orb, the entrance-animation test hardcoded a 37px center rather than the rendered 22px center, and a touch-scroll test captured scroll before Playwright scrolled the dock into view. The fourth failure was the existing tutorial test’s now-ambiguous Briefing link after the sidebar gained the same label.
4. One repair for each: check the correct layout branch at 768px while retaining bounds/focus checks; derive animation center from actual dimensions; open by keyboard with prevent-scroll focus to exercise a nonzero frozen scroll; scope the navigation assertion to Opening guidance. Audited HUD geometry/scroll callers and changed no timeouts, retries, or negative/race scenarios. Git history and available verification records were inspected; no separate Test Czar ledger exists in this checkout.
5. Focused affected browser run: module preparation 1.835s, runner 18.0s, all 13 passed. The other 42 tests from the broader run were not rerun. No tests deleted or assertions weakened.
6. Final changed-source Prettier check, TypeScript, ESLint, and diff whitespace checks passed.

Runner timings include browser scheduling; scheduling wait and cleanup durations were not separately instrumented. No CI, push, merge, or queue wait. Fixture Vite servers and browsers were cleaned up by the existing test runner. The requested dev server and database remain running.

## Visual validation

Inspected the actual running account on desktop 1440×900 and mobile 390×844: overview invitation, dedicated Briefing, collapsed advisor panel and expanded operations. Verified the page link, disclosure, and modal navigation without issuing gameplay orders. Images are delivered in the implementation chat, not hosted for a PR. Browser layout tests also cover the previous collision range at 1100px and HUD sizes 768, 1024, 1440, 2560 and 3440px.

The local account remains at zero building/research levels, no ships and no queues. Resources have only accrued normal production; no grants or progression were injected.

## Follow-up: Briefing selection and planet path

Briefing now maps to the mobile Menu anchor instead of Empire, leaving only Briefing selected in the desktop sidebar. Its canonical URL is `/u/$universe/b/$body/briefing`; the former query-based address is normalized by the existing shell. Messages, Alliance, High Scores, Settings and Combat Simulator still generate body queries; those existing migration gaps were reported to the owner.

Tested against the same base revision with changed-source SHA-256 `eaad7dcbb9705f9c2fbfa87c5f5a15615beda2f89ebdbe00b8ba56c998ae52be`. Router/navigation/domain checks: 21 passed in 2.79s. All six tutorial browser cases passed (preparation 2.140s, runner 13.7s), including canonical links, legacy URL normalization and separate desktop/mobile active navigation. TypeScript, ESLint, formatting and diff whitespace checks passed. No failures or retries. Browser fixtures cleaned up normally; local development remains running. Runner wait and cleanup were not separately instrumented; no CI or merge wait.

Verified the running local account's canonical URL and single active sidebar destination using DOM/accessibility inspection. Per the owner's explicit “No more screenshots” instruction, no new screenshots were captured or delivered, and fresh pixel-level visual validation was omitted for this follow-up.

## Follow-up: overview link cleanup

Removed the redundant Opening guidance bar from Empire overview, including the plain Briefing link shown by the owner. The sidebar now also has a ClipboardList icon for Briefing. Desktop/mobile existing navigation tests assert the overview has no guidance bar; both passed (preparation 2.043s, runner 10.7s). Focused ESLint, Prettier and whitespace checks passed, with no failures or retries. Browser fixtures cleaned up normally; dev environment retained. Wait and cleanup were not separately timed. Verified the live overview has zero guidance bars and still has its sidebar Briefing link through DOM inspection. No screenshots or pixel review, per owner instruction. Base revision unchanged; changed-source SHA-256: `013ba2aaf024133f95a7e3e9440b24b1a4d6cd468b386de6a1db1e5409c816f2`.

## Retained scope — November 5, 2026

Restored the non-orb onboarding UI and five-page URL migration from `f5cfeb66`. Kept the Briefing sidebar icon, standalone page, single active destination, hidden Show full interface control, and removed overview guidance bar. Restored command controls, inbox, panel, HUD styles and the original desktop gutter breakpoint exactly from `611d7c15`. HUD message URLs retain the separate routing fix. Removed the advisor study page and dead HUD-only BriefingSummary, styles and selector. The completed visual experiments remain safely parked on `emick/park-onboarding-advisor-experiments` at `37888950`; none are in this checkout.

Removed the obsolete beginner-HUD selector unit case because its implementation was removed. Replaced the experimental orb-to-Briefing browser flow with checks for ordinary Briefing navigation, no Show full interface, and the original operations HUD. Kept the prior useful mobile geometry/focus repairs; restored the gutter assertion to the original 1440px breakpoint.

Validation: 19 focused unit checks passed in 3.05s; all 11 affected tutorial/HUD browser checks passed (module preparation 2.073s; runner 19.8s). TypeScript, ESLint, changed-source formatting and whitespace checks passed. No test failures or retries. Browser scheduling and cleanup were not separately instrumented; fixture processes exited through the existing runner cleanup. No CI or merge wait. The existing local development environment remains running; no gameplay actions or account resets. Running desktop DOM inspection confirmed the Briefing route, sidebar entry, absent Show full interface, and original Open command HUD control. Desktop/mobile behavior is covered by fixtures; no new screenshots or pixel inspection, per owner instruction.

Tested base: `f5cfeb66`; sorted changed `apps/web/` path/content SHA-256 (NUL-separated, deleted files represented as `<deleted>`): `79a0ee58c3974e01321d518ec1a5b075d72c9c8be9270ed266dcda832039e882`.

## Opening navigation disclosure — 2026-11-05

Validated the working tree based on `ca74a357` with the More-navigation changes
in `features/tutorial/model.ts`, `tutorial.tsx`, `shell/navigation.tsx`, their
styles, and focused tests. Messages, Reports, Fleets/Dispatch, and Facilities
start in a collapsed More disclosure. Facilities moves into Develop at its
first authored construction priority or with existing facility work; ships,
shipyards and operations reveal fleet navigation, and operations/reports reveal
Reports. Messages remains in More until beginner presentation ends. Empty
navigation groups are omitted. Deferred pages retain their canonical links and
active destination; they do not select Develop while in More.

Validation:

- Focused model/navigation tests: 13 passed, 0.837s runner (1.575s command wall).
- Browser fixtures at 1100×900 and 390×900: 4 passed in 8.1s, with 1.872s module
  preparation. Covers keyboard disclosure, Messages loading, Facilities active
  state, progress promotion, and existing Briefing/original-HUD behavior.
- First browser attempt: both new viewport cases failed on an ambiguous Messages
  heading (page h1 and feature h2). Inspected failure DOM, file history and local
  repair records; no separate Test Czar ledger was available. One repair scopes
  the assertion to heading level 1 and gates Facilities navigation on its options
  response before advancing the fixture. Audited matching Messages-heading
  selectors; only this new caller used the ambiguous pattern. No timeout,
  retry, or assertion weakening. Rerun passed. Initial preparation was 2.208s;
  failing cases each ran 2.2s. No tests were removed.
- Live local app: desktop 1656px and mobile 390×844 DOM/interaction inspection,
  message access, automatic More expansion on its active destinations, collapsed
  opening navigation, and no horizontal overflow. Mobile links measured 44px
  tall. Restored viewport and left Briefing open. No gameplay orders or grants.
- No screenshots or fresh pixel review, following the user's explicit override.
  DOM checks do not establish visual quality.

No CI, queue, push or merge. Fixture runner cleaned up its server; existing local
world remains running. Runner scheduling was not independently instrumented.

## Rebase onto main — 2026-11-05

Rebased onto `2d6f226a` on `emick/onboarding-navigation`. The recovery branch
`emick/onboarding-before-main-rebase` preserves the prior work. The routing
migration commit was skipped because main already includes it as `e8a96d81`.

The user cancelled the attempted mobile orb anchoring change. Its implementation
and two new fixture cases were removed; their interrupted run had seven passes
and two failed fixture response assertions (2.038s preparation, 8.8s runner).
No further work was done on that cancelled behavior. The orb surface, styles,
shell placement/spacing and command-HUD browser tests now use main's version.
Existing NPC fleet/report integration from the onboarding feature is retained.
Main's mobile Menu page replaces the old dialog; Briefing and the opening More
links were carried into that page. Desktop More is retained.

Conflict resolution preserves main's additional schemas, profile/history test
coverage and menu behavior. An intermediate resolution accidentally truncated
several conflicted files: Rust parsing and browser configuration loading caught
this before validation. Restored complete source from the respective branches,
retained main's deleted-test decisions, and reapplied the narrow tutorial world
fixture routing changes. No test assertion or timeout was weakened.

Validation of the resolved sources (based on `f18a487f`, committed with this note):

- 55 focused unit cases passed in 2.16s.
- 9 browser cases passed in 10.2s after 1.868s module preparation: main's five HUD
  viewport cases and Briefing/More navigation at desktop and mobile sizes.
  Initial browser configuration preparation failed before any test ran (2.392s).
- TypeScript, full frontend lint/format, generated-contract/schema checks,
  workspace/all-target Rust check and Rust formatting passed. The corrected Rust
  check took 2.46s; the development server build took 36.02s.
- Live mobile DOM/interaction inspection confirmed main's menu route, optional
  More links and floating orb. The existing account still has 0/27 achievements.
  No screenshots or fresh pixel review, per the user's instruction.

Main had published migrations 35 and 36, colliding with the unpublished tutorial
branch. Renumbered only the branch migrations to 37–40. Backed up the local
worktree database to `/tmp/orbit-before-main-rebase.sql`, stopped its server,
verified every existing tutorial migration checksum, and renumbered those four
history entries. The first startup correctly rejected the missing earlier main
migrations; applied main's exact SQL for 35/36 transactionally with recorded
checksums, then startup passed. Gameplay data was preserved; no grants or orders.
The rebuilt local server is running at the existing port. No CI/queue/push/merge.

## Encapsulated Metal Mine guidance — 2026-11-05

Tested working tree based on `dc6f580f`: removed the shell-wide GuidanceBar and
its unused CSS; retained sidebar/menu Briefing access and placed receipt notices
on Briefing. Added tutorial-owned lesson rules/copy, scoped browser visit history
and a nonmodal speech bubble, integrated once through the command HUD's generic
orb trigger props. No catalog page contains tutorial code. No account grants or
orders. First visit opens automatically; click or Escape dismisses; click reopens;
reload/revisit retains presentation history. Leaving the page restores the HUD.

13 focused unit cases passed (1.39s). Four existing browser cases passed for
Briefing navigation and guidance error recovery. Two new desktop/mobile cases
initially exposed focus restoration to the disappearing Command uplink button
(3.406s preparation, 14.6s runner for the six-case attempt). Inspected failure DOM,
HUD history and prior local verification records; no separate Test Czar ledger
was available. One implementation repair focuses the persistent orb before the
native dialog opens; both cases passed (1.836s preparation, 3.8s runner).
Live keyboard inspection then found that Escape from inside the speech bubble
left focus on the document body. Enabled FloatingFocusManager's existing return
focus behavior and added that assertion to both cases; they passed (1.773s
preparation, 4.0s runner). No assertion weakening or timeout changes.

TypeScript, focused ESLint, changed-source Prettier and whitespace checks passed.
Live DOM/interaction inspection at 390×844 and 1440×900 confirmed speech bounds,
no horizontal overflow, and keyboard focus restoration. Fixture checks confirm
stable orb identity and position, reload behavior, access to Command uplink,
absence of the repeated page strip, and no gameplay commands. No screenshots or
fresh pixel review, following the owner's override. Browser override reset;
Metal Mine explanation left open. Fixture server cleaned up; local world stays
running. No CI, queue, push or merge; scheduling delay not independently measured.

## Compact progress and orb Briefing access — 2026-11-05

Working tree based on `3f5146d1`: the overview invitation now becomes a compact
step/next-action/remaining-count row after the first confirmed objective. Both
forms disappear when the briefing completes. Visits and submitted orders do not
count as accomplishments. Visibility/counts stay in the tutorial feature.
A shared tutorial link is available in the speech bubble and in the normal HUD;
the latter is a secondary Briefing button alongside Command uplink, supplied
through the HUD's generic heading-action slot. Neither orb position nor styling
changed. All links use the canonical body path.

14 unit cases passed (1.04s). Four desktop/mobile browser cases passed (2.509s
preparation, 15.1s execution), covering first accomplishment, compact bounds,
completion disappearance, both orb entry points, and existing speech behavior.
After moving Briefing into the title row, both affected overview/HUD cases passed
again (1.917s preparation, 11.3s execution), including secondary styling and
same-row geometry at 1440px and 390px. No failures or retries. TypeScript,
focused ESLint, changed-file formatting and whitespace checks passed. Live
mobile DOM inspection verified the new button beside the heading; fixture
progression was used instead of advancing the real starting account. No
screenshots/pixel review per user override. Local HUD left open; fixture servers
cleaned up. No CI, queue, push or merge; scheduling delay not separately measured.

## Remove reward history from Briefing — 2026-11-05

Removed the Automatic reward history section and its receipt shortcut. Old
history anchors now focus Briefing's main section; NPC report navigation says
Open briefing and uses its canonical route. Existing reward data and combat
record styling remain intact. Updated the existing completion browser check to
assert the history UI is absent while all 27 receipt records remain.
Working tree based on `3f5146d1`: both desktop/mobile cases passed (2.099s setup,
5.8s runner), with no failures. TypeScript, focused lint, formatting and whitespace
checks passed. Live DOM confirms the empty-history section is gone. No new
screenshots or pixel review per user override; no gameplay commands. Fixture
server cleaned up; the local game remains open. No CI, push or merge.

## Focused current-job card — 2026-11-05

Working tree based on `3f5146d1`: progression recommendations now use a tutorial
card with canonical catalog artwork, current objective title, one sentence from
catalog copy, and a right-aligned open action. Mobile places that action at the
lower right. Ready-to-review copy is omitted; actual blockers remain visible.
Rewards use larger canonical ResourceMark icons/amounts under Reward and omit
zero resources. NPC operation recommendations reuse the same reward rendering.
The progression card stays entirely within the tutorial feature.

Four existing browser cases passed at desktop/mobile widths (1.961s preparation,
11.0s runner), including later research/manufacturing navigation and additional
assertions for artwork, nonzero rewards, concise copy, bounds and right action
alignment. No failures. TypeScript, focused ESLint, formatting and whitespace
checks passed. Live DOM confirmed loaded artwork and no horizontal overflow at
390×844 and 1440×900. No screenshots or fresh pixel review per user override.
Viewport reset and Briefing left open. No gameplay orders, CI, push or merge;
fixture server cleaned up and local game remains running.

## Expandable chapter headings — 2026-11-05

Working tree based on `3f5146d1`: chapter disclosures now use the installed Base
UI Accordion primitive, with semantic h3 headings, full-row buttons, larger
editorial titles, hover/focus feedback and a right chevron that rotates down.
Multiple chapters can remain open. Height/opacity and chevron transitions are
explicit exceptions to the global no-animation rule and disable under reduced
motion. No stored game-derived state or page-specific tutorial rules were added.

Two focused browser cases passed at 1440×900 and 390×900 (1.958s preparation,
3.1s runner): keyboard opening/closing, independent panels, visible list counts,
chevron endpoints, transition settings, reduced motion and bounds. No failures.
TypeScript, focused lint, formatting and whitespace checks passed. Live DOM
inspection observed the open transition and mobile collapse, semantic headings,
18px mobile titles and no horizontal overflow. No screenshots or fresh pixel
review per user override. Viewport reset; Briefing left open with chapters closed.
No gameplay commands, CI, push or merge. Fixture server cleaned up.

## Header action, chapter sizing and screenshot review — 2026-11-05

The owner reinstated screenshot review and asked for explicit visual critique in
`.agents/skills/ui-design/SKILL.md`. That skill now requires capture/inspection of
final desktop/mobile states and assessment of alignment, sizing, hierarchy,
spacing, readability and clarity. Skill validation passed using the bundled
validator through `uv --with pyyaml`; the system Python lacked PyYAML initially.

Chapter numbers are now 20–24px; counts are regular-weight 13px and omit earned.
An initial mobile capture was incorrectly accepted with counts below titles;
following the owner's correction, all chapter elements stay on one row. Added
geometry assertions for this on both browser viewports. Actual final images were
inspected: readable number/title balance, secondary counts, aligned chevrons,
clear action hierarchy, and no clipped controls in the captured states.

Added a secondary Enter Full Experience action beside Briefing's title. Its
confirmation explains leaving beginner mode, retaining Briefing/rewards, and
natural interface disclosure during the tutorial. Cancel defaults to focus.
Confirm sends only the existing SetTutorialPresentation(false) action; the
shared confirmation primitive now accepts an explicit confirm button variant,
preserving destructive styling for existing callers. Eligibility/action logic
stays in `tutorial/experience-action.tsx`. Updated the subtitle exactly as
requested and removed the accomplishments/reward-automation line.

Working tree based on `3f5146d1`: four desktop/mobile browser checks passed
(1.889s preparation, 5.5s runner), covering single-row counts, keyboard/reduced
motion, confirmation/cancel, persisted preference, full navigation and unchanged
objective/receipt data. Earlier sizing-only run: 2 passed (1.969s preparation,
3.0s runner). TypeScript, focused ESLint, formatting and whitespace checks passed.
No test failures. The real account was not switched: cancelled both live dialogs.
No gameplay orders/grants. Fixture servers cleaned up; local game still running.

Final captures inspected and saved under the chat's visualization directory:

- `briefing-final-desktop-1440x1100.jpg`
- `briefing-final-mobile-390x1200.jpg`
- `full-experience-dialog-desktop-1440x1100.jpg`
- `full-experience-dialog-mobile-390x844.jpg`

Viewport reset; Briefing left open. No CI, queue, push or merge.

## Consistent job titles, descriptions and rewards — 2026-11-05

Working tree based on `3f5146d1`: chapter objectives now have separate semantic
job headings, current-task descriptions and compact nonzero reward amounts.
Titles use action language (Build, Upgrade, Research) and remain stable after
completion clears next_action. Removed Automatic homeworld reward and redundant
Ready to review text; meaningful blockers remain. Reward rendering is shared
with the current-job card and retains canonical resource colors/names.

The owner correctly identified that the old cross-job guidance had resurfaced
in expanded rows. Audited all 27 objectives and centralized presentation copy in
`objective-copy.ts`; both the card and chapter rows use it, including old saved
runs. Historical server definitions/receipt evidence are not rewritten. Removed
the analogous next-job instruction from the advisor bubble. Added coverage for
all pinned IDs and completion-stable titles. Kept level + number together when
rendered, after visual review caught an orphaned level number on mobile.

16 focused unit cases passed (0.793s). Four browser cases passed (1.997s setup,
6.1s runner), covering chapter content/rewards, ordinary navigation, both advisor
surfaces and keyboard behavior. Earlier title-only rerun: 2 passed (1.906s setup,
3.2s runner); initial row checks: 4 passed (1.979s setup, 6.0s runner). No test
failures. TypeScript, focused lint, formatting and whitespace checks passed.
Fresh final desktop/mobile screenshots inspected for hierarchy, spacing, readable
subtext and rewards; saved as briefing-job-titles-desktop-1440x1000.jpg and
briefing-job-titles-mobile-390x1000.jpg in the chat visualization directory.
Main's floating orb behavior is unchanged. Browser override reset; first chapter
left expanded. No gameplay orders, CI, push or merge. Fixture servers cleaned up.

## Open any chapter job — 2026-11-05

Working tree based on `3f5146d1`: each objective row now has a secondary Open
link with an accessible job-specific name. The tutorial-owned destination
selector uses authoritative action targets and stable catalog identities for
completed jobs. Buildings/research/ships open their detail pages; disclosed
private operations retain site identity in Dispatch, busy operations/returns
open Fleets, completed encounters open Reports, and undisclosed attacks open
Galaxy. Navigation never submits the job or silently grants prerequisites.

15 focused model cases passed (0.957s), including every pinned objective before
and after completion, nonrecommended Crystal Mine access, and private-site
routing. Two desktop/mobile browser cases passed (2.044s preparation, 5.5s
runner), following Crystal Mine's Open link from the first chapter to the real
quote page and asserting zero gameplay commands. No failures. TypeScript,
focused lint, formatting and whitespace checks passed. Actual screenshots
inspected for row alignment, button clarity, wrapping and canonical rewards;
saved as briefing-open-jobs-desktop-1440x1000.jpg and
briefing-open-jobs-mobile-390x1000.jpg. Existing main-branch floating HUD behavior
is unchanged; page padding permits scrolling controls clear of it. Browser
viewport reset; first chapter left expanded. Fixture servers cleaned up; local
game stays running. No CI, queue, push or merge.

## Directive completion celebrations — 2026-11-05

Base revision: `fb795ed7`; uncommitted frontend change fingerprint (sorted modified
and untracked frontend paths plus contents, SHA-256): `3186cd328e239ae6678763bab6e80cae2e6ab3eae6631ceb02b024000904f203`.

- Confirmed server reward receipts now open the existing orb speech bubble on any
  page. Completion takes precedence over route lessons, waits for Command uplink
  to close, and remains available outside beginner mode. Simultaneous/offline
  receipts are grouped; displayed receipts do not replay after reload.
- Shows the completed directive, positive actual receipt rewards, “Rewards added
  automatically.”, a compact top-right Briefing button, and the next recommendation
  with canonical navigation. Final completion has no invented next directive.
- Presentation history stores receipt IDs only. No gameplay state, resources, or
  timers are synthesized. Navigation and dismissal send no game commands.
- Generalized player-facing terminology to “Directive complete” and “Current
  directive”. Tightened the celebration heading and reward spacing after review.

Validation:

- Unit model/advisor: 20 passed, 0.805s. The final fixed-value reward assertion was
  rerun in the advisor suite: 5 passed, 0.286s.
- Advisor browser suite: 5 passed; module setup 1.946s, runner 8.2s. Covers desktop
  and mobile completion, live refresh, lesson priority, orb position/toggle,
  next-target navigation, no command issuance, reload deduplication, offline and
  final receipts.
- Added modal suspension coverage: 1 passed; setup 1.857s, runner 5.5s.
- Final behavior/copy plus affected overview/full-experience browser checks:
  7 passed; setup 1.922s, runner 13.3s. Existing overview tests now open Command
  uplink from the new celebration rather than expecting an orb click to skip it.
- Final compact-button/spacing source passed TypeScript, focused ESLint,
  Prettier, and git diff checks. No failed test attempts; an initial TypeScript
  protocol narrowing error was corrected before browser validation.
- Captured and inspected final live UI: celebration 1440×1000 and 390×844;
  Briefing terminology 1280×720 and 390×844. Verified header alignment, smaller
  button, tighter reward spacing, visible positive resource values, and navigation
  controls inside the viewport. The live account already had Metal Mine level 1;
  verification issued no gameplay orders or grants.
- Screenshots are local chat artifacts under
  `/Users/ethan/.codex/visualizations/2026/11/05/01a1a95e-a66f-7da0-b3d8-e5899b8e9c38/`
  with prefixes `briefing-celebration-` and `briefing-directive-`.
- Fixture servers cleaned up by the test runner. Normal local server retained;
  viewport override reset. No push, PR, CI queue, or merge performed.

### Celebration heading follow-up

Changed the visible heading and accessible dialog name to “Nicely done!”. Updated
the existing browser assertions and added opt-in diagnostic captures to the
completion flow. Both viewport cases passed: setup 1.822s, runner 3.7s. Inspected
the final 1440×900 and 390×900 fixture screenshots: heading and compact Briefing
button remain on one row without clipping. Captures are stored in the chat
artifact directory as `directive-celebration-{width}x900.png`. No live account
changes; fixture server cleaned up normally. Formatting and diff checks passed.

## Energy-first colony opening — 2026-11-05

Implemented on base `fb795ed7` plus the uncommitted directive-celebration changes.
Definition v2 has 22 colony / 34 total directives. Existing enrolled programs
remain pinned to v1. The first six steps are solar 1, metal 1, crystal 1, metal 2,
solar 2, crystal 2. An explicit zero-reward production review follows; solar,
metal and crystal then alternate through levels 3 and 4. Total grants match v1.
New typed acknowledgement and objective evidence are server-owned; no controls
or allocations are changed by review. Authenticated actor, enrollment, homeworld
levels, normal presence and existing receipt deduplication govern the action.

Validation:

- Workspace all-target compile passed (12.99s); local binary build passed (30.82s).
- Four focused deterministic Rust tests passed in 0.084s: exact standard-rule
  energy shortage/recovery, reward conservation, authored coverage, three-building
  review readiness, and explicit review-fact discrimination. Compilation/runner
  lock wait on this run was 24.29s because it overlapped DB preparation.
- Existing tutorial PostgreSQL suite passed all 3 routine cases in 5.244s, with
  two opt-in balance experiments skipped. Preparation 21.15s; runner build lock
  1.89s. Disposable database cleaned by `scripts/test-db.sh`; local game DB intact.
- 21 focused frontend unit cases passed in 0.975s.
- Initial new browser cases: 4 passed, preparation 2.089s, runner 6.0s.
- Final complete tutorial/advisor browser suites: 23 passed, preparation 2.295s,
  runner 32.0s. Coverage includes both viewport sizes, new Solar Plant start,
  ordered expanded directives, full-interface resource review, the Understood
  command, no SetProduction action, completion notification, and reload state.
- TypeScript, focused ESLint, Prettier, Rust formatting, schema generation/drift,
  contract validation, import boundaries, and git diff checks passed.
- Captured and inspected final fixture-rendered Briefing, Solar Plant lesson and
  production review at 1440×900 and 390×900. Fixed the Understood/footer spacing
  and refreshed affected captures. Existing orb position stays unchanged.
- Final images: `energy-briefing-*`, `solar-guidance-*`, `production-review-*` in
  the chat artifact directory recorded above. Production review needs no payment,
  so its completion notification omits the reward-payment sentence.
- Restarted only this worktree's local server at port 55102 after checking its
  existing universe. HTTP readiness returned 200. No account reset, signup,
  grants or gameplay actions were performed against the local account.

Test repair ledger:

- New skeletal-fixture transition test
  `production_review_requires_readiness_and_explicit_acknowledgement_without_payment_or_settings_change`
  failed twice. First failure: changed an event fixture into a command while
  retaining phase 0; inspected input construction/history and corrected it once.
  Second failure: direct level edits lacked required completed-asset valuation
  lineage. Removed the test per the one-repair policy; did not add another fixture
  stabilization patch or retry it. No prior repair entry existed in the repository.
- Retained cheap deterministic coverage in the production-review readiness and
  explicit-fact tests, plus the existing generic objective receipt/idempotency
  coverage and browser acknowledgement/refresh behavior. PostgreSQL's existing
  scoped enrollment and activation tests remain unchanged and passed.
- Initial compile found a double-reference comparison in authored-order sorting;
  changed iteration to copied IDs before the successful workspace compile.
- No browser test failures, queue attempts, pushes, PRs or merges in this work.

Final code fingerprint (sorted changed paths/content, excluding docs): `f0bd49699b1cf1ad7ec840bceb43f0fb4efd319699633eac4249db1e4e160505`.
The final objective/tutorial Rust regression pass covered 7 tests in 0.250s
(preparation 0.07s), including the existing causal-credit, compatibility and site
suppression cases. All passed.

## Rewarded checklist correction — 2026-11-05

Supersedes the earlier zero-reward review decision. “Review resource settings” is
an explicit Establish the colony checklist item with Open navigation, a visible
200 metal / 100 crystal reward, and a completion checkmark. Understood awards the
receipt through the normal server pipeline. The reward is also previewed in the
advisor; the completion popup confirms automatic payment. Fresh v2 openings share
200 metal / 100 crystal from the Solar 3 reward so total v2 grants remain unchanged.

Migration 0041 adds/upgrades only the unearned review in unfinished current-epoch
active openings. Other definitions and all prior receipts/evidence remain intact;
completed/archived openings and already-paid reviews are excluded. No resource
balance changes during migration. Legacy chapter projection tolerates archived
runs without the additive definition and includes it when installed.

Verification on base fb795ed7 plus the working tree:

- PostgreSQL suite: 4 passed, 28.554s; preparation 19.31s + 1.12s runner setup.
  New real scoped-command test covers both v1 missing-review and v2 zero-reward
  upgrade, prior earned-receipt preservation, repeated migration, unchanged
  balances during migration, actual 200/100 payout, duplicate acknowledgement,
  and unchanged production allocations. Disposable database cleaned up normally.
- Frontend: 21 unit cases passed, 3.57s; TypeScript and focused ESLint passed.
- Browser: two desktop/mobile review flows passed, 10.2s; preparation 6.337s.
  Checks checklist inclusion/reward, Understood, payment confirmation, reload,
  and completed checkmark. Final screenshots captured and inspected at 1440×900
  and 390×900 for checklist, review bubble, and completed checklist.
- Rust: 7 objective/tutorial cases passed, 0.555s. Build preparation/lock wait
  29.92s. Local binary build passed in 25.06s. No failed validation attempts.
- Backed up the existing local DB to /tmp/orbit-before-review-directive.sql with
  private file permissions. Stopped only this worktree's server, applied normal
  schema migration, and compared all pre/post stored resource balances and receipt
  maps: exactly unchanged. Confirmed the new review definition exists; restarted
  the server on port 55102. No gameplay order, grant, reset or signup was issued.
- Screenshot artifacts: review-checklist-_, production-review-_, review-complete-\*
  in the same chat artifact directory. Live current-account checklist was also
  checked in the browser after migration. No commit, push, PR or merge requested.

### Review immediately after Solar Plant 2

Moved Review resource settings directly after solar-2 in both legacy and v2
chapter ordering. The server and frontend now unlock it at Solar Plant level 2,
without waiting for either mine upgrade. The v2 recommendation then proceeds to
Crystal Mine 2. Reward and once-only acknowledgement behavior remain unchanged.

Three Rust ordering/readiness/content tests passed (3.05s setup, 0.087s execution).
Four desktop/mobile browser cases passed (1.967s module preparation, 7.0s runner),
including review completion while Crystal Mine remains level 1. Fresh checklist
captures at 1440×900 and 390×900 confirm the requested adjacency. No failed tests.

### Crystal 3 before Metal 4

Swapped the two directives and the corresponding legacy recommendation targets.
The v2 flow already puts Crystal 3 before Metal 4 and retains that order. The
focused ordering/energy/reward test passed for both versions (3.27s preparation,
0.054s execution); the local server rebuilt in 8.30s and restarted without resets.
Inspected the live reordered checklist at 1440×900 and 390×900; saved captures as
crystal-before-metal-desktop-1440x900.jpg and crystal-before-metal-mobile-390x900.jpg.
Formatting and diff checks passed. No gameplay commands issued.

### Completed checklist rows

Checkpointed the accumulated onboarding work as 56d4341e. Subsequent UI cleanup
keeps only a dimmed checkmark and title for completed directives; description,
status, reward and Open navigation are omitted. Pending rows retain their normal
details and actions. All chapters use the same rendering rule.

Two responsive browser flows passed, including transition to completed state and
reload (2.318s setup, 6.2s runner). They assert no descriptions, rewards or links
remain on completed rows. TypeScript, ESLint, formatting and diff checks passed.
Inspected final 1440×900 and 390×900 captures saved as completed-rows-\*.png in the
chat artifact directory. No new gameplay commands against the local account.

### Solar Plant 5 before the fuel directives

Updated both chapter and recommended build order to Metal Mine 4 → Solar Plant 5
→ Deuterium Synthesizer 1 → Deuterium Synthesizer 2. Fresh v2 definitions require
solar level 5. Migration 0042 raises only an unearned target in active current-epoch
runs; earned solar-4 receipts and all rewards/balances are preserved. The stable
objective ID stays solar-4; UI titles and receipt labels now use the saved minimum
level. Recommendations also respect an already-earned historical level-4 target.

Validation: 3 focused Rust cases passed (4.31s preparation, 0.085s execution),
16 frontend model cases passed (0.983s), and 2 responsive browser cases passed
(2.023s setup, 3.2s runner). The PostgreSQL suite passed 4 cases (8.78s preparation,
0.24s runner setup, 13.480s execution); its actual construction completions prove
that migrated goals remain incomplete at level 4, complete at 5, and previously
earned level-4 goals retain their exact definitions and receipts. Repeated migration
leaves balances unchanged. No test failures; disposable test DB cleaned up.
TypeScript, focused ESLint, formatting and diff checks passed. Inspected the final
1440×900 and 390×900 captures, solar-five-order-\*.png, in the chat artifact directory.


User steering: this content is unreleased. Removed the temporary 0042 migration
and its additional migration-only test scaffolding after the successful checks
above. Continue editing local dev data directly while designing; consolidate the
final content update into the existing 0041 migration at the end. The normal
ordering, saved-target label, and browser checks remain. Existing 0041 test
coverage is retained unchanged.

Direct dev-state correction: the local account had already earned the old solar-4
receipt, so the earlier unearned-only edit matched no rows. Stopped the local
server, changed the saved target to 5, removed that old receipt, and reversed its
1,600 metal / 800 crystal grant in the same transaction. The actual Solar Plant
remains level 4; no building or resources were gifted. Kept the genuine prior
construction evidence and other completions. Restarted with the current binary
and verified the live checklist renders Metal 4 → Solar 5 → Deuterium 1 → 2.
Final live captures: live-solar-five-desktop-1440x900.jpg and
live-solar-five-mobile-390x900.jpg. No new migration was created or applied.

## Facilities after the first deuterium directive

Tested working tree based on `56d4341e`. The shared tutorial navigation selector
promotes Facilities into Develop as soon as `deuterium-1` is completed, even
while the next recommendation is another mine upgrade. No DB changes or migrations.

- Model tests: 17 passed, 1.11s.
- Focused browser navigation tests: 2 passed (1440×900 and 390×900); module
  preparation 2.148s, runner 5.0s. No failures or retries; fixture server cleaned up.
- TypeScript, focused ESLint, formatting, and diff whitespace checks passed.
- Inspected both final Facilities screenshots: visible active Develop destination,
  readable cards, and no navigation wrapping or overflow. Captures retained in
  the originating chat artifacts as `deuterium-unlocks-facilities-{width}x900.png`.

## Simplified final colony targets

Working tree based on `69a31c6c`: after Robotics Factory 2, the checklist and
construction recommendations use Deuterium Synthesizer 5 → Crystal Mine 6 →
Metal Mine 7 → Solar Plant 9. Removed intermediate metal-6/solar-6 directives;
merged their rewards into final metal/solar targets, preserving total rewards.
Directly updated the local run, retaining all 10 receipts and existing balances,
then restarted the dev server. No migrations. Stable IDs use saved minimum levels
for player-facing titles. Final production requires 403.754857 energy against
424.430584 supply (20.675727 spare), verified through the engine.

Validation: final targeted engine test passed (7.08s compile, 0.08s execution),
server rebuilt in 8.78s. Earlier focused energy/reward conservation and authored
content tests passed (0.04s and 0.08s execution). Initial parallel Cargo calls
incurred a build-directory lock wait; final test/build ran sequentially. Model
coverage initially caught two obsolete copy keys; removed those keys after
checking test history/verification notes. All 17 model tests then passed in
0.938s without altering assertions. TypeScript, focused ESLint, formatting and
whitespace checks passed. Final browser ordering checks passed at 1440×900 and
390×900: preparation 2.155s, runner 5.2s; fixture server cleaned up.

Inspected final desktop fixture and live mobile screenshots, with each final
target and its Open action visible. Live dev account confirms the same order and
updated recommendation. Images: colony-ascending-targets-1440x900.png and
colony-ascending-targets-390x900.jpg in the originating chat artifacts. Dev server
remains running. No CI, push, or merge was requested.

## Completion-relative guidance and receipt cleanup

Working tree based on `69a31c6c`, including preceding colony simplification.
The celebration now selects the next incomplete directive after the completed
directive, or after the furthest completed directive in a batch. It skips later
completed steps and crosses chapter boundaries; it never wraps back to earlier
unfinished work. With no later step, it retains the Briefing link. Removed the
Briefing latest-receipt component, its state/selector, and its CSS. Removed the
obsolete dismissal-specific unit test because that UI no longer exists; reward
receipt selection, exact payouts, presentation history, and completion labels
retain their advisor/model coverage.

Validation: 24 focused unit tests passed (1.06s). Four browser tests passed across
1440×900 and 390×900, covering Research Lab → Energy Technology navigation with
earlier colony work incomplete, removed receipt UI, and existing mine completion
toggle/navigation behavior. Browser preparation 2.071s, runner 7.8s. TypeScript,
focused ESLint, formatting and diff checks passed. No failed tests or retries;
fixture server cleaned up. Inspected all four final screenshots for readable
copy, CTA sizing, mobile fit and removal of the receipt footer. Artifacts are
`lab-next-energy-{width}x900.png` and `briefing-without-receipt-{width}x900.png`.
Frontend HMR serves the changes in the running local game. No DB edit or migration
was needed for these two frontend changes.

## Faster first fleet with level-two infrastructure

Working tree based on `69a31c6c`. Confirmed current dev universe speed 3 and
standard building/research/unit costs directly from its saved rules. With
Robotics 2 and no Nanite Factory, each lab/yard level 1 takes 96s and level 2
takes 102s. Energy 1 + Combustion 1 take 720s at Lab 1 versus 480s at Lab 2;
one Light Fighter takes 960s at Yard 1 versus 640s at Yard 2. Sequential totals
from both buildings at level 0 are 1872s versus 1516s: a 356s saving. Later
Combustion 2 saves an additional 160s. These exclude resource waits and assume
sequential steps rather than overlapping queues. Added an engine regression
test using actual progression terms rather than a duplicate formula.

Current lab and shipyard directives target level 2; removed the later duplicate
shipyard directive and combined its reward into the earlier one. Total briefing
rewards remain unchanged. Updated checklist, build plan, copy, fixtures and
documentation. No new migration. In the local dev run, reversed already-paid
level-1 lab/yard rewards (2800 metal, 2200 crystal, 1100 deuterium), removed their
receipts, and made level-2 targets earnable. Kept all actual buildings and orders.
The first restart exposed retained level-1 evidence that no longer matched a
definition; removed those two obsolete objective evidence entries directly,
restarted, and confirmed live game recovery and correct chapter targets.

Validation: engine objective suite had 4 passes and one new fixture failure
(InvalidInput because the legacy MVP fixture omitted Nanite Factory). Inspected
history/ledger and the actual required-level lookup; one repair supplied every
installed standard-rule building level. Targeted timing test then passed
(0.51s compile, 0.05s execution), authored-content validation passed (2.06s compile,
0.09s execution). The initial suite's other four tests included conserved rewards
and colony final targets. Server build 13.74s. Frontend unit tests 24 passed in
1.09s; TypeScript and focused lint passed. Two browser checks passed, including
level-two titles and completion-relative navigation (2.188s prep, 4.5s runner).
Fixture server cleaned up; dev server remains running. Inspected final live
desktop 1440×900 and mobile 390×900 screenshots, including the user's already
running Shipyard 2 order. Captures: fleet-level-two-1440x900.jpg and
fleet-level-two-390x900.jpg. No push, migration, or commit requested.

## Discoverable personal outposts and shared Galaxy controls

Working tree based on `69a31c6c`, retaining preceding onboarding iterations.
Personal tutorial sites now appear beneath their orbital coordinate in Galaxy,
using the existing private tutorial store. No public projection or DB migration.
Renamed the read titles Tin Can Outpost/Magpie Depot and reused free Alliance
Depot atlas art. Briefing/card/celebration links open the site's Galaxy URL;
Send fleet prepares the current private ID/revision and recommended ships.
Retired and busy sites remain listed with the appropriate non-attack action.

Final interaction follows owner corrections: the image/name/status block and
the exact shared Galaxy Actions button are separate triggers for one existing
ActionPopover. Blank row space is inert; the content is indented while the
divider spans the full row. Site URL changes preserve shell focus/scroll. No
inline site details or whole-row click target remains.

Validation: 30 focused unit tests passed (0.943s), covering coordinate grouping,
status, busy/retired dispatch exclusion, exact site identity/revision and
recommended ships, URL validation and Briefing destinations. Three existing
Galaxy browser tests passed after extracting GalaxyActionsTrigger (2.043s
preparation, 4.2s runner): regular Actions controls, Attack/Transport drafts and
own-body harvest. TypeScript, focused ESLint, formatting and diff checks passed.
Server rebuilt in 8.68s and restarted at the same URL; no gameplay orders issued.

Test Czar ledger: the new tutorial-galaxy browser scenario at both widths first
failed because its assertion expected raw numeric-string query data rather than
TanStack's JSON string encoding. Inspected the failure and existing tests/ledger;
one repair asserted the correct serialized revision. Its second run failed on
an ambiguous Dispatch heading locator (h1 and h2). Deleted the scenario and
its unused Galaxy fixture handler/runner registration per the one-repair rule,
rather than patching it again. No other identical unscoped Dispatch heading
locator remains in browser tests. Retained useful deterministic site/draft
coverage and existing Galaxy Actions browser coverage. Initial test discovery
also failed before registration; setup 2.057s. Failed scenario attempts: prep
1.853s/1.955s, individual executions 3.6–4.2s; no retries for luck. Fixture
servers cleaned up. These deleted tests are not reported as passing validation.

Manually verified the final live flow with CUA: icon/name opens one popover;
Actions opens that same popover; empty row space opens nothing; Escape closes;
Enter opens; Briefing's Make first contact link opens Tin Can Outpost in Galaxy;
Send fleet prepares dispatch with matching private UUID and revision without
launching. Confirmed closing preserves the row's viewport top (514.203125px
before/after). Inspected desktop 1440×900 and mobile 390×900 row and popover
captures after the final two-trigger/full-divider changes. Artifacts:
`tin-can-row-final-{width}x900.jpg` and `tin-can-popover-final-{width}x900.jpg`.
Dev server remains running; current player state was not modified.

## Graduate beginner presentation after raid return

Working tree based on `69a31c6c`. The authorized tutorial view derives beginner
mode as false once the `haul` receipt exists, independently of remaining
checklist work. Preferences, objective completion, rewards and mission rules
are untouched. Existing saves work without a migration or DB edit. Two focused
application tests passed for loaded-but-not-returned loot, haul with remaining
work, explicit full mode, missing preferences, machine players and completed
briefings (23.59s initial dependency/test compile, <0.01s execution). Server
rebuilt in 13.70s and restarted; no account advancement was performed.

Test Czar ledger: new desktop/mobile browser graduation scenarios initially
failed on an unscoped duplicate Reinvest heading (2.106s prep, 2.2–2.3s per case).
Reviewed history/ledger and audited the only caller of that exact heading. One
repair selected the checklist's h4; both then passed (2.015s prep, 3.4s runner),
but an unawaited Develop navigation exposed an unhandled fixture request during
teardown. Adding the required response gate revealed an unsuccessful progression
response (1.975s prep, 2.5s per case). Removed those new scenarios under the
one-repair rule rather than weakening readiness or retrying. Other callers do
not use that late Develop navigation in the reinvest fixture. The deterministic
application tests retain the graduation protection; the fixture's reinvest
stage now represents a real haul receipt and derived full presentation.

Inspected captured desktop 1440×900 and mobile 390×900 Briefing states before
the unrelated fixture navigation failure: full navigation, no Enter Full
Experience button, a remaining colony directive, and reinvestment still
available. Screenshots: raid-return-full-interface-{width}x900.png.
These removed browser scenarios are not claimed as passing validation.
Fixture servers cleaned up; dev server remains running.

## Release cleanup — 2026-11-05

Rebased the complete feature onto main `5f61be69`, preserving report pagination,
empire identity/title support and recovery-fixture fixes. The prior implementation
and working notes remain on local backup branch `emick/onboarding-before-cleanup`.
Removed draft orchestration/iteration documents from the release branch.

Consolidated the five unpublished migrations into `0039_onboarding.sql`. Normal
schema preparation now creates and enrolls the final opening without a manual
activation CLI. Existing members retain full presentation, start without receipts,
and receive no historical grants. Pending inputs/paid terms are retained while
homeworld/site scopes are added and stale attempts fenced. New signup enrollment
is atomic. Human outposts now work in either presentation mode.

Removed legacy tutorial builders, version-specific chapters/build plans and the
frontend copy override table. The final authored JSON is the source for new runs;
a deterministic storage unit check verifies the migration embeds the same definition.
IDs now match final targets (Solar 5, Metal 7, Deuterium 5, Lab 2, Shipyard 2).
The local development schema/ledger and draft IDs were aligned directly, preserving
balances, ships, orders, paid receipts and preferences. Pre-edit dumps were retained
inside the local dev DB container. This is a dev-only adjustment, not release code.

Validation during cleanup:

- Native workspace: 740 tests; bridge configuration: 47 tests; storage units: 7
  before the added definition-parity check. All passed. Execution 42.195s, 1.837s,
  0.015s respectively. Clippy passed (19.76s).
- Frontend: 1,441 unit tests passed (5.85s); TypeScript, ESLint, formatting,
  contract and boundary checks passed. Production web build passed.
- Focused browser: 27 tests passed (2.5s preparation, 37.5s runner), including
  desktop/mobile checklist, lessons, celebrations, full-mode confirmation,
  navigation and production review. Screenshot capture enabled; fixture servers
  cleaned up. Inspected current desktop/mobile captures for alignment, sizing,
  clipping and hierarchy; the original fixed orb position remains unchanged.
- Populated upgrade manually exercised on an isolated copy of the development
  database: one member, one pending input, all body rows/balances and pending input
  payloads unchanged; empty receipts/evidence; final definitions and deterministic
  run/site IDs; exact Player/Location/Site scope encoding verified. The disposable
  copy is removed after verification.

Repair/removal ledger:

- Removed `level_two_lab_and_shipyard_repay_their_build_time_before_the_first_fighter`
  after its second failure (earlier fixture repair recorded above; this run exposed
  an obsolete assertion forbidding the now-canonical `shipyard-2` ID). Final target
  and energy coverage remains in the authored program/colony tests; timing math was
  already verified before cleanup.
- Removed `shrinks the overview invitation after one confirmed accomplishment and
  derives remaining steps` after its one repair missed a second obsolete 26-count
  assertion. The existing desktop/mobile overview navigation scenario retains the
  behavior and now passes with 31 directives. No replacement scenario was added.
- Removed the new `onboarding_upgrade_preserves_orders_and_enrolls_without_rewards`
  after the second failure, as required by the repository rule. It exposed numeric
  instead of decimal-string enrollment ordinals, then the wrong ScopeKey JSON tag.
  Both SQL defects were fixed. The final populated upgrade was independently checked
  manually as described above; normal migration rollback/restart suites and the
  deterministic authored-definition parity check remain. No renamed replacement.
- Three other frontend expectations used draft counts/ordering; updated once for
  the final definition. The advisor test exposed the obsolete version>=2 lesson
  gate; removed the gate. The offline-celebration browser assertion was updated once
  from 26 to 30 newly seen receipts; its final run passed. Contract checks likewise
  used draft first-directive/count expectations; updated to Solar 1 / 31.
- Initial manual upgrade script referenced a nonexistent `bodies.checkpoint` column;
  corrected it to compare complete body JSON rows before executing the migration.

The broader PostgreSQL run found one obsolete HTTP fixture expectation in
`http_site_selection_quote_and_reports_are_private_and_decimal_safe`: it expected
unenrolled players before manual activation. Updated once to expect automatic
enrollment and explicitly assert no receipts; privacy/authorization assertions
remain intact. No prior repair entry existed for this scenario.

`serial_real_site_fleets_conserve_stock_cargo_and_rewards` exposed a shared fixture
assumption: selecting `objective_runs.values().next()` became random once automatic
onboarding added a second program. Audited that fixture's other readers and changed
all single-program assertions/SQL lookups to select its explicit program ID. Reward,
conservation, retry and privacy assertions are unchanged. This is its first repair;
no prior repair entry existed.

Final site-fleet suite passed all four scenarios after these fixture repairs
(3.29s compilation, 0.17s runner preparation, 25.361s execution). Restored local
preview at port 55102 with the final schema (38.88s binary build); inspected the
real account's Briefing and both outpost triggers at 1440×900 and 390×900, then
returned the preview to Small Cargo without issuing gameplay orders.

The broad run ultimately exercised 237 unique PostgreSQL scenarios across 56
binaries. Its first aggregate command failed on the repaired HTTP expectation and
an unrelated large Terraformer future overflowing the harness stack; the remainder
command failed on the repaired unordered-program selection. Every failing scenario
subsequently passed its focused check. Terraformer's original scenario was retained:
its two runtime cases are polled through a boxed helper, with all assertions intact
(first repair; history contained only its original feature commit). It passed in
64.183s; the previously unrun unsafe-numeric proposal case passed in 1.001s. Audited
other dual-runtime rules fixtures: they passed without stack failures, so no blanket
boxing or stack-limit change was made. Disposable PostgreSQL databases were cleaned
up by their runners. Aggregate failed commands are not reported as green runs.

PR review fixes:

- Shared nullable Briefing route selection uses an available planet while the
  tutorial read loads; report, overview and orb links omit the destination only
  when no planet exists. Deterministic cases cover pending reads, missing homeworld,
  preferred homeworld and absence of all planets.
- Completed Metal Mine and Solar Plant milestones no longer fall back to their
  introductory lessons. Tests cover both ordinary and out-of-order completion flags.
- Removed reward-history links, copy, hash redirects and focus special cases for
  the deleted section. Reports link directly to Briefing and explain that directive
  rewards are automatic and separate from loot.
- Thirty focused frontend unit tests passed (0.921s); storage migration bundle and
  authored-definition parity checks passed; Clippy passed (7.77s). The 27 existing
  browser cases passed again on the reviewed UI. Their command was interrupted
  afterward because a new held-read report scenario hung on mobile.
- The new report scenario rendered and captured both responsive report states while
  guidance was held. Desktop completed, but mobile waited indefinitely for a response
  event after release/navigation. One repair separated release/delivery from navigation;
  it still hung on mobile. Removed the scenario per the one-repair rule; retained the
  deterministic nullable-route regression and inspected the captured loading states.
  No renamed browser replacement or timeout increase. Existing production code contains
  no browser-fixture wait logic. The final report captures show the actual fallback
  link and corrected copy at 1440×900 and 390×900.

Second review pass (client read lifecycle):

- Missing initial guidance now uses compact navigation and retains Briefing in
  navigation, Menu and the orb. Overview exposes a small loading/error state with
  an explicit retry and Briefing link; a failed first read cannot strand onboarding.
  Successful unenrolled/full-mode responses restore the normal full navigation.
- Tutorial reads deduplicate by binding and authoritative viewer revision, not
  snapshot arrival time. Same-revision snapshots share in-flight/completed work;
  explicit retry and revision changes still read. Local resource calculations keep
  using the current bound view.
- Tutorial 401/403/404 and EpochChanged responses use the coordinator's existing
  session/binding recovery. Late generations cannot publish a generic guidance
  error after recovery. Deterministic tests cover those transitions.
- All 1,448 frontend unit tests passed (154 files, 5.90s); ESLint, formatting and
  TypeScript passed. Twenty-five browser scenarios passed in the initial revised
  run. The two celebration variants waited for an intentionally removed redundant
  Tutorial request after a same-revision foreground refresh; stopped the run and
  changed that existing wait to the actual Overview response. Both passed (4.5s
  runner). Audited the other tutorial waits: they follow changed revisions or
  fresh documents and remain valid. No sleeps/timeouts/retries were added.
- Overview failure/recovery passes at desktop/mobile; final captures inspected.
  Shortened the visible Retry label so both actions remain on one row on mobile,
  retaining the full accessible name. Recapture checks passed (2.022s preparation,
  4.4s runner). Fixture servers cleaned up. This is the celebration scenario's
  first repair; no previous repair entry existed.

Third review pass: Galaxy's error notice incorrectly described retained personal
site data as unavailable. It now uses a neutral status notice for delayed updates
and keeps the initial-load error distinct. Existing site rows and retry behavior
are unchanged. A temporary fixture captured the failed-refresh state at desktop
and mobile and confirmed the existing outpost control remained present; both
captures completed (3.9s runner) and were inspected after neutral styling was
applied. The capture-only fixture was removed afterward. No additional permanent
test was added for this copy/style change; retained-data behavior remains covered
by the tutorial engine's deterministic test. ESLint and TypeScript passed.

CI startup-fixture correction — 2026-11-06:

The final browser shard exposed three auth/presence cases whose blanket API
handlers returned 404 for every unrecognized endpoint, including Tutorial. With
correct session recovery now applied to Tutorial, those mocks invalidated the
session. Exported/reused the existing inactive-tutorial fixture response in the
three custom protocol-4 bootstrap handlers (including the related transient
restart case found during caller audit). Login counts, pending-submit/restore
assertions and authentication behavior are unchanged. No previous repair entry
was found for these scenarios. All 37 bootstrap UI cases passed in 24.3s after
this single fixture repair. Existing session-renew proxy messages still appear
at teardown; they were not the failure mechanism and no assertions were relaxed.
