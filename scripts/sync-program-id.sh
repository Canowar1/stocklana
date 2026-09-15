#!/usr/bin/env bash
# Rewrites declare_id! and Anchor.toml to match the program keypair, then
# rebuilds. Run after replacing keys/stocklana-program-keypair.json.
set -euo pipefail
. "$(dirname "$0")/env.sh"
pid=$(solana address -k "$PROGRAM_KEYPAIR")
echo "program id: $pid"
sed -i '' -E "s|declare_id!\(\"[^\"]+\"\)|declare_id!(\"$pid\")|" programs/stocklana/src/lib.rs
sed -i '' -E "s|^stocklana = \"[^\"]+\"|stocklana = \"$pid\"|" Anchor.toml
grep -n "declare_id" programs/stocklana/src/lib.rs
grep -n "^stocklana" Anchor.toml
./scripts/build.sh
