# Alliance presentation verification

Date: 2026-11-10. Branch: `emick/alliance-identity-recruitment`.
Base: `ea180d7f038c2d6a8e7f96a8b724f356513efb3c` (merged alliance management work).
Fetched `origin/main` and rebased before implementation; no change was needed.
Validation was local against the uncommitted implementation, not a deployed release.

Final source SHA256:
`e7ad4f1b3e74f5a98dfef1dcfd35c785959d43ff19d3260829ccbae6cb924e54`.
Reproduce by sorting the unique NUL-delimited paths from
`git ls-files -co --exclude-standard -z`, omitting `docs/` and missing files,
and hashing each path, NUL, file bytes, NUL in sequence. Documentation is excluded
so this record can identify the tested source without a self-reference.

## Delivered behavior

- Free alliance-owned identity and uploads, delegated through EditProfile.
- Hall as the alliance landing page, private welcome/community prose, existing
  noticeboard, and retained navigation without the planet/resource strip.
- Three responsive public templates, per-template versioned JSONB documents,
  Markdown/autolinks, retained inactive content, form editing and fullscreen preview.
- Shared crest composition/upload, banner positioning, palette, media library,
  current affiliation/discovery/ranking identity, and downloadable recruitment card.
- Durable recruitment intent through local signup/account enrollment into the
  arrival sequence, with explicit join/apply and continuation while approval is pending.
- Filesystem and S3-compatible delivery, bounded image processing, preserved
  GIF/WebP animation, still posters, immutable writes, quotas and explicit cleanup.
- Additive migration 0042, OpenAPI/generated client contracts, compatibility
  projections for older clients, operator guidance and a feature build note.

## Automated validation

| Check | Result | Evidence / execution time |
|---|---|---|
| `make check` | Passed | `/tmp/orbit-alliance-check-final.log` |
| Tooling within check | 130 passed; 1 existing skip | 131 total |
| Client within check | 1,772 passed in 193 files | 8.21 s |
| Native within check | 776 passed | 53.095 s |
| Bridge within check | 50 passed | 2.511 s |
| Storage library within check | 10 passed | 0.020 s |
| Final PostgreSQL suites | 32 passed: alliances 15, arrival 1, alliance_identity 1, insignias 1, rankings 2, bots 12 | `/tmp/orbit-alliance-db-complete.log`, `/tmp/orbit-alliance-db-rankings-bots.log` |
| Asset adapter tests | 7 passed, including signed S3-compatible immutable PUT/single-object DELETE and bounded file reads | `/tmp/orbit-alliance-assets.log` |
| Final image codec tests | 4 passed, including GIF/WebP timing, metadata removal, focal cropping and skinny input bounds | `/tmp/orbit-alliance-final-images.log`; 0.94 s |
| Public projection tests | 5 passed, including unsupported-template privacy fallback | `/tmp/orbit-alliance-projection.log` |
| Retained alliance component cases | 23 passed | `/tmp/orbit-alliance-components.log` |
| Existing alliance/recruitment/arrival journeys | 15 passed | `/tmp/orbit-alliance-journeys.log`; 16.9 s |
| New editor and arrival journeys | 2 passed | `/tmp/orbit-alliance-new-journeys.log`; 2.9 s |
| Arrival after final form styling | 1 passed; application and pending screenshots refreshed | `/tmp/orbit-alliance-arrival-final.log`; 1.8 s total, 1.2 s test |
| Final clippy | Passed with `--features orbit-server/test-support` | `/tmp/orbit-alliance-clippy-complete.log`; 5.19 s |
| Final frontend format, lint and production build | Passed | `/tmp/orbit-alliance-{format,lint,build}-complete.log`; Vite 4.30 s, prerender 0.282 s |
| Contract drift and transport boundaries | Passed | `make check`, `/tmp/orbit-alliance-contracts.log` |
| Companion asset IAM source | Terraform init/validate and 1 mocked policy test passed | `/tmp/orbit-alliance-infra-{init,validate,test}.log`; not applied |

