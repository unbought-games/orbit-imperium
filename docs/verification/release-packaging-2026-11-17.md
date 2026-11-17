# Release packaging gap, 2026-11-17

The image publisher for `211280567cfce0424594393cc25e75e973271880` failed in
run [44118202841](https://github.com/unbought-games/orbit-imperium/actions/runs/44118202841),
job 134162212943, before obtaining publication credentials. The web Docker stage
omitted `packages/`; TypeScript could not resolve the browser renderer and lost
its callback type. Native CI had all checkout files and passed. This is a build
packaging defect, not a flaky test; rerunning unchanged source cannot repair it.

The same gap previously allowed a missing generated analytics-route file between
Docker stages. Commit `d2a283b432a84e832850f83f27ce2d61bb9f4f08` (PR #410,
November 13) repaired that COPY, but did not add pre-merge packaging coverage.

The fix includes shared packages in the web Docker stage. A fast compiler-input
check runs in routine validation: TypeScript source files and relative assets
must be copied into the web stage, and the known generated analytics-route input
must reach Rust. It measured 1.26 seconds locally. Regression tests remove each
of the two COPY instructions and require the appropriate missing-input failure.
This does not attempt to parse Rust conditional compilation or fully interpret
Dockerfile semantics.

Four recent full image builds took 352, 353, 390 and 454 seconds (runs
44107233513, 43975857112, 43963572191 and 43916988930). The owner requested measured
PR overhead, so full packaging is selected only for Docker/ignore, dependencies,
toolchains, build scripts and packaging tooling/workflow changes. Tests verify
ordinary source edits skip that build, packaging edits select it across a merge
group, and absent base evidence selects it. The aggregate gate rejects selected
failed/cancelled/skipped builds and permits only intentional unselected skips.

The image check uses existing Make targets, no publication credentials, no
application startup and no database. Trusted publication still rebuilds every
selected main revision; PR artifacts and caches are not trusted by the publisher.
Full-system acceptance remains explicit. A full Docker build remains the final
check of production compilation; the fast check has narrower coverage.

The repaired web stage passed locally using the pinned Node container on arm64.
Complete linux/amd64 packaging is selected for this PR because it changes the
Dockerfile. PR and merge-group results are retained in GitHub. Local focused
workflow/inspection/history/input checks pass. The complete tooling suite passed
before the reduced-cost selector; it is rerun for the final change.

The owner withheld unfinished feature announcements. The feature note is removed
and its source commit is excluded from generated history. The website companion
change reads the same exclusion list from the exact deployed source revision.
Tests retain a visible fix while excluding withheld work and reject malformed
local editorial data. No new UI behavior is introduced by this repair.
