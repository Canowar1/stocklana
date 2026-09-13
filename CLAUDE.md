# Stocklana

A two-sided market where holders of tokenized equity on Solana write covered calls against idle positions, and any wallet can bid USDC premium for capped, non-liquidatable upside. Solana Foundation hackathon, deadline 18 September 2026 16:00 ET.

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
