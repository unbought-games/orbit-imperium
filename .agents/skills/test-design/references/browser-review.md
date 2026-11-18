# Independent browser test review

## Launch after writing the tests

The implementer MUST launch a new independent reviewer after authoring or materially changing browser tests (including interactive gallery tests, migrations and fixture/runner changes that alter what cases exercise). Do this before calling the work complete or publishing the final PR revision. A human implementer can request the same review from Codex. Green CI and the implementer's own assessment do not satisfy this gate.

Use the repository role [browser_test_reviewer](../../../../.codex/agents/browser_test_reviewer.toml). Start a new child for each pass. Provide the behavioral requirements, absolute checkout, exact base/head Git object IDs, diff scope and the locations of raw source, fixtures, config, failure artifacts and repair records. Include any uncommitted changes as an exact patch against the stated revision, including new files. Keep implementation arguments, previous verdicts and suggested defects out of the packet. The reviewer must read the files itself.

For a tool exposing `fork_turns`, explicitly set it to `"none"`. Select the custom role if the runtime exposes role selection. On the collaboration surface with only task name and message, use the following call with the placeholders filled in. The task name labels the child. The instruction to load the TOML applies the role on this surface.

```json
{
  "task_name": "browser_test_review",
  "fork_turns": "none",
  "message": "Work read-only in <absolute checkout>. Read and apply developer_instructions from .codex/agents/browser_test_reviewer.toml. Requirements: <behavior>. Base <SHA>, head <SHA>. Inspect git diff <base> <head> -- <paths>, the raw files at head, and <fixture/config/repair evidence paths>. Return your verdict."
}
```

Pass this to `collaboration.spawn_agent` and collect the child's final result. On the local CLI exposing `agent_type`, add `"agent_type": "browser_test_reviewer"` to the spawn arguments and retain `"fork_turns": "none"`. In an interactive client, request “Delegate this packet to a new browser_test_reviewer with no parent conversation history.” Verify the actual spawn used fresh context. If the client only forks full conversations, start a new Codex session in the checkout with **only** the packet and role instructions, and request the independent reviewer there. Do not resume an earlier reviewer. The role is read-only by instruction. Subagents inherit the parent permission mode. Record the concrete blocker if a fresh reviewer cannot run. [Codex custom agent configuration](https://developers.openai.com/codex/subagents)

## Decide each case on evidence

- State the critical user action, owning production path, observable outcome and a specific defect that would escape if this case disappeared. Trace the real control, adapter and consumer. Reject a test which computes its expected answer from the implementation, manufactures the asserted state, or mocks out the decision it claims to test. Check important refusals, recovery and races at the layer that can actually observe them.
- Price the setup. If fourteen fleet launches only prepare toast history, seed the history. Keep one real action-to-notice check. Move arithmetic, expiry and resolution schedules into models/controllers with fixed inputs and held promises. Exercise authorization, replay, exactly-once payment and durable effects against the owning HTTP/database boundary. Preserve unique route entry/history/submission wiring. Use small mounted components for real keyboard, focus, touch and layout.
- Trace the event order. Match the request identity and operation, subscribe before the action, await complete successful delivery, then the rendered result. Headers can arrive before the body or belong to an abandoned document. A clock tick while the old request or React commit is pending changes the schedule. Gate intentional loading or refusal explicitly and settle it before the next phase. Lazy module compilation once consumed the assertion window before a case could start. Use the existing prebuilt fixture and render-ready mount.
- Challenge incidental copy, selector structure, every viewport/item repetition, animation frame and layout read. An intended Briefing animation invalidated a global no-animation assertion. Scope the motion contract. Comparing positions read in different animation/layout phases fabricated a 10px mismatch. Observe settled state and read related rectangles in one browser evaluation. An isolated scene needs the caller's shell/container sizing, semantics and providers.
- Trace unexpected API calls, leaks of handlers/timers/store state and unreleased responses. Fail at the offending method/path/operation. Ask whether a failure distinguishes a broken product from incomplete setup. Screenshots, sleeps, retries and larger timeouts establish no ordering.

## Check what the replacement loses

| Claim to challenge | Evidence the replacement needs |
| --- | --- |
| Two static Bot/Human renders prove refresh | Publish to the same controller while the identity and dossier remain mounted. Observe Bot disappearing and the open dossier updating. |
| A cursor controller test proves recovery is announced | Mount the actual noticeboard screen, expire its cursor, then observe its live region and fresh notices. A copied status wrapper can pass with production markup removed. |
| The pagination model proves buffered HUD behavior | During passive refresh, observe real buffered rows, enabled Load more, focus and busy state. Request an unbuffered page and observe loading, delivery and settled focus. |
| A gallery width assertion replaces whole-page overflow | Show the same containment with the real sizing ancestors. The failed Empire/fleet replacements recurred after restoring the work-area class. The original healthy application checks remain required. |

Consult the [failure policy](failures.md) and the [stream handoffs and gaps](../../../../docs/verification/test-migration-journey-review.md). A filename, layer, fresh agent or shared fixture repair never resets one-repair history. The native touch sequence of swiping then tapping the promoted toast, exhausted whole-page geometry replacements and old profile expiry/outage tours stay retired. Preserve their named gaps. Fix product regressions and keep the tests exposing them.

## Close the review

Report pass, findings or blocked for each reviewed case. For each finding give file:line, case, severity, concrete failure mechanism or redundant cost, contract at risk, smallest correction or cheaper valid replacement, and unique browser protection to keep. List optional improvements separately. Label hypotheses with the evidence needed. Pass when there is no justified finding.

The implementer evaluates findings against source, records disposition (including evidence for disagreements), correction and validation against the exact revision in the PR or verification record. After material test fixes launch another fresh, scoped pass over the changed cases and affected callers, with the updated raw diff. Batch real fixes. After three rounds reassess the remaining evidence with the owner. A quota, speculative churn or a green retry cannot close a real defect. The reviewer stays read-only and coordinates any expensive validation with the designated owner.
