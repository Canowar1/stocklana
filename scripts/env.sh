#!/usr/bin/env bash
# Shared environment loader. Source this, do not execute it.
#
#   . "$(dirname "$0")/env.sh"
#
# Reads .env, applies defaults, resolves the RPC endpoint for CLUSTER and
# exports the ANCHOR_* variables the Anchor client expects.

# Find the repo root by walking up for Anchor.toml. Script-path tricks are not
# portable: BASH_SOURCE does not exist in zsh, and this file is sourced from
# both an interactive zsh and the bash scripts in this directory.
_repo="$PWD"
while [ "$_repo" != "/" ] && [ ! -f "$_repo/Anchor.toml" ]; do
  _repo="$(dirname "$_repo")"
done
if [ ! -f "$_repo/Anchor.toml" ]; then
  echo "env.sh: run this from inside the Stocklana repo" >&2
  return 1 2>/dev/null || exit 1
fi
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

# A base58 key in the environment is the right shape for a hosted process that
# has no filesystem to keep a keypair on, such as the devnet price-mirror
# relayer. It is the wrong shape for a local deploy, where a file is safer.
# When it is set, it is materialised to a 0600 file and then removed from the
# environment, so no child process, crash dump or error reporter inherits it.
if [ -n "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  if [ "$CLUSTER" = "mainnet" ]; then
    echo "env.sh: refusing to take a mainnet key from the environment." >&2
    echo "        use ./scripts/import-key.sh and DEPLOYER_KEYPAIR instead." >&2
    return 1 2>/dev/null || exit 1
  fi
  mkdir -p .runtime-keys
  chmod 700 .runtime-keys
  _materialised=".runtime-keys/deployer.json"
  if ! DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" python3 - "$_materialised" <<'PYKEY'
import json, os, sys
A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
s = os.environ["DEPLOYER_PRIVATE_KEY"].strip()
try:
    n = 0
    for c in s:
        n = n * 58 + A.index(c)
except ValueError:
    sys.exit("DEPLOYER_PRIVATE_KEY is not valid base58")
b = n.to_bytes((n.bit_length() + 7) // 8, "big")
b = b"\0" * (len(s) - len(s.lstrip("1"))) + b
if len(b) != 64:
    sys.exit(f"DEPLOYER_PRIVATE_KEY decoded to {len(b)} bytes, expected 64")
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(list(b), f)
PYKEY
  then
    return 1 2>/dev/null || exit 1
  fi
  DEPLOYER_KEYPAIR="$_materialised"
  unset DEPLOYER_PRIVATE_KEY
  echo "env.sh: took the deployer key from the environment, wrote $_materialised (0600)" >&2
fi

export CLUSTER RPC_URL DEPLOYER_KEYPAIR PROGRAM_KEYPAIR
export FEE_BPS MIN_DURATION_SECS MAX_STALENESS_SECS
export ANCHOR_PROVIDER_URL="$RPC_URL"
export ANCHOR_WALLET="$DEPLOYER_KEYPAIR"
