# Simulator inline outcomes

Base revision: `6eafeb0c`, plus the uncommitted simulator changes in this checkout.

Ship and defense inputs reserve an outcome column before a run. Current results
show average remaining units under a repeated Remaining heading. Editing the
draft clears the column back to placeholders. Technology inputs have no outcome.
The column width is reserved before and after a run, including on phones.

The simulation API combines fleets by side. Inline outcomes therefore use the
combined side results, with an explicit note when allies are present, and are
shown beside the main side's unit list rather than attributed to individual allied
owners. Defense outcomes precede repairs. The existing detailed results remain
available. The owned-world import overlay retains its original closed default
and positioning.

## Validation

- Focused Vitest: `simulation-unit-outcomes`, `combat-simulation-model`, and
  `simulation-allies`: 37 passed (313 ms) during implementation. The final
  remaining-only model tests passed all 3 cases (215 ms).
- `npm run test:ui -- combat-simulation.spec.ts --workers=1`: 7 passed after
  the final remaining-only adjustment; bundle preparation 5.581 s, runner 23.0 s.
  Screenshots enabled for local inspection. No runner allocation or merge queue.
- Existing standalone journeys compare every draft row's document position and
  size, and input position and width, before results, after results, and after
  invalidation, at 1440 and 390 pixels. They also verify remaining counts,
  combined allied scope, unused-unit zeros, visible Remaining headings and the
  absence of a Lost column. Per-row labels are retained
  for assistive technology and tooltips while only numbers are drawn.
- Existing report journeys verify labels do not overlap inputs at 1440, 390 and
  320 pixels. Assertions for the removed Lost column were replaced by an
  absence assertion; the remaining-value and layout checks are retained.
- TypeScript, focused ESLint, Prettier and `git diff --check` passed. The first
  typecheck found missing account/epoch fields in the new typed test fixture;
  these were added before the successful check. No browser assertion failures
  or test repair retries occurred.
- Visually inspected the running local game before and after simulations at
  desktop and mobile widths. The 320-pixel inspection exposed crowded labels;
  the final remaining-only column gives labels more room and permits long names
  to wrap. Final captures are delivered in the chat.

The fixture runner cleaned up its temporary bundle and preview server. The
user-requested local development game remains running in the in-app browser.
