#!/usr/bin/env bash
# Shared environment loader. Source this, do not execute it.
#
#   . "$(dirname "$0")/env.sh"
#
# Reads .env, applies defaults, resolves the RPC endpoint for CLUSTER and
# exports the ANCHOR_* variables the Anchor client expects.

_repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$_repo"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

CLUSTER="${CLUSTER:-localnet}"
FEE_BPS="${FEE_BPS:-50}"
MIN_DURATION_SECS="${MIN_DURATION_SECS:-60}"
MAX_STALENESS_SECS="${MAX_STALENESS_SECS:-3600}"
PROGRAM_KEYPAIR="${PROGRAM_KEYPAIR:-keys/stocklana-program-keypair.json}"

if [ -z "${RPC_URL:-}" ]; then
  case "$CLUSTER" in
    localnet) RPC_URL="http://127.0.0.1:8899" ;;
    devnet)   RPC_URL="https://api.devnet.solana.com" ;;
    mainnet)  RPC_URL="https://api.mainnet-beta.solana.com" ;;
    *) echo "env.sh: unknown CLUSTER '$CLUSTER'" >&2; return 1 2>/dev/null || exit 1 ;;
  esac
fi

# On localnet the throwaway payer is the default, so nothing needs a funded key.
if [ "$CLUSTER" = "localnet" ]; then
  DEPLOYER_KEYPAIR="${DEPLOYER_KEYPAIR:-keys/localnet-payer.json}"
else
  DEPLOYER_KEYPAIR="${DEPLOYER_KEYPAIR:-}"
fi

export CLUSTER RPC_URL DEPLOYER_KEYPAIR PROGRAM_KEYPAIR
export FEE_BPS MIN_DURATION_SECS MAX_STALENESS_SECS
export ANCHOR_PROVIDER_URL="$RPC_URL"
export ANCHOR_WALLET="$DEPLOYER_KEYPAIR"
