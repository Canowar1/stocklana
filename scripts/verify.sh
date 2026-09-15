#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/env.sh"
echo "cluster $CLUSTER   rpc $RPC_URL"
solana program show "$(solana address -k "$PROGRAM_KEYPAIR")" --url "$RPC_URL" 2>/dev/null | sed 's/^/  /'
echo "  Deployer balance: $(solana balance -k "$DEPLOYER_KEYPAIR" --url "$RPC_URL")"
echo
./node_modules/.bin/ts-node -P tsconfig.json scripts/verify-deployment.ts
