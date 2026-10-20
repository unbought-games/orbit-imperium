#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -n "${ORBIT_PREVIOUS_SERVER:-}" ]; then
  test -x "$ORBIT_PREVIOUS_SERVER" || { echo 'ORBIT_PREVIOUS_SERVER must identify an executable previous server' >&2; exit 1; }
  exit 0
fi
previous_ref=${ORBIT_RULES_PREVIOUS_REF:-}
if [ -z "$previous_ref" ]; then
  echo 'Set ORBIT_PREVIOUS_SERVER or ORBIT_RULES_PREVIOUS_REF to a configuration-aware bridge build; a pre-bridge binary cannot participate in rolling validation.' >&2
  exit 1
fi
previous_sha=$(git rev-parse --verify --end-of-options "$previous_ref^{commit}")
for source in crates/server/src/runtime_cli.rs crates/storage-postgres/src/updates.rs crates/server/src/universe_cli/mod.rs; do
  if ! git cat-file -e "$previous_sha:$source" 2>/dev/null; then
    echo 'Previous source predates the universe configuration bridge; select a compatible revision.' >&2
    exit 1
  fi
done
if ! git show "$previous_sha:crates/server/Cargo.toml" | grep -q '^universe-config-bridge[[:space:]]*='; then
  echo 'Previous source must support the universe configuration bridge feature.' >&2
  exit 1
fi
source_dir=$(mktemp -d "${TMPDIR:-/tmp}/orbit-rules-previous.XXXXXX")
trap 'rm -rf "$source_dir"' EXIT INT TERM
output_dir="$PWD/target/rules-previous"
git archive "$previous_sha" | tar -x -C "$source_dir"
cargo build --locked --manifest-path "$source_dir/Cargo.toml" --target-dir "$output_dir" -p orbit-server --features test-support,universe-config-bridge
