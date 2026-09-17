#!/usr/bin/env bash
# Checks everything a deploy needs, and spends nothing. Run this first.
set -uo pipefail
. "$(dirname "$0")/env.sh"

ok=0; fail=0
pass() { printf '  \033[32mok\033[0m   %s\n' "$1"; ok=$((ok+1)); }
bad()  { printf '  \033[31mfail\033[0m %s\n' "$1"; fail=$((fail+1)); }
note() { printf '       %s\n' "$1"; }

echo "Stocklana preflight"
echo "  cluster: $CLUSTER"
echo "  rpc:     $RPC_URL"
echo

command -v solana >/dev/null && pass "solana cli $(solana --version | awk '{print $2}')" \
  || bad "solana cli not on PATH"
command -v anchor >/dev/null && pass "anchor $(anchor --version | awk '{print $2}')" \
  || bad "anchor not on PATH"

if solana cluster-version --url "$RPC_URL" >/dev/null 2>&1; then
  pass "rpc reachable, node $(solana cluster-version --url "$RPC_URL")"
else
  bad "rpc unreachable at $RPC_URL"
  [ "$CLUSTER" = localnet ] && note "start it with ./scripts/fork.sh"
fi

# Whether this is a fresh deploy decides how much SOL is actually needed, so
# it is worked out before the balance is judged.
fresh_deploy=1
if [ -f "$PROGRAM_KEYPAIR" ] && solana account "$(solana address -k "$PROGRAM_KEYPAIR")" \
     --url "$RPC_URL" >/dev/null 2>&1; then
  fresh_deploy=0
fi

if [ -z "$DEPLOYER_KEYPAIR" ]; then
  bad "DEPLOYER_KEYPAIR is not set"
  note "copy .env.example to .env and point it at your funded keypair"
elif [ ! -f "$DEPLOYER_KEYPAIR" ]; then
  bad "deployer keypair not found at $DEPLOYER_KEYPAIR"
  note "solana-keygen new -o $DEPLOYER_KEYPAIR"
  note "then fund it at https://faucet.solana.com"
else
  addr=$(solana address -k "$DEPLOYER_KEYPAIR" 2>/dev/null)
  pass "deployer $addr"
  balance=$(solana balance "$addr" --url "$RPC_URL" 2>/dev/null | awk '{print $1}')
  if [ -z "$balance" ]; then
    bad "could not read deployer balance"
  else
    # Both a first deploy and an upgrade stage the new bytes in a buffer
    # account, and its rent is what the balance has to cover. The difference is
    # that an upgrade gets the buffer's rent back when the buffer closes, so
    # this is a float requirement rather than a cost.
    #
    # The rent rate is asked of the cluster rather than assumed. A hardcoded
    # lamports-per-byte here was wrong by a factor of two and reported a
    # sufficient balance as insufficient.
    if [ -f target/deploy/stocklana.so ]; then
      bytes=$(wc -c < target/deploy/stocklana.so | tr -d " ")
      buffer_rent=$(solana rent "$bytes" --url "$RPC_URL" 2>/dev/null \
        | awk "/Rent-exempt minimum/{print \$4}")
      if [ -n "$buffer_rent" ]; then
        need=$(awk -v r="$buffer_rent" 'BEGIN{printf "%.2f", r + 0.5}')
      else
        need=4.0
      fi
    else
      need=4.0
    fi
    if [ "$fresh_deploy" -eq 1 ]; then kind="a first deploy"
    else kind="an upgrade, refunded when the buffer closes"; fi
    if awk -v b="$balance" -v n="$need" 'BEGIN{exit !(b+0 >= n+0)}'; then
      pass "deployer balance ${balance} SOL, enough for ${kind}"
    else
      bad "deployer balance ${balance} SOL, ${kind} needs about ${need}"
      note "fund $addr at https://faucet.solana.com"
    fi
  fi
fi

if [ -f "$PROGRAM_KEYPAIR" ]; then
  pid=$(solana address -k "$PROGRAM_KEYPAIR")
  pass "program id $pid"
  declared=$(grep -oE 'declare_id!\("[^"]+"\)' programs/stocklana/src/lib.rs | sed 's/.*"\(.*\)".*/\1/')
  if [ "$pid" = "$declared" ]; then
    pass "declare_id matches the program keypair"
  else
    bad "declare_id is $declared but the keypair is $pid"
    note "run ./scripts/sync-program-id.sh to fix, then rebuild"
  fi
  if solana account "$pid" --url "$RPC_URL" >/dev/null 2>&1; then
    note "program already exists on $CLUSTER, deploy will upgrade it"
  else
    note "program not yet on $CLUSTER, this will be a fresh deploy"
  fi
else
  bad "program keypair not found at $PROGRAM_KEYPAIR"
fi

[ -f target/deploy/stocklana.so ] \
  && pass "build artifact present ($(wc -c < target/deploy/stocklana.so | tr -d ' ') bytes)" \
  || { bad "no build artifact"; note "run ./scripts/build.sh"; }

echo
echo "  $ok passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
