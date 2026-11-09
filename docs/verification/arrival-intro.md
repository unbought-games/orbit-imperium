# Arrival intro verification — November 8, 2026

Tested revision: `d70475f0` on `claude/project-thread-xehnnr` (base `017997bf`).

## Checks

- Application unit tests for climate bands and action JSON: 2 passed.
- PostgreSQL `arrival` suite on a disposable database: 1 passed in 1.86s. Covers
  signup-only pending status, scenario players without the scene, out-of-band and
  foreign-planet rejection, idempotent look and completion writes, and Galaxy
  delivery of the chosen look to another player.
- `cargo test -p orbit-storage-postgres --lib`: 10 passed, including the embedded
  migration bundle. `cargo test -p orbit-transport-http`: 73 passed.
- `cargo fmt --check` and workspace Clippy with `-D warnings`: passed.
- `npm test`: 158 files, 1,467 tests passed. TypeScript, ESLint, Prettier and
  `scripts/check-contracts.mjs`: passed.
- New `arrival.spec.ts` at 1280px and 390px: 2 passed (module preparation 1.9s,
  runner 2.5s). Affected specs (arrival, command HUD, release announcement,
  tutorial, tutorial advisor, galaxy cards, planet names, empire, shell, mobile
  selection, empire identity): 262 passed in 4.1 minutes.

## Failures and repairs

- The first `arrival.spec.ts` run failed at both widths: the fixture profile's
  `title` included catalog `access`, which `TitleDisplay` rejects, so the client
  fell back to Commander only. One repair corrected the fixture. No product
  change, timeout, retry or weakened assertion.
- Live walkthrough found the global `animation: none !important` reset disabled
  the fade, flicker and line reveals, and the carousel measured offsets against
  the wrong parent. Both fixed and re-captured.

## Not run

- `make test-signup` (explicit-only) was not run; `signup.spec.ts` now skips the
  intro after signup. The machine's Docker address pools were exhausted, so the
  local universe ran against a separate database in an existing container.

## Visual review

Real signups on a local universe at 1440×900 and 390×844 covered every step,
Skip (lands in Briefing in under a second), and Galaxy showing another player's
chosen look. Screenshots were reviewed and delivered in the implementation chat.
