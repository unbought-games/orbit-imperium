.DEFAULT_GOAL := help

.PHONY: help

help:
	@printf '%s\n' \
	  'make dev-reset                 Restore the rich local playground' \
	  'make dev                        Build and run the local game' \
	  'make check                      Run routine tests and static checks' \
	  'make build-universe-final       Build the release server binary' \
	  'See docs/development.md for setup and deployment requirements.'

# Routine runners have no execution deadlines; Make owns preparation and parallelism.
# Explicit launch validation retains generous preparation and execution guards.
TIMEOUT = node scripts/test-timeout.mjs
SERVER_TESTS = cargo nextest run --workspace --exclude orbit-storage-postgres --all-targets --features orbit-server/test-support
BRIDGE_TESTS = cargo nextest run -p orbit-server --all-targets --features test-support,universe-config-bridge
DB_TESTS = cargo nextest run -p orbit-storage-postgres --features test-support
DB_SUITES = $(basename $(notdir $(wildcard crates/storage-postgres/tests/*.rs)))
DB_TARGETS = $(addprefix _db-,$(DB_SUITES))
DB_JOBS ?= 4

.PHONY: check test-tooling test-client test-server test-db test-ui prepare-server _server _database _static $(DB_TARGETS)
check: test-tooling test-client test-server
	cargo clippy --workspace --all-targets --features orbit-server/test-support -- -D warnings
	$(MAKE) _static
	npm run build

_static:
	cargo fmt --all --check
	npm run lint
	npm run format:check
	node scripts/check-contracts.mjs
	node scripts/check-boundaries.mjs

test-tooling:
	node --test scripts/*.test.mjs scripts/fixtures/*.test.mjs

.PHONY: test-placement
test-placement:
	cargo nextest run -p orbit-engine --test neighborhoods --test universe

test-client:
	npm test

.PHONY: test-http
test-http:
	cargo nextest run -p orbit-transport-http

.PHONY: test-universe-config
test-universe-config:
	cargo nextest run -p orbit-application --test universe_config
	cargo nextest run -p orbit-server --bin orbit -E 'test(universe_cli::tests::) | test(setup_cli::tests::)'

prepare-server:
	$(SERVER_TESTS) --no-run
	$(BRIDGE_TESTS) --no-run
	$(DB_TESTS) --lib --no-run

test-server: prepare-server
	$(MAKE) _server

_server:
	$(SERVER_TESTS)
	$(BRIDGE_TESTS)
	$(DB_TESTS) --lib

test-db:
	$(DB_TESTS) $(addprefix --test ,$(DB_SUITES)) --no-run
	$(MAKE) -j$(DB_JOBS) _database

# Keep the two measured long-running binaries off the tail of the other suites.
# The rest group is a complement, so new test binaries are included automatically.
.PHONY: test-db-rules test-db-world test-db-rest
test-db-rules:
	$(MAKE) test-db DB_SUITES=rules_updates

test-db-world:
	$(MAKE) test-db DB_SUITES=world_edit

test-db-rest:
	$(MAKE) test-db DB_SUITES="$(filter-out rules_updates world_edit,$(DB_SUITES))"

_database: $(DB_TARGETS)
$(DB_TARGETS): _db-%:
	sh scripts/test-db.sh "$*"

test-ui:
	npm run test:ui $(if $(UI_SHARD),-- --shard=$(UI_SHARD))

db-up:
	docker compose up -d --wait db

db-init:
	node scripts/local.mjs db-init

# Deletes the local database volume and all data in it.
db-destroy:
	docker compose down --volumes db

# Local lifecycle owns an isolated worktree database; game edits live in orbit world.
.PHONY: dev dev-reset dev-setup _dev-binary _dev-dependencies build-universe-final build-universe-bridge
_dev-binary:
	cargo build -p orbit-server

_dev-dependencies:
	@test -d node_modules || npm ci
	npm run news:build

dev-reset: _dev-binary _dev-dependencies
	node scripts/local-world.mjs reset

dev-setup: _dev-binary _dev-dependencies
	node scripts/local-world.mjs setup

# Separate deployable artifacts. The default image remains the final release.
build-universe-final:
	cargo build --locked --release -p orbit-server --target-dir target/universe-final

build-universe-bridge:
	cargo build --locked --release -p orbit-server --features universe-config-bridge --target-dir target/universe-bridge

# Artifact inspection only; full-system/container acceptance remains explicit.
.PHONY: release-image inspect-release-image publish-release-manifest verify-release-registry
ORBIT_RELEASE_PLATFORM ?= linux/amd64
ORBIT_RELEASE_SOURCE ?= .
release-image:
	test -n "$(ORBIT_RELEASE_IMAGE)" && test -n "$(ORBIT_RELEASE_SHA)"
	cd "$(ORBIT_RELEASE_SOURCE)" && node scripts/news-history.mjs
	docker build --platform "$(ORBIT_RELEASE_PLATFORM)" --label "org.opencontainers.image.revision=$(ORBIT_RELEASE_SHA)" --label "org.opencontainers.image.source=https://github.com/unbought-games/orbit-imperium" $(if $(ORBIT_RELEASE_VERSION),--label "org.opencontainers.image.version=$(ORBIT_RELEASE_VERSION)") -t "$(ORBIT_RELEASE_IMAGE)" "$(ORBIT_RELEASE_SOURCE)"

inspect-release-image:
	node scripts/inspect-release-image.mjs

publish-release-manifest:
	node scripts/release-registry.mjs --publish

verify-release-registry:
	node scripts/release-registry.mjs

dev: _dev-binary _dev-dependencies
	node scripts/local-world.mjs start

# Explicit-only validation. PostgreSQL must already be running in an isolated
# disposable Compose project; see docs/runbooks/ci-runners.md.
SUITE ?= all
EXPLICIT_SUITES = core mvp progression missions raiding recovery migrations signup
.PHONY: test-explicit test-acceptance test-container _container test-runtime prepare-explicit prepare-migrations prepare-signup _acceptance $(addprefix run-,$(EXPLICIT_SUITES)) $(addprefix test-,$(EXPLICIT_SUITES)) test-e2e

test-explicit:
	@case "$(SUITE)" in all) $(MAKE) test-acceptance && $(MAKE) test-container ;; acceptance|container|core|mvp|progression|missions|raiding|recovery|migrations|signup|rules-updates|speed-updates) $(MAKE) test-$(SUITE) ;; *) echo 'Unknown explicit suite' >&2; exit 2 ;; esac

test-runtime:
	$(TIMEOUT) compile cargo build -p orbit-server --features orbit-server/test-support
	$(TIMEOUT) web-build npm run build

prepare-signup:
	$(TIMEOUT) compile cargo build -p orbit-server
	cp target/debug/orbit target/signup-server

prepare-migrations:
	$(TIMEOUT) compile cargo build -p orbit-server --target-dir target/migration-upgrade --features orbit-server/test-support,orbit-storage-postgres/migration-upgrade-test

# Preserve the production binary before preparing the fixture binary. Make's
# existing job scheduling runs suites; no artifact discovery or custom scheduler.
prepare-explicit:
	$(MAKE) prepare-signup
	$(MAKE) test-runtime prepare-migrations

test-acceptance: prepare-explicit
	$(TIMEOUT) full-system $(MAKE) -j3 _acceptance

_acceptance: $(addprefix run-,$(EXPLICIT_SUITES))

test-core test-mvp test-progression test-missions test-raiding test-recovery: test-runtime
	$(TIMEOUT) full-system $(MAKE) run-$(patsubst test-%,%,$@)

test-e2e: test-core

test-migrations: test-runtime prepare-migrations
	$(TIMEOUT) full-system $(MAKE) run-migrations

test-signup: prepare-signup
	$(TIMEOUT) web-build npm run build
	$(TIMEOUT) full-system $(MAKE) run-signup

run-core:
	ORBIT_CORE_E2E=1 ORBIT_TEST_SUITE=core ORBIT_TEST_OUTPUT_DIR=test-results/browser-core $(TIMEOUT) core node scripts/e2e.mjs

run-recovery:
	$(TIMEOUT) recovery node scripts/recovery.mjs

run-mvp run-progression run-missions run-raiding run-migrations:
	ORBIT_TEST_SUITE=$(patsubst run-%,%,$@) ORBIT_TEST_OUTPUT_DIR=test-results/browser-$(patsubst run-%,%,$@) $(TIMEOUT) $(patsubst run-%,%,$@) node scripts/$(patsubst run-%,%,$@)-e2e.mjs

run-signup:
	ORBIT_TEST_SUITE=signup ORBIT_TEST_SERVER_BINARY=target/signup-server $(TIMEOUT) signup node scripts/signup-e2e.mjs

ORBIT_TEST_IMAGE ?= orbit-imperium:dev
export ORBIT_TEST_IMAGE
.PHONY: prepare-container _container-build
prepare-container:
	$(TIMEOUT) container-build $(MAKE) _container-build

_container-build:
	docker build -t "$(ORBIT_TEST_IMAGE)" .

test-container: prepare-container
	$(TIMEOUT) container $(MAKE) _container

_container:
	node scripts/container-smoke.mjs
	ORBIT_TEST_CI_DOCKER=1 node --test scripts/ci-isolation.test.mjs

# Explicit rolling-deployment acceptance; not part of routine CI.
.PHONY: prepare-rules-updates test-rules-updates run-rules-updates
prepare-rules-updates:
	$(TIMEOUT) compile sh scripts/build-rules-previous.sh

test-rules-updates: test-runtime prepare-rules-updates
	$(MAKE) run-rules-updates

run-rules-updates:
	$(TIMEOUT) full-system node scripts/rules-updates-e2e.mjs

.PHONY: test-combat
test-combat:
	cargo nextest run -p orbit-engine --all-targets

.PHONY: test-colonization
test-colonization:
	cargo nextest run -p orbit-engine --test colonization --test missions

.PHONY: test-speed-updates run-speed-updates
test-speed-updates: test-runtime
	$(MAKE) run-speed-updates

run-speed-updates:
	$(TIMEOUT) full-system node scripts/speed-updates-e2e.mjs

# Explicit S1 bot contract acceptance. Build the real pre-S1 binary first;
# baseline artifacts use a separate target directory to prevent cache collisions.
.PHONY: prepare-bots test-bots run-bots
prepare-bots:
	$(TIMEOUT) compile sh scripts/build-bots-previous.sh
	$(TIMEOUT) compile cargo build -p orbit-server --features test-support

test-bots: prepare-bots
	$(MAKE) run-bots

run-bots:
	$(TIMEOUT) full-system node scripts/bots-e2e.mjs

.PHONY: test-homepage test-homepage-built
test-homepage-built:
	npm run build
	npm run test:homepage-built

test-homepage: test-homepage-built
	cargo nextest run -p orbit-transport-http --lib -E 'test(home_seo::) | test(static_assets::) | test(shared_report_preview::) | test(public_reports_need_no_session_but_sharing_management_requires_auth_origin_and_csrf)'
	npm test -- anonymous-landing
	npm run test:ui -- home.spec.ts

.PHONY: test-location-previews
test-location-previews:
	cargo nextest run -p orbit-transport-http --lib -E 'test(location_card::)'

# Explicit-only local development lifecycle validation; owns disposable Compose projects.
.PHONY: test-world-local
test-world-local: _dev-binary _dev-dependencies
	$(TIMEOUT) full-system node scripts/world-local-e2e.mjs

# Deterministic persisted-wire compatibility, replay, and immutable API checks.
.PHONY: test-persistence
test-persistence:
	cargo nextest run -p orbit-engine --test persistence --test missions --test replay --test debris --test progression_terms --test rules_updates
	cargo test -p orbit-engine --doc

.PHONY: test-persistence-db
test-persistence-db:
	sh scripts/test-db.sh rules_updates 'test(compatibility::) | test(legacy_rules_) | test(activation_waits_for_admitted_and_claimed_work)'

.PHONY: test-rules-impact test-rules-impact-db
test-rules-impact:
	cargo nextest run -p orbit-engine --test rules_update_impact --test rules_updates
	cargo nextest run -p orbit-engine --test missions -E 'test(debris_only_activation_)'
	cargo nextest run -p orbit-application --test rules_immutable

test-rules-impact-db:
	sh scripts/test-db.sh rules_updates 'test(impact::)'

.PHONY: test-insignias
test-insignias:
	cargo nextest run -p orbit-application -p orbit-transport-http --lib -E 'test(insignia)'
	cargo nextest run -p orbit-storage-assets --lib
	npm test -- insignias
	npm run test:ui -- insignias.spec.ts

# Explicit-only real-server insignia acceptance; use an isolated Compose database.
.PHONY: test-insignias-live
test-insignias-live: _dev-binary
	npm run build
	$(TIMEOUT) full-system node scripts/insignias-live.mjs

.PHONY: test-deuterium-debris test-deuterium-debris-db
test-deuterium-debris:
	cargo nextest run -p orbit-engine --test debris --test missions --test rules_update_impact --test persistence --lib
	npm test -- galaxy-harvest galaxy-position
	npm run test:ui -- galaxy-cards.spec.ts combat-reports.spec.ts harvest-reports.spec.ts catalog-pages.spec.ts --grep 'deuterium|harvest reports'

test-deuterium-debris-db:
	sh scripts/test-db.sh rules_updates 'test(impact::) | test(compatibility::)'
	sh scripts/test-db.sh world_edit 'test(editable_export_round_trips_planets_valuation_and_activity)'

.PHONY: test-terraformer test-terraformer-db
test-terraformer:
	cargo nextest run -p orbit-engine --lib --test progression -E 'test(terraformer)'
	cargo nextest run -p orbit-application --lib -E 'test(terraformer)'
	npm test -- apps/web/src/features/progression/detail-insights.test.ts
	npm run test:ui -- terraformer.spec.ts

test-terraformer-db:
	sh scripts/test-db.sh rules_updates 'test(terraformer)'
	sh scripts/test-db.sh world_edit 'test(terraformer)'

# Explicit cross-service acceptance; the fixture manifest contains synthetic secrets.
.PHONY: test-oidc-provider
test-oidc-provider:
	test -n "$(ORBIT_OIDC_PROVIDER_FIXTURE)"
	sh scripts/test-db.sh oidc 'test(real_provider_commit_cutpoints)' --run-ignored only --success-output immediate

# Explicit only: set QUALIFY_AUTH_MANIFEST, QUALIFY_BOTS, QUALIFY_SECONDS and
# QUALIFY_HISTORY_ROWS, QUALIFY_ACTION_UNITS, QUALIFY_COMMAND_INTERVAL_MS and
# QUALIFY_MIN_COMMAND_ROWS_PER_MINUTE from the qualification plan. Never runs in CI.
.PHONY: qualify-runtime
qualify-runtime:
	$(TIMEOUT) runtime-qualification sh scripts/qualify-runtime.sh

# Moon movement, combat, holding and lifecycle regression coverage.
.PHONY: test-moon-fleets
test-moon-fleets:
	cargo nextest run -p orbit-engine --test missions
	cargo nextest run -p orbit-application --lib
	npm test

# Lunar construction uses the shared progression and persistence machinery.
.PHONY: test-lunar-base test-lunar-base-db
test-lunar-base:
	cargo nextest run -p orbit-engine -p orbit-application --all-targets
	npm test
	npm run test:ui -- moons.spec.ts terraformer.spec.ts

test-lunar-base-db:
	sh scripts/test-db.sh moons

# Lunar Robotics and Shipyard: shared construction, paid production and UI wiring.
.PHONY: test-lunar-industry test-lunar-industry-db
test-lunar-industry:
	cargo nextest run -p orbit-engine -p orbit-application --all-targets
	npm test
	npm run test:ui -- moons.spec.ts industrial-buildings.spec.ts

test-lunar-industry-db:
	sh scripts/test-db.sh moons
	sh scripts/test-db.sh rules_updates

.PHONY: test-phalanx
test-phalanx:
	cargo nextest run -p orbit-engine --lib --test phalanx --test missions --test persistence --test debris --test replay
	cargo nextest run -p orbit-application --lib

.PHONY: test-empire-identity
test-empire-identity:
	cargo nextest run -p orbit-application -p orbit-transport-http --lib -E 'test(empire_identity) | test(insignia)'
	npm test -- deadline-timer empire-identity player-profiles
	npm run test:ui -- empire-identity.spec.ts

# Linked lab arithmetic, persisted operation snapshots and responsive inspectors.
.PHONY: test-research-network test-research-network-db
test-research-network:
	cargo nextest run -p orbit-engine -p orbit-application --all-targets
	npm test
	npm run test:ui -- research-network.spec.ts hyperspace-technology.spec.ts

test-research-network-db:
	sh scripts/test-db.sh rules_updates
	sh scripts/test-db.sh world_edit 'test(research_network)'

.PHONY: test-objectives
test-objectives:
	cargo nextest run -p orbit-engine --test objectives --test persistence --test replay --lib -E 'binary(objectives) | binary(persistence) | binary(replay) | test(objectives::tests::)'

.PHONY: test-mission-sites test-db-mission-sites
test-mission-sites:
	cargo nextest run -p orbit-engine --lib -E 'test(mission_sites::)'

test-db-mission-sites:
	$(MAKE) test-db DB_SUITES=mission_sites DB_JOBS=1

.PHONY: test-site-fleets test-db-site-fleets
test-site-fleets:
	cargo nextest run -p orbit-engine --test missions -E 'test(site_execution::)'
test-db-site-fleets:
	$(MAKE) test-db DB_SUITES=site_fleets DB_JOBS=1

.PHONY: experiment-tutorial experiment-tutorial-early-storage
experiment-tutorial:
	sh scripts/test-db.sh tutorial 'test(signup_economy_experiment)' --run-ignored=only

experiment-tutorial-early-storage:
	sh scripts/test-db.sh tutorial 'test(signup_early_storage_experiment)' --run-ignored=only

.PHONY: test-tutorial test-db-tutorial
test-tutorial:
	cargo nextest run -p orbit-engine --lib --test objectives --test missions -E 'test(authored_sites_) | test(site_execution::) | test(tutorial::)'
test-db-tutorial:
	$(MAKE) test-db DB_SUITES=tutorial DB_JOBS=1

# Distinguish refresh contention without changing HTTP errors or token fencing.
.PHONY: test-auth-telemetry
test-auth-telemetry:
	cargo nextest run -p orbit-application -p orbit-server -p orbit-transport-http --lib --bins -E 'test(auth_observation::tests::) | test(metrics::tests::) | test(bootstrap::tests::) | test(active_session_rotation_has_a_distinct_private_retry_response)'

.PHONY: test-announcements
test-announcements:
	cargo nextest run -p orbit-application -p orbit-storage-assets -p orbit-transport-http -p orbit-server -E 'test(announcements) | binary(announcements_cli)'
	npm test -- apps/web/src/features/announcements apps/web/src/features/alliances/markdown.test.ts
	npm run test:ui -- release-announcement.spec.ts
