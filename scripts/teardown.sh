#!/usr/bin/env bash
# Closes the config and every market on the cluster in .env and returns their
# rent. Refuses mainnet.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/env.sh"
[ "$CLUSTER" = "mainnet" ] && { echo "refusing to tear down mainnet"; exit 1; }
echo "tearing down $CLUSTER at $RPC_URL"
./node_modules/.bin/ts-node -P tsconfig.json scripts/teardown.ts
