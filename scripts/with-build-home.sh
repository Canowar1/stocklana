#!/usr/bin/env bash
# Runs a command with HOME redirected only if ~/.cache is not writable.
# See scripts/build.sh for why that redirect exists at all.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
if mkdir -p "$HOME/.cache/solana" 2>/dev/null && [ -w "$HOME/.cache/solana" ]; then
  exec "$@"
fi
BH="$PWD/.buildhome"
mkdir -p "$BH/.cache"
for d in .cargo .rustup .config .local .avm; do
  [ -e "$HOME/$d" ] && ln -sfn "$HOME/$d" "$BH/$d"
done
HOME="$BH" exec "$@"
