# Stocklana

A two-sided market where holders of tokenized equity on Solana write covered calls against idle positions, and any wallet can bid USDC premium for capped, non-liquidatable upside. Solana Foundation hackathon, deadline 25 September 2026 16:00 ET (extended from 18 September).

## Read these first, in order

1. `docs/BUILD_PLAN.md` — verified facts from live probes, and the decisions that close them. Start here.
2. `docs/ARCHITECTURE.md` — account layout, instructions, settlement math. Blocks B to E are transcription from this.
3. `docs/TASKS.md` — the checklist. Find the first unchecked box and continue.
4. `docs/constants.json` — every address and number the build depends on.

## Settled decisions, do not relitigate without a reason

- **Collateral is the stock token, payout is the stock token, priced by the oracle.** Not USDC collateral. The reason is in `BUILD_PLAN.md` §2 and §3.
- **Devnet is the demo, a mainnet fork is the proof.** Judges need a clickable URL. See §4.
- **Markets are config, not code.** Fourteen underlyings have live on-chain Pyth feeds. See §1.8.
- **The oracle owner check is never relaxed.** The devnet mirror is a separate program owning its own account.

## Working rules

- Conversation in Turkish, every deliverable in English. Documents, README, demo script, submission text.
- Never invent a market, protocol, liquidity or regulatory fact. Probe it, or say you do not know. Anything unverified is tagged `[ASSUMPTION]`.
- No number without a source or a derivation. `docs/verify_constants.sh` re-derives all of them; run it at the start of a session.
- A README claim is not a verified fact. A repo existing is not a repo working.
- Cutting scope is a decision, not a failure. The cut order is in `docs/TASKS.md`.
- Every mock is disclosed in the README and in the video. Undisclosed mocking is disqualifying.

## Traps already found, do not rediscover them

- **Pyth Hermes returns 401** for every feed including SOL/USD. Do not build against it. Read the on-chain feed account instead.
- **`GET /public/assets/{symbol}/price-data` returns `{"quote": null}`** after 21 seconds. It is not a price source.
- **The underlying is Token-2022 with extensions.** Use `anchor_spl::token_interface`. The legacy token program will fail on these mints.
- **`scaledUiAmount` multiplier is not always 1.** NVDAx sits at 1.0017. It is the corporate-action mechanism and it moves strikes. See `ARCHITECTURE.md` §3.
- **The issuer holds `permanentDelegate` and can pause the mint.** Neither is guardable. Both are disclosed, not hidden.
- **Equity feeds go stale for about 32 hours over a weekend.** Settlement rules in `BUILD_PLAN.md` §6 are written against that measurement.
- **Devnet has no xStocks mint and no live equity feed.** Only SOL/USD is fresh there.

## Toolchain

`anchor-cli 0.32.1`, `rustc 1.93.0`, `node v20.20.1`, `solana-cli 2.3.13` at `~/.local/share/solana/install/active_release/bin`, which is **not on PATH** until task A1 is done.

## Build

Always `./scripts/build.sh`, never bare `anchor build`.

`~/.cache` on this machine is owned by root, so `cargo-build-sbf` cannot create
`~/.cache/solana` and dies with `Failed to install platform-tools: Permission
denied (os error 13)`. The script redirects `HOME` to `.buildhome/` inside the
repo. The permanent fix needs a password and only the user can run it:

```
sudo chown -R "$USER" ~/.cache
```

`Cargo.lock` is committed and pinned. The platform-tools cargo is 1.84, so any
dependency needing `edition2024` or rustc 1.85 breaks the build. Four crates are
already pinned back: `proc-macro-crate`, `zeroize`, `indexmap`,
`unicode-segmentation` and friends. If a fresh `cargo update` reintroduces the
error, pin the offender to its newest release before 2025-02-01 rather than
upgrading the toolchain.

## Where the build stands

Blocks A through E are done. Run `yarn test:unit` for the settlement math and
`yarn test:fork` for the full lifecycle against a mainnet-forked validator
carrying the real TSLAx mint and the real Pyth account. Both should be green
before any change is considered finished.

The next block needs a funded deployer keypair, which the user supplies. Local
work uses `keys/localnet-payer.json`, a throwaway. `~/.config/solana/id.json`
exists on this machine but the user does not recognise it, so it is not the
deployer and must not be used or modified.

## Deployment

Everything is driven by `.env`. Copy `.env.example` and fill it in.

```
./scripts/preflight.sh      # checks cluster, deployer balance, program id, build. Spends nothing.
./scripts/deploy.sh         # build, deploy, register config and markets
./scripts/setup-markets.sh  # re-register markets only, idempotent
```

