#!/usr/bin/env bash
# Closes any deploy buffers left behind by a failed upgrade and returns their
# rent. A failed `anchor deploy` can strand a buffer holding roughly the
# program's own rent, which is not a small amount on devnet.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/env.sh"
echo "buffers owned by $(solana address -k "$DEPLOYER_KEYPAIR")"
solana program show --buffers --url "$RPC_URL" -k "$DEPLOYER_KEYPAIR"
echo
read -r -p "Close all of them and reclaim the rent? [y/N] " reply
case "$reply" in
  [yY]*) solana program close --buffers --url "$RPC_URL" -k "$DEPLOYER_KEYPAIR" ;;
  *) echo "left alone" ;;
esac
