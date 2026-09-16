#!/usr/bin/env bash
# Runs the devnet price mirror. Pass --watch to keep it running.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/env.sh"
[ "$CLUSTER" = "mainnet" ] && { echo "the mirror is a devnet tool"; exit 1; }
./node_modules/.bin/ts-node -P tsconfig.json scripts/mirror-relay.ts "$@"
