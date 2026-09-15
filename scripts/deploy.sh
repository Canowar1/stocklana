#!/usr/bin/env bash
# Builds, deploys, and registers markets on the cluster named in .env.
# Run ./scripts/preflight.sh first; this refuses to start if it fails.
set -euo pipefail
. "$(dirname "$0")/env.sh"

if [ "$CLUSTER" = "mainnet" ]; then
  echo "Refusing to deploy to mainnet from this script."
  echo "Mainnet deployment spends real funds and is a deliberate, manual step."
  exit 1
fi

./scripts/preflight.sh
echo
echo "Deploying to $CLUSTER at $RPC_URL"
echo

./scripts/build.sh
HOME="$PWD/.buildhome" anchor deploy \
  --provider.cluster "$RPC_URL" \
  --provider.wallet "$DEPLOYER_KEYPAIR" \
  --program-name stocklana \
  --program-keypair "$PROGRAM_KEYPAIR"

echo
echo "Registering config and markets"
# No HOME override here: it only exists for cargo-build-sbf and it breaks
# node's module resolution.
./node_modules/.bin/ts-node -P tsconfig.json scripts/setup-markets.ts
