# Combat simulator feedback package

Scope: feedback #144, #145, #154, #156, #167, #175. No launch/Dispatch flow or
moon-balance changes. Base: `7d57e0532827fffe2bde0da65f03e8045b460dda`.

## Findings and behavior

- The simulator iterated catalog order while Fleets used `compareShips`.
  Simulator inputs, allied result manifests and Shipyard now share that order;
  the Shipyard's military/civil grouping also uses the shared classifier.
- Unequal-height setup introductions displaced matching technologies and ships.
  Import controls are now a disclosure above the aligned setup. Nonzero inputs
  have emphasis; the run controls remain reachable through long forms.
- Observed defender forces were always expanded. Native details now default
  known report groups closed, summarize quantities, and expose invalid or
  unobserved values. Manual/unknown groups remain open. Inputs remain mounted and
  editable. Missing/unsupported data and combined force limits remain visible.
- Results previously led with complete loss manifests. They now lead with
  sampled outcomes, cargo/loot, new debris, and moon chance. Detailed loss and
  estimate ranges remain expandable. Average rounds include every battle sample.
- Moon chance is computed with the engine's active-rule function for each
  sample's generated metal/crystal debris, then averaged. The UI shows zero for
  disabled moon rules, moon targets, or planets with existing moons. Report moon
  targets and owned-world imports seed eligibility; external planet occupancy is
  explicitly unknown unless the user supplies an assumption. No live private
  target lookup or resource refresh is introduced.
- Recycler counts use the active recycler cargo capacity capped by the same
  constant used at harvest settlement. Whole harvestable resources are summed,
  the mean field is divided by capacity, then the count is rounded up. The
  largest sampled field is also shown. Existing debris/loaded cargo are excluded.
- Cargo coverage compares each victorious sample's resource loot against the
  engine's unlimited-capacity five-pass loot, avoiding false comparisons of
  average cargo with average loot. Unknown resources remain unknown.
- New response fields are optional in the wire contract for older servers;
  missing rule metadata displays unavailable instead of guessing.

## Validation record

Validation uses this isolated worktree and one browser worker. No other task's
processes or Docker resources were stopped. Browser bundle and test execution
are serialized with full typechecks; process load is checked before each run.

- Baseline observed-report browser scenario: passed (4.857 s preparation,
  3.2 s runner). Desktop/mobile pixels inspected before editing.
- Initial focused client tests: 34 passed. Expanded coverage: 39 passed.
- Server simulation tests: 13 passed; initial dependency build 54.94 s,
  execution 2.69 s. Updated engine helper: 5.97 s build, 2.59 s execution.
- First changed simulator browser suite: all 8 passed (4.401 s preparation,
  21.9 s runner). Covers report and manual setup, import, results, unknown
  resources, blank inputs, hypothetical fleets and unchanged flight integration.
- Static typecheck caught a union-body `moon` property access; corrected the
  import model to identify owned moons by coordinates and added eligibility
  coverage. Subsequent application and component typechecks passed.
- Expanded visual fixture initially failed test collection because Node JSON
  imports lacked attributes. Corrected the fixture import boundary; no product
  assertions failed and no existing test was removed or weakened.
- Final checks/revision and image inventory are recorded below when complete.

Screenshots are local chat artifacts, never hosted or attached to the PR.
Browser tooling cleans up its preview process and temporary build directory.

### Final local pass

- Expanded simulator suite: 8/8 passed; 4.138 s bundle preparation, 23.0 s
  runner. The final capture refresh covers report groups collapsed/expanded,
  unknown intelligence, editable validation summaries, full-catalog manual
  setup, result summaries/details, and owned planet/moon imports. Desktop
  1440×1000 and mobile 390×1000; report overflow also checked at 320px.
- Shipyard component: 1/1 passed; 3.724 s preparation, 1.4 s runner; both
  viewport sizes captured and inspected. One brief overlap with a peer's
  single-worker component run occurred; neither failed and no processes were
  stopped. All subsequent expensive checks remain serialized.
- Raiding arithmetic: 7/7 passed; 15.40 s build, 0.02 s execution, including
  available loot above a single fleet's resource range.
- Visual review identified and fixed a sticky button under mobile navigation
  and stationary satellites displacing paired ship rows. Fresh captures and
  hit-target/row-position assertions verify those fixes.
- Final focused client pass: 40/40 tests, 0.163 s runner. Application and
  component TypeScript, ESLint, generated-contract drift/schema checks,
  dependency boundaries, and focused application Clippy passed. Clippy took
  23.05 s. Formatting found one test-file style discrepancy; Prettier corrected
  it and the format check passed afterward. No product behavior changed.

The commit containing this record is the locally tested source revision;
format-only test normalization and this evidence text followed the last browser
run. The originating PR records CI results against the pushed commit SHA.
