# Sensor Phalanx player flow validation

Local branch: `emick/sensor-phalanx-player-flow`, based on
`5fe96480f55d48d1ff7c5469b38335a209a932d1`.
Implementation revision: `9488c28c4cdd442a87a855d5d500dca449bdedf1`.
Final tested source tree (including report-test registration):
`1f9c8565e2935801a67a6798f0f153575b177841`. Checks ran against the matching
working-tree contents before these local commits; this note is documentation only.

## Changes

Standard rules enable moon-only Sensor Phalanx with Lunar Base 1 prerequisite,
20,000/40,000/20,000 base resources and doubling costs. Catalog validation now
permits that lunar building. No deployment gate, process registry or backend
privacy changes were added. Deploy everywhere, then use normal rules upgrade.

Facilities explains completed range and local scan cost and links to Galaxy.
Galaxy presents explicit paid scan confirmation and original-command recovery.
The foreground presence binding uses the source moon. The committed receipt
links directly to its immutable report. History uses saved names, exact manifests
and only each supplied deadline; navigation and reload never buy observations.

## Validation

- Standard rules: 16 passed; final compile/setup 2.88 s, execution 0.66 s.
- Pure phalanx engine: 12 passed; execution 0.03 s.
- Command phalanx engine: 3 passed; compile/setup 1.23 s, execution 0.03 s.
- Existing lunar progression: 7 passed; execution 0.07 s.
- New construction regression: 1 passed; compile/setup 1.85 s, execution 0.02 s.
- Frontend eligibility, historical rendering and adjacent report tests: 48 passed
  in four files; final total 0.627 s (Vitest reports import/transform/test shares).
- TypeScript, ESLint, Prettier and `git diff --check`: passed.
- Browser fixture flow at 1440×900 and 390×900: 2 passed. Final module
  preparation 1.842 s, browser runner total 9.2 s; individual tests 4.5/4.0 s.
  Exercises explicit spend, source binding, receipt navigation, free historical
  reload, manifests, responsive overflow and facility quote rendering.

Screenshots were captured and inspected for scan confirmation, historical report
and facility upgrade details at both viewport sizes. They remain local under
`test-results/phalanx-{scan,report,facility}-{1440,390}x900.png` and are displayed
in the implementation chat. Screenshots are not hosted or attached to a PR.

This is engine/unit and fixture-backed browser validation, not a fresh PostgreSQL
integration or full-system acceptance run. Earlier backend evidence remains in
the existing phalanx review documents. Production was not inspected or deployed.

## Failed attempts and diagnosis

Initial standard-rules execution had 14 failures because catalog validation still
rejected enabled Sensor Phalanx on moons. After correcting that implementation,
three existing fixture expectations still needed the new prerequisite/building:
a historical Lunar Base removal fixture must also disable its dependent Phalanx,
the lunar industry fixture must retain lunar-only classification, and the expected
added-building list must include Phalanx. Final standard-rules checks passed.
No engine tests were removed or assertions weakened.

Four browser development runs were interrupted while diagnosing the initial
incomplete Galaxy fixture (one position rather than the contract's required 15).
A subsequent run failed both viewport cases because a broad report route mock
intercepted the HTML navigation on reload. The single repair scoped that mock to
the API and response listeners to POST; both viewports passed. The test is new,
so it has no prior repair history. Existing fixture patterns and git history were
inspected; no separate Test Czar ledger was found in this checkout. The new mock
is local to this test; no shared fixture change or follow-up owner is needed.

TypeScript also caught an unnarrowed protocol-2 body union and an incomplete unit
fixture cast; both were corrected. A newly added `.test.tsx` file was not selected
by this repository's Vitest configuration; it was converted to `.test.ts` and its
two historical-rendering checks passed in the final 48-test run.

Runner waiting was not separately instrumented beyond the reported runner total.
There was no PR/merge queue, so queue wait and merge delay are not applicable.
Browser runners closed their disposable Vite/browser processes. No database or
Docker project was created. The originating checkout was not touched.
