# Installed app text sizing

Verified on `6eafeb0c` plus the uncommitted installed-app text-sizing changes and
report timestamp layout changes in this checkout.

The global stylesheet disables text inflation for the manifest's standalone
display mode and the existing iOS Home Screen marker. Ordinary browser tabs
retain automatic adjustment. No additional zoom restrictions were introduced.
This is an explicit presentation policy; the original production font mismatch
has not been reproduced on the owner's device.

## Validation

- `ORBIT_TEST_SCREENSHOTS=1 npm run test:ui -- web-app.spec.ts -g 'applies zoom prevention' --workers=1`:
  three passed, preparation 4.224s and browser execution 5.3s. Existing application
  startup tests exercise installed iOS, ordinary iOS, and other browser modes,
  including unchanged gesture behavior. Installed detection is simulated through
  `navigator.standalone`; this is not an actual iOS installation test.
- Desktop (1440x844) and mobile (390x844) full-page application captures were
  inspected. Ordinary browser captures were also retained locally.
- The report-readability component scenario passed with the new global CSS:
  1.3s execution, in a run with 4.119s bundle preparation.
- Formatting of the changed stylesheet, report component test, and build note,
  plus whitespace checks, passed. No full build or full-system acceptance run.
- Before PR publication, `npm run lint`, `npm run format:check`, and
  `npm run test:component-types` passed. The implementation remained unchanged
  from the focused browser runs above.
- Runners cleaned up their owned servers, browsers, and temporary bundles.
  There was no external runner queue; runner overhead is included in execution.

## Failed attempts and coverage disposition

A new component experiment attempted CDP emulation of `display-mode: standalone`.
The browser did not activate that media feature, so the prerequisite assertion
failed. That unsupported test was removed, with no retries or product changes to
accommodate it. The standard media-query branch is not runtime-tested; installed
iOS scoping is retained in the existing application startup tests.

The first added application assertion expected computed text adjustment `none`.
An isolated Chromium probe showed that this engine serializes authored `none` as
the equivalent `100%`. The assertion received one repair to use that computed
value; all three application cases then passed. Initial application preparation
was 4.296s and execution was 9.9s (one failed, two passed). Diagnostics for both
failed attempts were preserved under local `test-results/text-sizing-diagnostics`.
