#!/usr/bin/env bash
# Settlement math, no validator needed.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
HOME="$PWD/.buildhome" cargo test -p stocklana --lib "$@"
