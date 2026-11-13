# Timestamp component prototype — 2026-11-13

Scope: standalone shared component and isolated gallery only. No existing game
screen was migrated. This delivers the component foundation, API documentation,
and validation; application-wide adoption remains separate work. No deployment
is included.

Tested base: `7d57e0532827fffe2bde0da65f03e8045b460dda`, with the uncommitted
`apps/web/src/ui/timestamp*`, `use-timestamp-clock.ts`, and
`apps/web/tests/components/timestamp*` additions, plus gallery registration in
`main.tsx` and UI documentation links. API contracts and examples live in
`apps/web/src/ui/timestamp.md`.

## Validation

- `npm test -- apps/web/src/ui/timestamp-format.test.ts`: 5 passed; 169ms total.
  Covers absolute input semantics, exact copies, date rollover, DST repeated
  hours, fractional offsets, countdown expiry and future/past relative wording.
- `npm run test:components -- timestamp.component.spec.ts --workers=1`:
  final run 2 passed; bundle preparation 4,170ms, runner total 2.7s,
  individual tests 781ms and 1.1s. No CI/runner queue was involved.
- `npx tsc --noEmit -p apps/web` and `npm run test:component-types`: passed.
- Focused ESLint on the new source files, Prettier on the new component,
  formatting tests, gallery and API documentation, and `git diff --check`: passed.
- No production build, full application/browser suite or backend validation was
  needed for this isolated frontend component. The test command builds the
  gallery bundle before assertions; this is not a production artifact.

The component tests exercise actual clipboard success in Chromium, denied-copy
fallback, keyboard activation, Escape/focus restoration, UTC selection, a custom
Button trigger, shared controlled selection, actual touch activation, narrow
viewport bounds, one-second updates, expiry and invalid input. No app API is used.

## Failure and repair record

1. First browser run: one passed and one failed. Preparation 4,191ms, runner
   total 7.8s. The picker changed the view and set `aria-expanded=false`, but the
   frozen clock prevented Base UI's animation-frame unmount/focus work. Inspected
   failure DOM, installed Base UI lifecycle code, test history (new test), and
   the repair ledger. Confirmed that advancing animation frames removed the
   closed picker. One test repair explicitly advances 32ms for those lifecycle
   frames; no sleeps, retries, or timeout increases. The next run passed both
   cases (3,997ms preparation, 2.3s runner total).
2. Visual verification revealed a product layout defect: after selecting UTC on
   mobile and copying, the popup could extend above the viewport when the page
   scrolled. Reproduced with a fixed Date but live animation frames (viewport
   intersection 0.9488). Fixed the positioner to use fixed positioning, sticky
   viewport containment and shifting on both axes. Added viewport protection
   after selection/copy and refreshed all captures. Final browser run passed.

The shared gallery build emits an existing mixed JSON import-attributes warning
for `contracts/openapi.json`; it did not fail preparation or assertions.

## Visual review and cleanup

Inspected the running component at desktop 1280×960 and touch/mobile 390×844,
with `en-US` and `America/New_York`. Captures show all default views/styles,
shared/composed controls, expiry and invalid input, UTC selected/copied, and
clipboard-error/manual-copy states. Overview mobile capture is full-page.
Screenshots are retained and displayed in the originating implementation chat,
not uploaded to the repository or PR.

The browser test runner cleaned its temporary build/server and browser processes.
Capture browsers were closed. The task-owned Vite preview remains running at
`http://127.0.0.1:5208/?scenario=timestamp` for the owner's review. No other chat's
server or validation process was stopped. No expensive validation overlapped
another active suite/typecheck/build observed on the machine.

## Simplified time choices

Owner feedback removed the separate coarse Relative mode. The type, picker,
initial default and examples now expose only `countdown`, `local`, and `utc`.
Countdown shows precise future/elapsed time (`in 2m 11s`, `5m ago`, `now`).
Game-specific deadline wording belongs to the caller through the existing
`expired` render value; the fleet preview keeps “Awaiting confirmation”.

Updated unit tests retain future/past/expiry coverage at the precise-duration
boundary. The existing interaction test verifies exactly three display choices
and the past report's text. Both browser cases passed on their first run after
this change. No additional failures or test repairs occurred. All affected
captures were refreshed at both viewport sizes.
