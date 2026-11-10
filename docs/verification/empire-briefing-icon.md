# Empire briefing shortcut — 2026-11-09

Source revision: `9c92a2783a8424230cd55be6e2cbd959db7536b0`, including
integration with main at `16b0c823149d63c0571a28a804834be2d11e6504`.
The integration conflict in `tutorial/model.test.ts` retained both the beginner
progress regression and main's quoted-upgrade/research shortfall coverage.

The heading book opens Briefing, acknowledges only currently observed progress,
and becomes unread after another authoritative completion. Acknowledgement is
presentation history scoped to the account, universe, epoch and player. It does
not send game commands. Hover/focus fades, reduced motion, keyboard activation,
44px touch targets, reload persistence, leaving beginner mode and mobile menu
navigation are covered at the browser layer. Completion permutations, history
isolation and blocked-storage fallback are covered by deterministic unit tests.

## Validation

- 35 focused unit tests pass across briefing attention, tutorial model, route,
  advisor and navigation model suites.
- Eight focused browser cases pass on Node 24.18.0, covering the heading book,
  full-experience switch, guidance failures and beginner briefing navigation.
  Module preparation took 29.925s; the browser runner took 46.3s. Focused unit
  execution took 16.63s. Earlier validation on the shell default Node 23.3.0
  also passed (browser preparation 17.275s, reported runner 1.8m, command 129.77s).
- Canonical ESLint and Prettier checks, TypeScript and `git diff --check` run
  before publishing. Exact results and phase timings are recorded alongside
  the local validation artifacts and in the originating chat.
- Captured and inspected the final integrated overview at 1440×900 and 390×900,
  including unread, hover and acknowledged states, and the menu at both sizes.
  Screenshots remain in the implementation chat rather than the PR description.

The first integrated TypeScript check failed because local dependencies had not
yet installed main's new `@types/markdown-it`. Dependencies were resynchronized
from the lockfile before repeating the affected check. This was a local setup
issue; no source declarations were weakened. Lockfile installation took 15.70s;
the corrected TypeScript check passed in 17.53s. ESLint took 37.80s and Prettier
took 66.41s on the loaded development machine.

## Test repair record

During implementation, both new `Empire briefing icon opens by keyboard or touch
and remembers acknowledged progress` cases failed after the twinkle moved to
`::before`: direct `getAnimations()` excludes pseudo-elements. Their single
repair queries `getAnimations({ subtree: true })`; actual CSS animations and
hover-enter/leave transitions remain asserted. Other animation callers either
inspect their direct targets or already include subtrees. The repaired cases
passed on the integrated revision.

The existing 390px `full experience confirmation preserves briefing progress and
rewards` case failed a newly added sidebar assertion because accessible-role
queries exclude the CSS-hidden desktop sidebar. Its single repair uses
`includeHidden: true` for this DOM-removal assertion. Other visible sidebar
assertions remain desktop-scoped. Both viewport cases retain command, receipt,
objective, reload and book-navigation assertions. The repaired case passed.

Test history and the repository Test Czar audit were inspected before each
repair. No test was deleted, retried unchanged, given a longer timeout or stripped
of an assertion. These cases have each used their one repair attempt.

## Initial CI follow-through

The first CI run on `5b989d0d332bf0db4293d4878a248f3ac8c3eb9b`
(`42743282153`, attempt 1) exposed two omissions:

- The build note lacked the news generator's required YAML identity/title/date.
  Added that metadata without changing the generator or its validation.
- The shared navigation-icon test explicitly prepended Briefing and also read
  it from the newly complete menu groups. The destination therefore appeared
  twice in its input, making the unique-icon assertion fail (14 versus 15).
  After inspecting its history and the Test Czar audit, its single repair removes
  the redundant explicit entry. Briefing remains covered through the Guidance
  group, and the defined-icon and unique-icon assertions remain unchanged.

After these corrections, all 1,507 frontend unit tests passed (7.54s runner,
9.24s command), the production build passed (18.18s), and all ten built-homepage
checks passed (0.369s preparation, 3.5s runner, 5.13s command).

Automated review also identified an unread-book race when navigation precedes
the tutorial response, and stale attention after entering through another link.
The Briefing page now records delivered progress as read. A controlled-response
browser regression verifies the early click, and existing desktop/sidebar and
mobile/menu cases verify alternate entry points. Five focused cases passed
(2.436s preparation, 18.8s runner), with TypeScript and focused lint/format checks.
The original acknowledgement and later-completion assertions remain intact.

## Cleanup

Fixture runners close their own browsers, Vite servers and port leases. No
PostgreSQL or Docker setup was needed. The separate sample-data preview remains
running for the owner. CI runner wait and merge-queue delay are tracked separately
from local setup and execution in the originating chat.
