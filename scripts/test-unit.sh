#!/usr/bin/env bash
# Settlement math, no validator needed.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
./scripts/with-build-home.sh cargo test -p stocklana --lib "$@"
