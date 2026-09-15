#!/usr/bin/env bash
# Mainnet-forked local validator.
#
# The Pyth receiver program and the price accounts are the real mainnet ones,
# untouched. The mints are the real ones with only the mint authority patched to
# the local test wallet, so TSLAx can be minted here while every Token-2022
# extension stays exactly as it is on mainnet. Regenerate the fixtures with
#   python3 scripts/make_fixtures.py "$(solana address -k keys/localnet-payer.json)"
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
M=https://api.mainnet-beta.solana.com

exec solana-test-validator --reset --quiet \
  --url "$M" \
  --clone-upgradeable-program rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ \
  --account XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB fixtures/mint-tslax.json \
  --account Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh fixtures/mint-nvdax.json \
  --account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v fixtures/mint-usdc.json \
  --account GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY fixtures/oracle-tslax_feed.json \
  --account 6TPsjFigUaMFanRCsxQ4WbmG215xhRBXsb5y5Cn5L6eE fixtures/oracle-nvdax_feed.json \
  \
  "$@"
