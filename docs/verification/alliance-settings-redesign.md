# Alliance settings — 2026-11-10

Base revision: `25dafdd2`, the preceding Applications changes committed at the
owner's request. Verification covers the Settings changes above this revision.

## Scope

- Replaced the long settings page with permission-aware Profile, Recruitment,
  Invitations and Leadership/Membership destinations. Section selection lives
  above the command-refresh remount boundary; current permissions determine
  which destinations remain available.
- Added compact field groups, section dividers, independent draft/save scopes,
  horizontal navigation on desktop and mobile.
- Split profile and joining-rule updates while preserving the current saved
  values belonging to the other form. Recruitment preferences retain their
  existing command. No backend or contract changes.
- Replaced the per-member transfer buttons with a sorted member selector and
  shared confirmation dialog. Leave/disband and invitation link changes also
  use the shared confirmation component. Invitation image download remains;
  the large inline poster is no longer shown inside Settings.

## Validation

- Component suite: 20 distinct cases passed across the full and focused runs.
  New cases protect independent drafts, rejected saves, section retention after
  refresh, profile/joining-rule isolation, compact responsive navigation,
  successor selection, confirmation focus, cancellation and disband review.
- The first run was interrupted at a newly added select's exact label lookup
  (4,183ms preparation, 53.7s execution). Explicit accessible labels were added
  to the new leader and joining-rule selects. A premature second run compiled
  before the leader-label fix landed and was interrupted for the same reason
  (3,923ms preparation, 37.6s execution). No timeout or retry policy was changed.
- Full corrected run: 3,666ms preparation, 12.3s execution; 18 passed, two
  invitation tests exposed an ambiguous locator matching both the newly labeled
  section and its input. After checking test history and the repair ledger, the
  one repair narrowed that locator to the Invitation link textbox. The two
  affected cases then passed: 3,665ms preparation, 1.8s execution. No assertions
  were removed. Failure artifacts retained in `/tmp/orbit-settings-selector-failure`
  and `/tmp/orbit-settings-invitation-selector-failure`.
- `npm run test:ui -- alliances.spec.ts recruitment.spec.ts --workers=1`:
  13 passed, 4,453ms preparation, 14.4s execution.
- Component and application TypeScript, focused ESLint, Prettier and
  `git diff --check` passed. Initial typecheck caught unsupported `toSorted`;
  sorting the already-filtered copy fixed it without mutating source data.
- All expensive checks were serialized; no hosted runner queue, production
  build, backend suite, push or deployment was involved.

Captured and inspected all four settings destinations and the leadership review
at desktop 1440×1000 and mobile 390×844. Recruitment has separate mobile captures
for joining rules and preferences. Desktop preferences were tightened into two
columns after visual review. Screenshots stay in the chat's local visualization
folder. Live leadership review was canceled; no leader, member, invitation or
saved setting was changed during visual review. Submissions are exercised with
the isolated component fixture.

The local application mirrors the source changes for review. Its existing server
remains running, with Settings selected and the temporary viewport override
reset. Temporary dependency linking was removed and the original worktree cache
restored. Settings changes are uncommitted.

## Navigation follow-up

At the owner's request, removed the desktop settings sidebar. All viewport sizes
now use the compact horizontal section navigation, with content below it. This
is a local CSS-only layout change. The two existing responsive settings navigation
and leadership-review cases passed (3,724ms preparation, 1.7s execution).
Formatting and diff checks passed. Refreshed and inspected desktop/mobile
Settings navigation captures; earlier screenshots showing the secondary sidebar
are superseded by the horizontal-navigation captures.
