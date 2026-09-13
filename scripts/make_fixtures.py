#!/usr/bin/env python3
"""Builds local-validator account fixtures for the mainnet fork.

TSLAx cannot be minted on a fork because the mint authority is the issuer's.
Rather than fabricating token accounts by hand and risking a wrong Token-2022
extension layout, this clones the real mint byte for byte and patches only the
mint authority to a local test wallet. Every extension, including
permanentDelegate, pausableConfig and scaledUiAmountConfig, stays exactly as it
is on mainnet, and token accounts are then created by the real Token-2022
program.

This is a mock. It is disclosed in the README.
"""
import base64, json, os, sys, time, urllib.request

RPC = "https://api.mainnet-beta.solana.com"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "fixtures")

TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
TOKEN_LEGACY = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
MINTS = {
    "tslax": ("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", TOKEN_2022),
    "nvdax": ("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", TOKEN_2022),
    "usdc": ("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", TOKEN_LEGACY),
}
ORACLES = {
    "tslax_feed": "GpoWLTd6GoisYxYgHz7mTcZvgnfJu4SN7T6PxWjgUTFY",
    "nvdax_feed": "6TPsjFigUaMFanRCsxQ4WbmG215xhRBXsb5y5Cn5L6eE",
}

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
def b58d(s):
    n = 0
    for c in s: n = n * 58 + B58.index(c)
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return b"\0" * (len(s) - len(s.lstrip("1"))) + b

def rpc(method, params, tries=5):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(tries):
        try:
            r = urllib.request.Request(RPC, body, {"content-type": "application/json"})
            d = json.load(urllib.request.urlopen(r, timeout=45))
            if "result" in d: return d["result"]
        except Exception:
            pass
        time.sleep(1.5 * (i + 1))
    raise SystemExit(f"RPC failed: {method} {params}")

def dump(pubkey, account, name):
    path = os.path.join(OUT, name + ".json")
    json.dump({"pubkey": pubkey, "account": account}, open(path, "w"), indent=1)
    return path

def fetch(pubkey):
    v = rpc("getAccountInfo", [pubkey, {"encoding": "base64"}])["value"]
    if not v: raise SystemExit(f"account not found: {pubkey}")
    return v

def main():
    os.makedirs(OUT, exist_ok=True)
    authority = sys.argv[1]
    auth_bytes = b58d(authority)
    assert len(auth_bytes) == 32, "bad authority pubkey"

    for name, (mint, program) in MINTS.items():
        v = fetch(mint)
        data = bytearray(base64.b64decode(v["data"][0]))
        # SPL mint: mint_authority COption<Pubkey> = 4-byte tag + 32-byte key.
        data[0:4] = (1).to_bytes(4, "little")
        data[4:36] = auth_bytes
        v["data"] = [base64.b64encode(bytes(data)).decode(), "base64"]
        v["space"] = len(data)
        v["rentEpoch"] = 0
        dump(mint, v, f"mint-{name}")
        print(f"  mint-{name}: {mint[:8]}… len={len(data)} mintAuthority -> {authority[:8]}…")

    for name, addr in ORACLES.items():
        v = fetch(addr)
        v["rentEpoch"] = 0
        dump(addr, v, f"oracle-{name}")
        print(f"  oracle-{name}: {addr[:8]}… len={v['space']} (untouched, real Pyth bytes)")

if __name__ == "__main__":
    main()
