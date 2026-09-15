#!/usr/bin/env bash
# Full lifecycle against a mainnet-forked validator carrying the real TSLAx
# mint and the real Pyth price account. Starts the validator, deploys through
# the same path a real deployment uses, runs the suite, then stops it.
set -euo pipefail
cd "$(dirname "$0")/.."

# Tests always run on the fork, whatever .env says. env.sh honours an already
# set variable over the file, so these exports are what decide the target.
CLUSTER=localnet
DEPLOYER_KEYPAIR=keys/localnet-payer.json
RPC_URL=http://127.0.0.1:8899
export CLUSTER DEPLOYER_KEYPAIR RPC_URL
. ./scripts/env.sh

./scripts/build.sh
# Kill only actual validator processes. `pkill -f` on a broad pattern also
# matches any parent shell whose command line happens to contain the name,
# which silently kills this script.
# pgrep exits 1 when nothing matches, which under `set -e` would end the script.
for pid in $(pgrep -x solana-test-validator 2>/dev/null || true); do kill "$pid" 2>/dev/null || true; done
sleep 1
rm -rf test-ledger

if [ ! -f fixtures/mint-tslax.json ]; then
  python3 scripts/make_fixtures.py "$(solana address -k "$DEPLOYER_KEYPAIR")"
fi

./scripts/fork.sh > /tmp/stocklana-validator.log 2>&1 &
VALIDATOR=$!
trap 'kill $VALIDATOR 2>/dev/null || true' EXIT

until solana cluster-version --url "$RPC_URL" >/dev/null 2>&1; do sleep 2; done
solana airdrop 50 "$(solana address -k "$DEPLOYER_KEYPAIR")" --url "$RPC_URL" >/dev/null 2>&1

HOME="$PWD/.buildhome" anchor deploy \
  --provider.cluster "$RPC_URL" --provider.wallet "$DEPLOYER_KEYPAIR" \
  --program-name stocklana --program-keypair "$PROGRAM_KEYPAIR" >/dev/null

# A last guard: never let this suite touch anything but the local validator.
case "$ANCHOR_PROVIDER_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "test-fork.sh: refusing to run against $ANCHOR_PROVIDER_URL" >&2; exit 1 ;;
esac

./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
