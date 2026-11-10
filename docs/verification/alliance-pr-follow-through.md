# Alliance PR follow-through

PR #386 initially tested head `5da62f2d532270645e128e53f0dcac872b689ce7`.

## Production build-note repair

CI run `42903974249`, attempt 1, job `130137149623` (Browser tests, journeys)
failed in `make test-homepage-built` before browser execution: the news builder
rejected three newly added Markdown notes without required YAML frontmatter.
This was an authored-content/build defect, not a flaky test. Added stable IDs,
titles and dates to the Applications, Settings and Audit notes.

Local `make test-homepage-built` passed with this repair: Vite client build 4.06s,
SSR build 372ms, built-homepage preparation 316ms, 10 browser cases in 3.6s.
The earlier news/routes/TypeScript preparation was not separately timed. No
assertions, tests, runner limits or protections were changed.

## Automated review disposition

Thread `PRRT_kwDOVRgPYs616E2U` reported that EditPost defaults omitted fields to
empty strings rather than preserving their old values. That is the explicitly
requested and documented replacement behavior, not a partial-update contract:
CreatePost and EditPost default omitted title/body to empty strings, while both
blank is rejected. The editor sends both values. The existing engine test
`omitted_notice_fields_default_to_empty_strings` verifies replacing a body-only
notice with a title-only notice clears the body. OpenAPI documents the defaults.
Audit records the resulting title; it does not claim the old title still exists.
No semantics were changed to accommodate this finding.
