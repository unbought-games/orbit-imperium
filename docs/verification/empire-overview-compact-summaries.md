# Empire overview compact summaries — 2026-11-05

Validated working changes on base `a0a3b7d14656838d7b10d2db810b187d57561f22`.
SHA-256 of the tested files:

| File | SHA-256 |
| --- | --- |
| `apps/web/src/features/empire-overview.tsx` | `983e17ddf450d4e8e53efe233c0bbbd24b0d55fda525360676e3886892712ed3` |
| `apps/web/src/features/empire-overview.module.css` | `9160c35f5f62ea44809a1d8fc9d5077e81a2d627a215b363f9f90050bde2e248` |
| `apps/web/tests/empire.spec.ts` | `d9cdd24db1d79a7ac6ebc0dad8eb71f74917db9eb74b3a8a334358dcbccdd9a1` |

Idle research now measures 63px high at 320, 390 and 1440px viewport widths.
The alliance section measures 81px on mobile and 63px on desktop. Active
research retains its artwork, timing, progress and whole-card navigation.
Membership is read from the existing profile store; an unknown profile gets
neutral navigation wording instead of a claim that the player has no alliance.

## Verification

- `npm run test:ui -- empire.spec.ts -g 'research directive opens'`: two passes;
  preparation 1.821s, Playwright runner 4.7s, command wall time 7.39s. Existing
  coverage checks active and idle navigation, keyboard activation and responsive
  overflow; added an idle height assertion and bootstrap response gating.
- `npm test -- apps/web/src/client-model/player-profiles.test.ts apps/web/src/client-model/research-progress.test.ts apps/web/src/shell/routes.test.ts`:
  23 tests passed across the two existing profile and route files; there is no
  standalone research-progress test file. Runner 0.167s, command wall time 1.00s.
  These retain deterministic profile expiry and destination eligibility coverage.
- TypeScript passed in 7.65s; canonical ESLint passed in 3.16s. Focused Prettier
  and `git diff --check` passed.
- Direct browser review with response-gated fixtures exercised the alliance link
  through keyboard activation to discovery and creation controls, plus membership
  display with a long name. Captured and inspected 320×1000, 390×1000 and
  1440×1000 idle/member states; no horizontal overflow. Three-width review took
  8.38s. Desktop focus outline was inspected; mobile follows the existing global
  mobile focus-outline policy. Active research captures were also inspected at
  390×1000 and 1440×1000. Captures remain local in `test-results` for chat delivery.

## Failure and repair record

The initial browser command could not start without dependencies; `npm ci`
completed in 3s. The before-change research cases then passed (1.764s preparation,
4.7s runner). Initial implementation checks passed all four cases, including
then-new alliance navigation cases (1.725s preparation, 6.5s runner).

Changing the new alliance cases to empty-fleet fixtures omitted required
`score_value_micro` and `fleet_slots` fields. The resulting bootstrap could not
mount the profile provider, leaving response listeners waiting. The first run
was stopped after 61.81s (1.673s preparation; existing research cases passed).
Inspected test history and `docs/runbooks/test-performance-audit.md`; no separate
owner Test Czar ledger was available. One repair corrected the new navigation
listeners from incidental overview refreshes to the authoritative bootstrap.
That did not fix the malformed fixture; the next run was stopped after 74.24s
(1.642s preparation; existing research cases passed).

Removed both newly introduced `compact empire research and alliance link preserve
navigation` cases under the one-repair rule. They were not renamed or replaced
in the automated suite. Their navigation and visual states were checked directly
for this change using complete fixtures. Existing deterministic profile/route
coverage and existing research browser coverage remain. Audited the three
response listeners introduced in this task: the removed cases owned two, and
the retained research reload now waits on bootstrap. No shared helper changed.

Browser runners and direct review closed their browsers, Vite servers and port
leases, including the interrupted runs. No database or Docker setup was used.
CI queue wait, merge delay and queue removals are not applicable; no push or PR
was requested.
