#!/usr/bin/env bash
# Creates the devnet replica mints. Refuses mainnet: there the real tokens exist.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/env.sh"
[ "$CLUSTER" = "mainnet" ] && { echo "replicas are a devnet tool; mainnet uses the real mints"; exit 1; }
./node_modules/.bin/ts-node -P tsconfig.json scripts/create-replica-mints.ts
