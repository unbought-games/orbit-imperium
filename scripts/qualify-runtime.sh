#!/bin/sh
# Explicit characterization against disposable local databases only.
set -eu
cd "$(dirname "$0")/.."
: "${QUALIFY_AUTH_MANIFEST:?private local fixture manifest required}"
: "${QUALIFY_BOTS:?measured current population required}"
: "${QUALIFY_SECONDS:?explicit duration required}"
: "${QUALIFY_HISTORY_ROWS:?measured retained row count required}"
db="orbit_test_qualification_$(date +%s)_$$"
docker compose exec -T db createdb -U orbit "$db"
trap 'docker compose exec -T db dropdb -U orbit --force "$db" >/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export TEST_DATABASE_URL="postgres://orbit:$(node -p 'encodeURIComponent(process.env.ORBIT_DB_PASSWORD || "orbit")')@127.0.0.1:${ORBIT_TEST_DB_PORT:-55432}/$db"
cargo run --locked -p orbit-storage-postgres --features test-support --example qualify_runtime
