# Mobile Reports badge verification

Rebased onto `9415a56` (2026-11-04), including the current full-page Menu.
Removed the obsolete dialog/sidebar changes from the earlier implementation.
The sorted changed application/test paths and contents, NUL-separated, have
SHA-256 `5f2079e65fe714f43c274abe9cba595dcec6cf1e26b6829f2057bdac06ad0c28`.

The Reports row derives its count from visible unread shared inbox members.
It shows a champagne badge before the chevron, caps at 99+, and retains a small
unread dot when only the server's unread flag is known. No derived state is stored.

## Checks

- Baseline current-menu browser case: passed; preparation 1.254s, runner 2.7s.
- Report state, inbox and engine unit suites: 44 passed, 0.610s runner.
- Lint, source formatting, TypeScript and whitespace checks passed.
- Initial browser run: 2 menu navigation cases passed; all 6 badge cases failed
  immediately with `ReferenceError: withFixtureResponse is not defined`.
  Preparation 1.310s, runner 6.7s. This was an omitted import in this change.
- Checked shell-test history (including #330) and available verification/performance
  ledgers before the one repair. No separate Test Czar ledger is available locally.
  Audited all five new helper calls: all use the same missing import. Added that
  import without changing assertions, timeouts or retries.
- Repaired badge cases: all 6 passed; preparation 1.197s, runner 7.5s. Covers
  320/390/768px, 100%/200% text, counts of 12 and 99+, clearing, keyboard navigation,
  refresh and a 1440px desktop viewport. Two navigation cases passed in the first run.
- Inspected fresh mobile/desktop pixels, including capped and cleared states.
  Captures are local in `test-results/current-menu-*.png` and delivered in chat.

No external runner queue, PR, push or merge; queue removals and merge delay are
not applicable. Existing dependencies were reused. Browser/Vite processes closed
and ports were released by the fixture runner; no database or containers used.
