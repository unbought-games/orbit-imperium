# Tutorial and settings test migration

Base: `a119915ffaeb881a7f54d65542478f4788bd4210`.

## Scope and status

This group extracts real presentation boundaries for vacation, deletion,
chapter disclosure, objective cards and the beginner-mode confirmation. Their
connected wrappers retain the application's authoritative stores and command
coordinator. `SettingsAction` owns only local submission/error state; eligibility,
receipt status and timing remain pure projections of current game state.

The 44 original expanded scenarios below have explicit dispositions. Advisor
and tutorial navigation cases remain required application tests because they
exercise actual shell/HUD retention, route transitions or authenticated restored
sessions. They have not been relabeled as component tests or made nonblocking.

The component stories only supply prepared props and record callbacks. Fixture
buttons represent delivered authoritative snapshots; they do not claim to test
server authorization or persistence. Nine settings tests exercise production
submission/selection logic with controlled promises and timestamps. Existing
tutorial model/advisor tests retain progression/reward ordering and title rules.

## Parent integration

Register these exports from
`apps/web/tests/components/tutorial-settings.scenarios.tsx` in the shared gallery:

| Scenario | Export |
|---|---|
| `settings-vacation` | `VacationScenario` |
| `settings-deletion` | `EmpireDeletionScenario` |
| `tutorial-chapters` | `TutorialChaptersScenario` |
| `tutorial-experience` | `TutorialExperienceScenario` |
| `tutorial-reward` | `TutorialRewardScenario` |

Commit `d71d0a2a` supplies source seams, deterministic tests and 13 isolated
component cases. The following migration commit consolidates application
scenarios. Apply its removals only after the component cases pass in the
integrated harness. Playwright inventory collection confirms 32 retained application cases and 13
component cases, compared with 44 original application cases. Inventory collection
is not browser execution. Original test lineage and any prior repairs carry forward.
No failure-driven deletion or repair-budget reset is claimed here.

## Original scenario dispositions

`WIDTH` means the viewport already named in the original case. Full titles are
retained below; the original cases in these four files have no duplicate titles.

