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

# Grow the program account only by what the new artifact actually needs plus a
# small margin. Extending is paid in rent and cannot be undone, so a generous
# round number here is money spent for nothing.
extend_if_needed() {
  local pid="$1" artifact="$2" current new margin
  [ -f "$artifact" ] || return 0
  current=$(solana program show "$pid" --url "$RPC_URL" 2>/dev/null | awk "/Data Length/{print \$3}")
  [ -n "$current" ] || return 0
  new=$(wc -c < "$artifact" | tr -d " ")
  margin=$(( new / 10 ))
  if [ "$new" -gt "$current" ]; then
    echo "  extending $pid by $(( new - current + margin )) bytes"
    solana program extend "$pid" $(( new - current + margin )) \
      --url "$RPC_URL" -k "$DEPLOYER_KEYPAIR" >/dev/null
  fi
}
extend_if_needed "$(solana address -k "$PROGRAM_KEYPAIR")" target/deploy/stocklana.so
[ -f keys/stocklana-mirror-keypair.json ] && extend_if_needed \
  "$(solana address -k keys/stocklana-mirror-keypair.json)" target/deploy/stocklana_mirror.so

./scripts/build.sh
./scripts/with-build-home.sh anchor deploy \
  --provider.cluster "$RPC_URL" \
  --provider.wallet "$DEPLOYER_KEYPAIR" \
  --program-name stocklana \
  --program-keypair "$PROGRAM_KEYPAIR"

# The price mirror is a devnet tool and is never deployed to mainnet.
if [ "$CLUSTER" != "mainnet" ] && [ -f keys/stocklana-mirror-keypair.json ]; then
  echo
  echo "Deploying the devnet price mirror"
  ./scripts/with-build-home.sh anchor deploy \
    --provider.cluster "$RPC_URL" \
    --provider.wallet "$DEPLOYER_KEYPAIR" \
    --program-name stocklana-mirror \
    --program-keypair keys/stocklana-mirror-keypair.json
fi

echo
echo "Registering config and markets"
# No HOME override here: it only exists for cargo-build-sbf and it breaks
# node's module resolution.
./node_modules/.bin/ts-node -P tsconfig.json scripts/setup-markets.ts
