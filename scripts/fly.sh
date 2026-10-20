#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

action=${1:-}
app=${FLY_APP:-}
fly=${FLY:-flyctl}
config=${FLY_CONFIG:-deploy/fly.toml}

case "$action" in
  launch|deploy|destroy) ;;
  *) printf '%s\n' 'Usage: fly.sh launch|deploy|destroy' >&2; exit 2 ;;
esac

case "$app" in
  ''|-*|*-|*[!a-z0-9-]*)
    printf '%s\n' 'Set FLY_APP to the exact Fly app name (lowercase letters, digits and hyphens).' >&2
    exit 2
    ;;
esac

if [ "$action" != destroy ]; then
  if [ ! -f Dockerfile ] || [ ! -f "$config" ]; then
    printf '%s\n' "Deployment needs Dockerfile and $config. These are created during the first-slice implementation." >&2
    exit 2
  fi
fi

if [ "$action" != destroy ]; then
  production=false
  if grep -q '^# orbit-production-ha-required$' "$config"; then
    production=true
  fi
  ha=${FLY_HA:-$production}
  case "$ha" in
    true|false) ;;
    *) printf '%s\n' 'FLY_HA must be true or false.' >&2; exit 2 ;;
  esac
  if [ "$production" = true ] && [ "$ha" != true ]; then
    printf '%s\n' 'Production role templates require FLY_HA=true.' >&2
    exit 2
  fi
fi

if ! command -v "$fly" >/dev/null 2>&1; then
  printf '%s\n' "Cannot find Fly CLI: $fly" >&2
  exit 2
fi

case "$action" in
  launch)
    set -- launch --name "$app" --config "$config" --copy-config \
      --no-deploy --no-db --no-redis --no-object-storage \
      --no-github-workflow --auto-stop off --yes
    if [ -n "${FLY_ORG:-}" ]; then
      set -- "$@" --org "$FLY_ORG"
    fi
    if [ -n "${FLY_REGION:-}" ]; then
      set -- "$@" --region "$FLY_REGION"
    fi
    "$fly" "$@"
    exec "$fly" deploy --app "$app" --config "$config" --ha="$ha" --strategy rolling
    ;;
  deploy)
    exec "$fly" deploy --app "$app" --config "$config" --ha="$ha" --strategy rolling
    ;;
  destroy)
    exec "$fly" apps destroy "$app" --yes
    ;;
esac