Markets live in `config/markets.<cluster>.json`. Mainnet holds all fourteen
xStocks with a live on-chain Pyth feed. Devnet holds SOL/USD, the only feed
genuinely live there, so it is the market with no mock in the price path.

Keys are referenced by file path. To bring in a base58 key of the kind Phantom
exports, use `./scripts/import-key.sh keys/devnet-deployer.json`, which reads it
at a hidden prompt so it never reaches shell history, and writes the file 0600.

`DEPLOYER_PRIVATE_KEY` exists for one case only: a hosted process with no
filesystem, such as the devnet price-mirror relayer in Block F. When set,
`env.sh` materialises it to `.runtime-keys/deployer.json` at 0600 and then
unsets it, so no child process or crash report inherits it. It is refused when
`CLUSTER=mainnet`. For local work use the file.

`scripts/deploy.sh` refuses to target mainnet; that is a deliberate manual step.

If the program keypair is replaced, run `./scripts/sync-program-id.sh` to
rewrite `declare_id!` and `Anchor.toml`, then rebuild.

## Devnet demo surface

Three markets, and the difference between them is the honesty story.

- **SOL/USD** settles against the real devnet Pyth feed. Nothing in its price path is mocked.
- **TSLAx and NVDAx** use replica Token-2022 mints that carry the real extension set (permanent delegate, pausable, scaled UI amount at NVDAx's real 1.0017 multiplier, null-program transfer hook) and prices mirrored from the mainnet Pyth accounts, publish time and confidence carried over unchanged.

`Market` records the feed account's owner at registration and re-checks it on every settlement, so a mirror is identifiable on-chain and the interface labels it. The oracle owner check was never weakened; it became per-market instead of hardcoded.

```
./scripts/mirror.sh --watch     # keep the devnet mirror fed from mainnet
./scripts/replica-mints.sh      # create the replica mints
./scripts/verify.sh             # what is actually deployed right now
```

The faucet lives at `web/src/app/api/faucet/route.ts` and signs with `FAUCET_AUTHORITY_SECRET`, server-side only. It is rate limited per wallet; a faucet drained during a demo is an avoidable failure.

## Running the interface

```
cd web && npm run dev          # the dev server owns .next
npm run build                  # writes to .next-build, never touches .next
```

Those two directories are deliberately separate. A production build sharing
`.next` with a running dev server corrupts that server's chunk manifest
mid-session, and the failure surfaces as a module resolution error that looks
like a dependency problem.

`./scripts/devnet-smoke.sh` runs one full lifecycle on devnet: write, bid,
accept, wait for expiry, settle. `SMOKE_SETTLE=0` leaves the position live,
which is how the screens get something to show. The buyer is a throwaway
keypair in `keys/devnet-demo-buyer.json` and is a seeded counterparty; say so.

The devnet premium mint is a test USDC created by `scripts/replica-mints.sh`.
Devnet's well-known USDC faucet mint is authority-held by someone else, so no
test balance of it can be handed out and no bid could ever be placed.

## Tests

```
./scripts/test-unit.sh    # settlement math, including nine proptest properties
./scripts/test-fork.sh    # 11 integration tests on a mainnet fork
```

The property tests are not decoration. They found that `adjust_strike` could
truncate a strike to zero under an extreme multiplier ratio, and a zero strike
pays the buyer the entire collateral. Keep them in any change to `math.rs`.

`tests/extensions.ts` builds its own Token-2022 mint with the xStocks extension
set and holds every authority, which is what makes it possible to pause a mint
and move a multiplier mid-position. The forked real mint cannot be used for
that: its pausable and scaled-amount authorities belong to the issuer, and only
the mint authority is patched in the fixtures.

## Deploy cost, learned the hard way

An upgrade needs roughly as much free balance as a first deploy, because the new
bytes are staged in a temporary buffer whose rent is about the program's own. It
comes back when the buffer closes, so it is a float requirement, not a cost.
`scripts/preflight.sh` asks the cluster for the exact figure with `solana rent`
rather than assuming a lamports-per-byte rate; a hardcoded one was wrong by a
factor of two and reported a sufficient balance as insufficient.

Extending a program account **cannot be undone**. It can grow and not shrink, and
the rent is gone. Extending by a round 200,000 bytes when 58,000 was needed cost
about 1.4 devnet SOL for nothing. `scripts/deploy.sh` now sizes extends from the
artifact; do not extend by hand.

If an upgrade fails partway it can strand a buffer holding that rent.
`./scripts/reclaim-buffers.sh` lists and closes them.