The broad check preceded the final bot-media gate, share-card crop test, rankings
expectation update and arrival form styling. The affected database, codec,
browser, clippy, type/build and lint checks above passed after those changes.
No routine CI deadlines or retries were added. No CI/merge queue was invoked.

Final database suite execution times were 53.004 s (alliances), 2.408 s (arrival),
3.757 s (identity), 4.097 s (insignias), 5.015 s (rankings), and 11.805 s (bots).
Initial database compilation was 24.59 s. One subsequent runner waited on the
dev-server build lock (8.48 s combined compile/wait); its separate wait duration
was not measured. Earlier native preparation phases were 56.54, 49.10 and
17.94 s. End-to-end work and merge delay were not measured; there was no merge.

## Failures and disposition

- Docker's default address pools were exhausted. Explicit unused subnets isolated
  this task's dev and test projects; no unrelated project was pruned.
- Two newly authored responsive template tests had selector defects. Following
  one repair, they failed again on ambiguous content matching and were removed
  under the repository rule. Details and retained coverage are in the
  [repair ledger](../runbooks/test-performance-audit.md). Deterministic template
  content/gallery coverage and actual desktop/mobile visual review remain;
  neither is represented as an automated layout assertion.
- S3 deletion exposed a real adapter compatibility defect: the library used the
  bulk-delete API. The adapter now uses ordinary single-object deletion. The
  original regression test was retained and passed.
- Legacy recruitment deep links exposed competing route redirects and an actual
  browser render loop. Canonical routing now has one owner. Existing journey
  protection was retained and passed; diagnostic runs interrupted while locating
  the loop are not counted as successes.
- The new editor fixture lacked the canonical free symbol required by the crest
  composer. Corrected the fixture; the first repaired run passed.
- Existing exact header/response assertions were updated for the presentation
  extension. The final rankings failure was an old application-level field list;
  added `presentation` and explicit absence checks for Hall/inactive templates.
  Both rankings tests then passed. Legacy HTTP projections remain tested separately.
- The two independently authored free stripe assets were explicitly added to the
  cosmetic distribution allowlist; restricted-content checks were retained.
- The WebP fixture's encoder produced 254 for an authored 255 channel. The test
  now compares normalized output to the original decoded frame buffers while
  retaining timing/frame/metadata assertions; its first repair passed.
- An ad hoc clippy invocation omitted the repository's required test-support
  feature and could not compile test-only APIs. The correct Makefile-equivalent
  invocation passed; this was a command configuration error, not a product failure.
- Final visual review found native styling on the arrival application field.
  Added a shared Textarea control, reset the local fieldset border, reran the
  arrival journey and refreshed desktop/mobile captures.

## Visual review

Inspected the actual local application on desktop and at 390 × 844, including
the Hall/noticeboard, identity composer, private Hall editor, all three public
templates, public editor/preview, media library, compact members, discovery,
rankings and the 1200 × 630 downloadable card. Verified save/reload, per-template
content retention, reverted-edit pruning, disabled deletion for referenced media,
and pinned notice behavior. Public/editor/Hall captures use the real API and
PostgreSQL in the isolated development world. Arrival captures use the real
application components/router with controlled HTTP fixtures, not a live signup.

Named captures are retained in the originating chat's local visualization
`implementation` directory and displayed there, not uploaded to a PR. Most
desktop viewports are 1440 × 1000; the Citadel desktop full-page capture is
1280 pixels wide. Full-page captures extend beyond viewport height and retain
fixed game controls at the captured scroll position. These are implementation
captures, distinct from the earlier design study.

## Cleanup and release boundary

The disposable `orbit-alliance-validation-5934` PostgreSQL Compose project,
network and volume were removed after the tests. Individual database runners
also dropped their isolated databases. Task-owned interrupted test processes
were stopped; the unrelated local world was left alone. The development preview
at `http://localhost:55395` remains available with local sample alliance content.

No production migration, IAM apply, deployment, PR, push or external announcement
was performed. Official hosting needs the companion reviewed IAM source applied
before uploads, migration 0042 and matching API/frontend, followed by production
upload/private-public/deletion verification. Self-hosters use the same storage
contract and [operator guide](../operations/alliance-customization.md).
