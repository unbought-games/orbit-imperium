# Orbit Imperium technical documentation

Orbit Imperium is a browser-based space strategy game with an authoritative Rust server, a TypeScript/React client, and PostgreSQL persistence. These guides describe development, operation, and the public implementation contracts.

## Getting started

- [Project README](../README.md): playing, community, beta status, and self-hosting quickstart.
- [Development and self-hosting](development.md): prerequisites, local setup, builds, and tests.
- [Signup and production setup](operations/signup.md): admission, homeworld placement, and deployment configuration.
- [Universe configuration](operations/universe-configuration.md): explicit world creation, admission policy, upgrades, and rollback boundaries.
- [Unbought Accounts integration](operations/unbought-accounts.md): official OIDC authentication and local authentication for self-hosting.
- [Historical development fixture setup](operations/mvp-v1-local-setup.md): isolated test-support worlds and manual checks; use the development guide for normal startup.

## Architecture and engineering

- [Engineering principles](engineering-principles.md): authoritative state, deterministic transitions, and separation of responsibilities.
- [Engineering conventions](engineering-conventions.md): dependency boundaries, contracts, security, and review expectations.
- [Universe speed](architecture/server-speed.md): fixed creation-time speed and its domain effects.
- [Deployment](architecture/deployment.md): process roles, persistence, migrations, and hosting requirements.
- [Branding](branding.md): original logo assets, palette, and export instructions.

## Operations

- [Development server runbook](runbooks/development-server.md): startup, database maintenance, readiness, and recovery.
- [Concurrent runtime](operations/concurrent-runtime.md): process topology, connection budgets, rollout, and observability.
- [Rules updates](operations/rules-updates.md): content activation, compatibility, and integrity inspection.
- [Colonization rollout](operations/colonization.md): Colony Ship rules, compatible storage, beta activation and recovery.
- [CI runner isolation](runbooks/ci-runners.md): disposable runners, test resources, and publication prerequisites.
- [Trusted image releases](operations/image-releases.md): CI gating, private ECR publication, source and notice inspection, and digest records.
- [Historical debris upgrade](runbooks/debris-reference-upgrade.md): legacy replay compatibility; the current release uses the fresh-database cutover.

Routine checks and explicitly requested acceptance suites are separate. Follow the test commands and limits in the [development guide](development.md#testing) and Makefile. Deployment templates and example commands do not establish that hosting is provisioned or that production capacity has been verified.
