#!/usr/bin/env bash
# Devnet airdrops are rate limited per IP and per RPC. Try several endpoints.
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
ADDR=$(solana address)
for RPC in https://api.devnet.solana.com https://devnet.helius-rpc.com/?api-key=demo; do
  echo "-> $RPC"
  solana airdrop 2 "$ADDR" --url "$RPC" 2>&1 | tail -1
done
echo "balance: $(solana balance --url https://api.devnet.solana.com)"
echo "If all fail, use https://faucet.solana.com in a browser with address $ADDR"
