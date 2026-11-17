# Ship customization first slice

Implementation in progress. Final acceptance and UX review occur on the integrated
PR before merging. No production deployment is included.

## Scope

Development-only Light Fighter Shipyard/hangar, named paint and current empire
emblems, independent empire identity, durable account designs and universe equipment,
asynchronous UUID render artifacts, replaceable deterministic renderer, fleet
inventory presentation. The accepted source study is preserved in tools/ship-livery.

## Integration checks

- `5122b4df`: four client controller checks pass (249 ms reported total). Cover
  earlier reads arriving after a mutation, uncertain request identity, new submission
  while a bake runs, poll completion, and disposal. Scoped ESLint/formatting pass.
- Dependency setup: npm ci installed the pinned dependencies in approximately 3 s.
  An initial test invocation before dependency installation could not locate Vitest;
  no assertions executed in that attempt. It was rerun after setup.

Pending: integrated compile, focused runtime/backend/storage checks, browser
interaction and screenshots, actual local persistence/render flow, production
flag-off build, CI and actionable review. Do not interpret this file as readiness
until results below replace this pending list.
