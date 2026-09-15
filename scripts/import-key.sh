#!/usr/bin/env bash
# Turns a base58 private key, the form Phantom and Solflare export, into the
# keypair file the Solana tooling expects.
#
#   ./scripts/import-key.sh keys/devnet-deployer.json
#
# The key is typed at a hidden prompt, never passed as an argument, so it does
# not land in shell history, in the process list, or in any log. The file is
# written with 0600 permissions into keys/, which is gitignored.
set -euo pipefail
. "$(dirname "$0")/env.sh"

OUT="${1:-keys/devnet-deployer.json}"
mkdir -p "$(dirname "$OUT")"

if [ -e "$OUT" ]; then
  printf 'A file already exists at %s. Overwrite? [y/N] ' "$OUT"
  read -r reply
  case "$reply" in [yY]*) ;; *) echo "aborted"; exit 1 ;; esac
fi

echo "Paste the base58 private key, then press Return. Nothing is echoed."
printf '> '
read -rs SECRET
echo
[ -n "$SECRET" ] || { echo "nothing entered, aborted"; exit 1; }

SECRET="$SECRET" python3 - "$OUT" <<'PY'
import json, os, sys
A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
s = os.environ["SECRET"].strip()
try:
    n = 0
    for c in s:
        n = n * 58 + A.index(c)
except ValueError:
    sys.exit("that is not valid base58")
b = n.to_bytes((n.bit_length() + 7) // 8, "big")
b = b"\0" * (len(s) - len(s.lstrip("1"))) + b
if len(b) == 32:
    sys.exit("that is a 32-byte seed, not a 64-byte keypair; export the private key, not the seed")
if len(b) != 64:
    sys.exit(f"expected 64 bytes, got {len(b)}; this does not look like a Solana private key")
path = sys.argv[1]
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(list(b), f)
PY
unset SECRET
chmod 600 "$OUT"

ADDR=$(solana address -k "$OUT")
echo "wrote $OUT  (permissions $(stat -f '%Lp' "$OUT"))"
echo "address $ADDR"
echo "balance $(solana balance "$ADDR" --url "$RPC_URL" 2>/dev/null || echo 'could not read')"
echo
echo "Now set this in .env:"
echo "  DEPLOYER_KEYPAIR=$OUT"
