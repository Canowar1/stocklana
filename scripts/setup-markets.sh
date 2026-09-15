#!/usr/bin/env bash
# Registers the config account and every market in config/markets.<cluster>.json.
# Idempotent. Safe to re-run after editing the config.
set -euo pipefail
. "$(dirname "$0")/env.sh"
./node_modules/.bin/ts-node -P tsconfig.json scripts/setup-markets.ts