| File | Original scenario | Disposition | Retained/replacement coverage |
|---|---|---|---|
| `empire-deletion.spec.ts` | request and cancel empire deletion 1280px | Consolidate / component | Keep 390px application journey for request/presence/notice/navigation/cancel wiring; component `empire deletion review, pending state and cancellation at 1280px` retains desktop confirmation/focus/overflow. |
| `empire-deletion.spec.ts` | alliance leader blocker 1280px | Move component / deterministic | `empire deletion leader, rejection and inactivity controls at WIDTHpx`; `settings-action.test.ts` — account-scoped command mapping, own keep-presence attempt, authoritative rejection explanations. Keep 390px real sign-in rejection journey. |
| `empire-deletion.spec.ts` | recent sign-in rejection 1280px | Move component / deterministic | `empire deletion leader, rejection and inactivity controls at WIDTHpx`; `settings-action.test.ts` — account-scoped command mapping, own keep-presence attempt, authoritative rejection explanations. Keep 390px real sign-in rejection journey. |
| `empire-deletion.spec.ts` | automatic inactivity warning 1280px | Move component / deterministic | `empire deletion leader, rejection and inactivity controls at WIDTHpx`; `settings-action.test.ts` — account-scoped command mapping, own keep-presence attempt, authoritative rejection explanations. Keep 390px real sign-in rejection journey. |
| `empire-deletion.spec.ts` | request and cancel empire deletion 390px | Retain application | `empire-deletion.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `empire-deletion.spec.ts` | alliance leader blocker 390px | Move component / deterministic | `empire deletion leader, rejection and inactivity controls at WIDTHpx`; `settings-action.test.ts` — account-scoped command mapping, own keep-presence attempt, authoritative rejection explanations. Keep 390px real sign-in rejection journey. |
| `empire-deletion.spec.ts` | recent sign-in rejection 390px | Retain application | `empire-deletion.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `empire-deletion.spec.ts` | automatic inactivity warning 390px | Move component / deterministic | `empire deletion leader, rejection and inactivity controls at WIDTHpx`; `settings-action.test.ts` — account-scoped command mapping, own keep-presence attempt, authoritative rejection explanations. Keep 390px real sign-in rejection journey. |
| `tutorial-advisor.spec.ts` | out-of-order lab completion continues to Energy Technology and Briefing has no receipt block 1440 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | out-of-order lab completion continues to Energy Technology and Briefing has no receipt block 390 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | Metal Mine first visit explains production without moving the orb or issuing orders 1440 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | Metal Mine first visit explains production without moving the orb or issuing orders 390 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | confirmed briefing reward opens the orb, toggles, and navigates to the next job 1440 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | confirmed briefing reward opens the orb, toggles, and navigates to the next job 390 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | unseen offline rewards and final job remain celebratable in the full interface | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | energy-first briefing opens Solar Plant before mines 1440 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | production review completes explicitly without changing allocations 1440 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | energy-first briefing opens Solar Plant before mines 390 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial-advisor.spec.ts` | production review completes explicitly without changing allocations 390 | Retain application | `tutorial-advisor.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | later-queue recommendations and offline completion without reward history 1440 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | later-queue recommendations and offline completion without reward history 390 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | guidance failure keeps Overview and Briefing reachable and ordinary pages stay clean 1440 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | guidance failure keeps Overview and Briefing reachable and ordinary pages stay clean 390 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | first deuterium directive reveals Facilities under Develop 1440 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | first deuterium directive reveals Facilities under Develop 390 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | Briefing navigation preserves the original command HUD and issues no orders 1100 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | Briefing navigation preserves the original command HUD and issues no orders 390 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | opening More keeps messages reachable and promotes navigation with progress 1100 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | opening More keeps messages reachable and promotes navigation with progress 390 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | overview briefing shrinks after one accomplishment and orb keeps its link until completion 1440 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | overview briefing shrinks after one accomplishment and orb keeps its link until completion 390 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | chapter headings disclose independently with keyboard and reduced motion 1440 | Split component / application | `tutorial-settings.component.spec.ts` — same disclosure title; application becomes `chapter links navigate to the actual catalog without issuing orders WIDTH`. |
| `tutorial.spec.ts` | chapter headings disclose independently with keyboard and reduced motion 390 | Split component / application | `tutorial-settings.component.spec.ts` — same disclosure title; application becomes `chapter links navigate to the actual catalog without issuing orders WIDTH`. |
| `tutorial.spec.ts` | full experience confirmation preserves briefing progress and rewards 1440 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | full experience confirmation preserves briefing progress and rewards 390 | Retain application | `tutorial.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `tutorial.spec.ts` | briefing distinguishes rewards from a legacy directive's next upgrade shortfall 1440 | Move component | `tutorial-settings.component.spec.ts` — same title; `tutorial/model.test.ts` — quoted higher upgrade and generic shortfall tests retain arithmetic/legacy state. |
| `tutorial.spec.ts` | briefing distinguishes rewards from a legacy directive's next upgrade shortfall 390 | Move component | `tutorial-settings.component.spec.ts` — same title; `tutorial/model.test.ts` — quoted higher upgrade and generic shortfall tests retain arithmetic/legacy state. |
| `vacation.spec.ts` | vacation review, commitment, minimum and return at 1280px | Retired on main | PR #384 retired this desktop variant after recurrence. Preserve that retirement when integrating main; see the November 10 queue-startup ledger. |
| `vacation.spec.ts` | vacation blockers and a changed server decision at 1280px | Move component / deterministic | `tutorial-settings.component.spec.ts` — `vacation blockers and rejection remain reviewable at WIDTHpx`; `settings-action.test.ts` — current eligibility and authoritative rejection explanations. |
| `vacation.spec.ts` | vacation review, commitment, minimum and return at 390px | Retain application | Retain main's surviving mobile command/production/HUD journey, tagged `@journey`, after PR #384 retired the desktop variant. The isolated vacation confirmation case still covers focus/overflow, and selector tests retain the exact deadline. |
| `vacation.spec.ts` | vacation blockers and a changed server decision at 390px | Move component / deterministic | `tutorial-settings.component.spec.ts` — `vacation blockers and rejection remain reviewable at WIDTHpx`; `settings-action.test.ts` — current eligibility and authoritative rejection explanations. |
| `vacation.spec.ts` | vacation clears confirmation on the same mounted Settings page at 1280px | Consolidate / component | Keep the 390px application journey for connected same-mount reconciliation; isolated confirmation test at 1280px retains review reset/focus. |
| `vacation.spec.ts` | vacation clears confirmation on the same mounted Settings page at 390px | Retain application | `vacation.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |
| `vacation.spec.ts` | capture only dismisses replacement notifications when evidence is enabled | Retain application | `vacation.spec.ts` — same scenario; unique application wiring, navigation or notification lifecycle remains browser coverage. |

## Validation and limitations

- Pinned Node 24.18.0. Initial six deterministic settings cases passed in 1.44s.
  Expanded settings/tutorial model/advisor validation: 36 tests across three
  files passed in 0.903s. Settings now contributes nine cases. No retries.
- Scoped ESLint and whitespace checks passed.
- Initial full TypeScript check found a new test-fixture use of
  `Promise.withResolvers`, unsupported by the project's ES2022 library target.
  Replaced it with an explicitly resolved promise. This was an authoring/type
  error, not intermittent test behavior. Two subsequent typecheck processes
  were deliberately interrupted (exit 130) on the parent's host-load request;
  those are incomplete checks, not passes.
- Parent integrated the foundation as `d5acb535` and reported all 13 component
  cases passing on their first attempt in 16.3s with one worker. Evidence is
  retained in the parent's `test-results/test-strategy/tutorial-settings-first`.
  This satisfies the replacement-coverage prerequisite for the consolidation
  commit; it does not establish the retained application journeys or final build.
- Parent requested no new browser/build/typecheck processes while host load was
  45.5 on 12 cores. Retained application cases, final TypeScript checks and
  desktop/mobile visual captures remain with the parent's serial integrated
  validation. No visual-validation pass is claimed here.
- Temporary harness registrations/configuration copied into this isolated
  worktree are not part of the commits. No database/container was started.
  All task-owned typecheck processes were stopped; no browser/server was started.


## Integrated verification

The parent integrated this group and completed serial validation. See the
[combined verification record](test-strategy-overhaul.md) for final inventory,
passing runs, repairs, retained failures, visual evidence and cleanup. Earlier
“pending parent validation” entries above describe the historical handoff.
