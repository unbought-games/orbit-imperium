#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
previous_ref=${ORBIT_BOTS_PREVIOUS_REF:-22fd8bf4b597b213f7fe396c5969339e473372e2}
previous_sha=$(git rev-parse --verify --end-of-options "$previous_ref^{commit}")
source_dir=$(mktemp -d "${TMPDIR:-/tmp}/orbit-bots-previous.XXXXXX")
trap 'rm -rf "$source_dir"' EXIT INT TERM
output_dir="$PWD/target/bots-previous"
git archive "$previous_sha" | tar -x -C "$source_dir"
cargo build --locked --manifest-path "$source_dir/Cargo.toml" --target-dir "$output_dir" -p orbit-server
cp "$output_dir/debug/orbit" "$PWD/target/bots-pre-s1"
printf '%s\n' "$previous_sha" > "$PWD/target/bots-pre-s1-revision"
