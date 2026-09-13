#!/usr/bin/env bash
# Mainnet-forked local validator. Clones the real TSLAx mint, the real Pyth
# feed account, USDC, and the Pyth receiver program, so every extension and
# every oracle byte in the demo is the genuine article.
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
M=https://api.mainnet-beta.solana.com

solana-test-validator --reset \
  --url "$M" \
  --clone XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB \
  --clone Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh \
  --clone GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY \
  --clone 6TPsjFigUaMFanRCsxQ4WbmG215xhRBXsb5y5Cn5L6eE \
  --clone EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --clone-upgradeable-program rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ \
  "$@"
