#!/usr/bin/env bash
# Always build through this script.  Usage: ./scripts/build.sh [anchor args...]
#
# On this developer's machine `~/.cache` is owned by root, so cargo-build-sbf
# cannot create `~/.cache/solana` and dies with "Failed to install
# platform-tools: Permission denied (os error 13)". HOME is then redirected to
# a writable directory inside the repo.
#
# That redirect is a workaround, so it only engages when it is needed. On CI and
# on a normally configured machine `~/.cache` is writable and HOME is left
# alone, which keeps the real cargo cache in play instead of a cold one.
#
# The permanent local fix, which needs a password:  sudo chown -R "$USER" ~/.cache
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

cache_writable() {
  mkdir -p "$HOME/.cache/solana" 2>/dev/null && [ -w "$HOME/.cache/solana" ]
}

if cache_writable; then
  exec anchor "${@:-build}"
fi

echo "build.sh: ~/.cache is not writable, redirecting HOME to .buildhome" >&2
BH="$PWD/.buildhome"
mkdir -p "$BH/.cache"
for d in .cargo .rustup .config .local .avm; do
  [ -e "$HOME/$d" ] && ln -sfn "$HOME/$d" "$BH/$d"
done
HOME="$BH" exec anchor "${@:-build}"
