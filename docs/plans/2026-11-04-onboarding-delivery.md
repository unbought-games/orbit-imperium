# Chapter onboarding delivery

Status: **all six chats complete; implementation and integrated acceptance passed.**
Root verified the final source manifest, canonical image hashes and cleanup after
Chat 6's supplemental nonoptimal-spend experiment. No required work remains in the
authorized three-chapter scope.

## Delivered behavior

- Three economy-first chapters with 27 earned objectives, authored explanations,
  staged automatic homeworld rewards and recommendations across independent queues.
- Players build useful mines, power, Robotics, laboratory, research, shipyard,
  Light Fighter and Small Cargo through ordinary game commands.
- Two personal near-orbital opportunities use real fleets, explicit NPC combat,
  finite ordinary plunder, physical cargo and actual return/reinvestment. Retired
  targets retain flight/report identity. Site debris is real but not collectible.
- Beginner presentation progressively exposes the interface and always offers full
  access. Existing empires and bots remain full-interface; equivalent normal play
  earns the same milestones. Mode changes produce no rewards or flight effects.
- Shared receipt acknowledgment works while players remain on progression screens.
  History reflects already-paid resources and offline completion, with no claim bank.
- Site dispatch, NPC inbox/detail, returning fleets, reinvestment/completion,
  loading/error/recovery states and mobile HUD layout are implemented and captured.

## Reusable systems and boundaries

Objective definitions, causal evidence, grant identities, private site definitions,
placement, source stock/force history, NPC participants and fleet operations are
separate reusable boundaries. Tutorial content is their only initial gameplay
consumer. No fake player accounts or second movement/reward ledger was introduced.
Later mechanics and live definition migrations remain explicit additive work;
later defense/espionage/colonization chapters and campaign content are not included.

New-universe speed defaults to 3x. Saved universe speeds stay unchanged. Actual
guided execution reaches reinvestment in 58.92 minutes at 3x and 86.90 at 2x, using
normal production/timers, early Robotics2/Shipyard2 and parallel queues. Initial
resources are exactly 1000 metal, 1000 crystal, zero deuterium; no ships or research
are gifted. Both paths continue to another mine upgrade without another grant.
These measured automated timings exclude human reading/clicking time.

The same objectives complete via ordinary player targets without introductory-site
issuance. Exact measured budgets, loot, flights and assumptions are in the
[Chat 4 report](2026-11-04-chat-4-tutorial-report.md).

## Activation and operations

No live universe was enabled or deployed. Existing and fresh worlds stay disabled
until the supported maintenance activation command is run with upgraded binaries:

```sh
orbit tutorial activate --universe UUID --all-binaries-ready
```

Follow the [operator guide](../operations/onboarding.md). Activation is fenced,
transactional and idempotent, preserves accepted work, expands dependencies and
invalidates old claims. Newly enrolled human/bot lifecycle work has complete scopes.
Do not substitute raw SQL activation or a rolling old-writer mixture.

## Implementation and review record

- [Chat 1 objectives report](2026-11-04-chat-1-objectives-report.md)
- [Chat 2 site report](2026-11-04-chat-2-sites-report.md)
- [Chat 3 fleet report](2026-11-04-chat-3-fleet-report.md)
- [Chat 4 content, activation and balance report](2026-11-04-chat-4-tutorial-report.md)
- [Chat 5 experience, visual and repair report](2026-11-04-chat-5-experience-report.md)
- [Chat 6 final acceptance report](2026-11-04-chat-6-validation-report.md)

The final UI report identifies the canonical desktop/mobile screenshots separately
from provisional/duplicate artifacts. Root inspected opening, earned receipts,
briefing, NPC report, focused history and launch-review states during implementation.
Screenshots are local rendered fixtures; economic proof comes from real engine/
PostgreSQL journeys, not simulated browser time.

## Final acceptance

- `make check` passed with pinned Node 24.18.0/npm 11.16.0: **124 tooling tests**
  (one explicitly gated Docker check skipped), **1,346 client tests**, **776 backend
  tests**, Clippy, formatting, lint, contracts, boundaries and production build.
- **66 distinct PostgreSQL tests passed** across the final selected suites and
  focused activation/rollback/idle-cleanup assertions. **24 retained browser tests
  passed**, with affected client/static/build checks rerun after the final focus fix.
- Six real-signup economic cases completed: guided and independent play at 2x/3x,
  plus buying an unnecessary Metal Storage 1 before Robotics at both speeds. The
  extra purchase cost exactly 1,000 metal, added 10.5 minutes at 2x and 6.5 minutes
  at 3x, and changed neither the 27 milestones nor grants/loot. Reinvestment finished
  at 97.40/65.42 minutes; both continued to Mine 10 without another grant.
- F1 dynamic participant scopes, F2 site-flight empire deletion, F3 idle-newcomer
  cleanup scopes and F4 mobile keyboard escape visibility were fixed and verified.
  Final pointer and keyboard escape/history interactions were inspected directly.
- All **58 canonical desktop/mobile images** across 29 states were inspected by the
  implementation/review team. Root inspected key states and the final focus fix,
  and verified every image hash against `test-results/chat-6/canonical-screenshots.json`.
- Task PostgreSQL services, networks, volumes, browsers and Vite/test processes were
  cleaned. Existing development resources were untouched; normal caches and ignored
  local evidence remain.

Failures and test retirements are recorded in the Chat 4–6 reports. Oversized or
twice-failed broad scenarios were removed under AGENTS, with useful protection
retained at smaller boundaries. Their historical successes are not counted as
current passing tests. Manual UI interaction/capture checks are distinguished from
retained browser regressions. No full-system/container/recovery/rolling-deployment
acceptance or human pacing study was claimed.

Final base: `a4b2dcab0847182244c0afae1f5783c6a9a27b33` plus **141 changed/untracked
non-doc source files**. Final fingerprint:
`dc7e33ca1161c43c3681c3815a66493a71b8a1f5573bbb3e53d62982dbc7542e`.
It is SHA-256 of compact sorted-key JSON mapping relative paths to byte SHA-256;
the exact manifest is `test-results/chat-6/source-manifest.json`. Root independently
recomputed and matched it after completion. The last changes versus full acceptance
are only the supplemental experiment's Make target and test harness; production,
UI, contracts and captures are unchanged. Its execution/lint fingerprints and
phase timings are recorded separately in Chat 6's report.

The owner subsequently requested commit and push, explicitly without a PR.
The delivery branch is `emick/onboarding-npc-operations`; the 3x-default change is
separate commit `8938d98` and the onboarding implementation/documentation follows
as its own commit. The validated production source is unchanged by packaging.
No PR, merge, live activation or deployment is part of this request.
