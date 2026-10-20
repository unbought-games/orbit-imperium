#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Each Cargo test binary gets a disposable database; tests within it stay serial.
db="orbit_test_$(date +%s)_$$"
docker compose exec -T db createdb -U orbit "$db"
trap 'docker compose exec -T db dropdb -U orbit --force "$db" >/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export TEST_DATABASE_URL="postgres://orbit:$(node -p 'encodeURIComponent(process.env.ORBIT_DB_PASSWORD || "orbit")')@127.0.0.1:${ORBIT_TEST_DB_PORT:-55432}/$db"
cargo nextest run -p orbit-storage-postgres --features test-support --test "$1" --test-threads=1
