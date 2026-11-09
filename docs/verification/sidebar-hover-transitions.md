# Desktop sidebar hover transitions

Validated `f496ac849ef09f5cdf6c5c18cbf3bd5edc6adc6d` plus the motion-test update in this commit. The production CSS is unchanged after the inspected desktop (1440×900) and mobile (390×844) captures displayed in the implementation chat.

## Repair ledger

CI run 42555180799 failed the existing `navigation and menus have no motion at 1280px with no-preference` test: it expected zero animations and observed the two explicitly requested sidebar color transitions. The test originated in b66dfdaa. Its history and repository verification notes were inspected; no separate Test Czar ledger was available.

One repair replaces the obsolete blanket expectation with a narrow allowance for desktop sidebar `background-color` and `color` transitions when reduced motion is not requested. It asserts the exact transition properties and 150 ms duration. Mobile and reduced-motion cases still require no transitions; other animation and view-transition checks remain intact. All four existing viewport/preference cases are retained. The shared event and active-animation checks were audited together; no other callers use `uiMotionEvents`.

## Verification

- ESLint, CSS formatting, and 17 navigation unit tests passed before the initial push.
- Initial ad hoc browser verification caught the global transition reset overriding the new CSS. The scoped override fixed that defect; final hover-in/out, intermediate-color, focus, account-menu, reduced-motion, and mobile checks passed (1.82 s preparation, 2.5 s test, 3.1 s runner total). Temporary verification files and processes were cleaned up.
- `npm run test:ui -- shell.spec.ts --grep 'navigation limits motion'`: four passed after the single test repair; 1.88 s preparation, 5.1 s runner total, individual execution 1.6–2.6 s. Server and browser cleaned up normally. No timeout increases, retries, or deleted scenarios.
- Initial CI failed once; no queue enrollment or removal had occurred at repair time. Remote CI and merge timing are recorded in the PR and originating chat.
