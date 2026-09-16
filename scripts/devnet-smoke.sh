#!/usr/bin/env bash
# One full lifecycle on devnet, so the screens can be checked against real
# positions. The buyer is a seeded counterparty and is disclosed as one.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/env.sh"
[ "$CLUSTER" = "mainnet" ] && { echo "this is a devnet tool"; exit 1; }
./node_modules/.bin/ts-node -P tsconfig.json scripts/devnet-smoke.ts
