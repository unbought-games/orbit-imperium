.DEFAULT_GOAL := help

FLY ?= flyctl
FLY_CONFIG ?= deploy/fly.toml
export FLY FLY_CONFIG FLY_APP FLY_ORG FLY_REGION FLY_HA

.PHONY: help fly-launch fly-deploy fly-destroy

help:
	@printf '%s\n' \
	  'make fly-launch FLY_APP=<name>   Create and deploy the game app' \
	  'make fly-deploy FLY_APP=<name>   Deploy an existing game app' \
	  'make fly-destroy FLY_APP=<name>  Permanently delete the named app' \
	  'Optional launch settings: FLY_ORG=<slug> FLY_REGION=<region>' \
	  'The separate PostgreSQL database is not provisioned or deleted.'

fly-launch:
	@sh scripts/fly.sh launch

fly-deploy:
	@sh scripts/fly.sh deploy

fly-destroy:
	@sh scripts/fly.sh destroy

# Routine runners have no execution deadlines; Make owns preparation and parallelism.
# Explicit launch validation retains generous preparation and execution guards.
TIMEOUT = node scripts/test-timeout.mjs
SERVER_TESTS = cargo nextest run --workspace --exclude orbit-storage-postgres --all-targets --features orbit-server/test-support
BRIDGE_TESTS = cargo nextest run -p orbit-server --all-targets --features test-support,universe-config-bridge
DB_TESTS = cargo nextest run -p orbit-storage-postgres --features test-support
DB_SUITES = $(basename $(notdir $(wildcard crates/storage-postgres/tests/*.rs)))
DB_TARGETS = $(addprefix _db-,$(DB_SUITES))

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

test-client:
	npm test

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
	$(DB_TESTS) --tests --no-run
	$(MAKE) -j2 _database

_database: $(DB_TARGETS)
$(DB_TARGETS): _db-%:
	sh scripts/test-db.sh "$*"

test-ui:
	npm run test:ui

db-up:
	docker compose up -d --wait db

db-init:
	node scripts/local.mjs db-init

# Deletes the local database volume and all data in it.
db-destroy:
	docker compose down --volumes db

dev-seed:
	node scripts/local.mjs dev-seed $(if $(UNIVERSE),--universe "$(UNIVERSE)") $(if $(AT),--at "$(AT)")

dev-reset:
	node scripts/local.mjs dev-reset $(if $(UNIVERSE),--universe "$(UNIVERSE)") $(if $(AT),--at "$(AT)")

# Explicit one-time setup; use UNIVERSE=<uuid> for retry-safe provisioning.
.PHONY: dev-setup build-universe-final build-universe-bridge
dev-setup: db-up
	cargo build -p orbit-server
	node scripts/local.mjs db-init
	node scripts/local.mjs universe create $(if $(UNIVERSE),--universe "$(UNIVERSE)")

# Separate deployable artifacts. The default image remains the final release.
build-universe-final:
	cargo build --locked --release -p orbit-server --target-dir target/universe-final

build-universe-bridge:
	cargo build --locked --release -p orbit-server --features universe-config-bridge --target-dir target/universe-bridge

# Artifact inspection only; full-system/container acceptance remains explicit.
.PHONY: release-image inspect-release-image
release-image:
	test -n "$(ORBIT_RELEASE_IMAGE)" && test -n "$(ORBIT_RELEASE_SHA)"
	node scripts/news-history.mjs
	docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$(ORBIT_RELEASE_SHA)" --label "org.opencontainers.image.source=https://github.com/unbought-games/orbit-imperium" -t "$(ORBIT_RELEASE_IMAGE)" .

inspect-release-image:
	node scripts/inspect-release-image.mjs

dev: db-up
	cargo build -p orbit-server
	npm run build
	node scripts/local.mjs serve

# Explicit-only validation. PostgreSQL must already be running in an isolated
# disposable Compose project; see docs/runbooks/ci-runners.md.
SUITE ?= all
EXPLICIT_SUITES = core mvp progression missions raiding recovery migrations signup
.PHONY: test-explicit test-acceptance test-container _container test-runtime prepare-explicit prepare-migrations prepare-signup _acceptance $(addprefix run-,$(EXPLICIT_SUITES)) $(addprefix test-,$(EXPLICIT_SUITES)) test-e2e

test-explicit:
	@case "$(SUITE)" in all) $(MAKE) test-acceptance && $(MAKE) test-container ;; acceptance|container|core|mvp|progression|missions|raiding|recovery|migrations|signup|rules-updates) $(MAKE) test-$(SUITE) ;; *) echo 'Unknown explicit suite' >&2; exit 2 ;; esac

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
