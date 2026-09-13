#!/usr/bin/env bash
# Full lifecycle against a mainnet-forked validator carrying the real TSLAx
# mint and the real Pyth price account. Starts the validator, runs the suite,
# then stops it.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

./scripts/build.sh
pkill -f solana-test-validator 2>/dev/null || true
sleep 1
rm -rf test-ledger
./scripts/fork.sh > /tmp/stocklana-validator.log 2>&1 &
VALIDATOR=$!
trap 'kill $VALIDATOR 2>/dev/null || true' EXIT

until solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1; do sleep 2; done
solana airdrop 50 "$(solana address -k keys/localnet-payer.json)" \
  --url http://127.0.0.1:8899 >/dev/null 2>&1

export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
export ANCHOR_WALLET=keys/localnet-payer.json
HOME="$PWD/.buildhome" yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
