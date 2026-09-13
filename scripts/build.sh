#!/usr/bin/env bash
# Always build through this script.  Usage: ./scripts/build.sh [anchor args...]
#
# Why: ~/.cache on this machine is owned by root, so cargo-build-sbf cannot
# create ~/.cache/solana and fails with "Failed to install platform-tools:
# Permission denied (os error 13)". HOME is redirected to a writable directory
# inside the repo, with the real toolchain directories symlinked in.
#
# Permanent fix, needs your password. Run it once and this wrapper is no longer
# needed:   sudo chown -R "$USER" ~/.cache
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
BH="$PWD/.buildhome"
mkdir -p "$BH/.cache"
for d in .cargo .rustup .config .local .avm; do ln -sfn "$HOME/$d" "$BH/$d"; done
HOME="$BH" anchor "${@:-build}"
