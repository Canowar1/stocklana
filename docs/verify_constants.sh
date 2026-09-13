#!/usr/bin/env bash
# Re-verify every fact the build depends on. Run before each work session.
set -u
RPC=${RPC:-https://api.mainnet-beta.solana.com}
acct () { curl -sS -m 25 "$RPC" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$1\",{\"encoding\":\"$2\"}]}"; }

echo "== TSLAx mint extensions"
acct XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB jsonParsed \
  | python3 -c "import json,sys;i=json.load(sys.stdin)['result']['value']['data']['parsed']['info'];print('decimals',i['decimals']);[print(' ',e['extension'],json.dumps(e['state'])[:120]) for e in i.get('extensions',[])]"

echo "== TSLAX oracle freshness"
acct GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY base64 \
  | python3 -c "
import json,sys,base64,struct,time
v=json.load(sys.stdin)['result']['value']
b=base64.b64decode(v['data'][0]); o=8+32+1+32
p,c=struct.unpack_from('<qQ',b,o); e,=struct.unpack_from('<i',b,o+16); t,=struct.unpack_from('<q',b,o+20)
print(' owner',v['owner']); print(f'  price {p*10**e:.2f} conf {c*10**e:.4f} stale_h {(time.time()-t)/3600:.1f}')"

echo "== xStocks trading status + multiplier"
curl -sS -m 20 https://api.xstocks.fi/api/v2/public/system/status/TSLAx; echo
curl -sS -m 20 "https://api.xstocks.fi/api/v2/public/assets/TSLAx/multiplier?network=Solana"; echo
curl -sS -m 20 "https://api.xstocks.fi/api/v2/public/corporate-actions/upcoming?symbol=TSLAx&pageSize=3" | head -c 200; echo

echo "== devnet SOL/USD feed"
RPC=https://api.devnet.solana.com acct 7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE base64 | head -c 120; echo
