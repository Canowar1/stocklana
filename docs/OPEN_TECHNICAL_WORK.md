# Technical work still open

First written 16 September 2026 by reading the program and the interface rather than from a checklist. Updated 18 September. Everything under **Closed** has been done and tested; the rest is open, ordered by whether it can cost someone money.

---

## Closed

### The configuration is now mutable by its authority

`update_config` takes `fee_bps`, `min_duration` and `new_authority` as options and the fee destination as an optional account, so one field can move without restating the others. It cannot reach a live position: offers carry their own terms, and both parameters are read when a call is written and when a bid is accepted, never at settlement. A test covers the partial update, that omitted fields are left alone rather than reset, and that nobody but the authority can call it.

The single point of failure this closes was a closed fee-destination account making every `accept_bid` fail permanently, with a program upgrade as the only remedy.

### The settlement math is fuzzed, and the fuzzer found something

Nine properties over twenty thousand generated cases each, with `proptest`. The properties are the ones worth stating out loud: the payout never exceeds the collateral at any price, the split conserves it exactly, nothing is paid at or below the strike, the payout is monotonic in the settlement price, rounding favours the writer by strictly less than one base unit, the strike adjustment round-trips, an unchanged multiplier leaves the strike untouched, the premium split conserves the premium, and the confidence gate never panics.

**It found a real hazard on the twelve-thousandth case.** `adjust_strike` could truncate a small strike to zero under an extreme multiplier ratio, and a zero strike pays the buyer the *entire* collateral, because `collateral × (S − 0) ÷ S` is all of it. A corporate action of that scale has no sensible settlement anyway, so the program now refuses with `StrikeAdjustedToZero` rather than silently converting a covered call into an outright transfer. The collateral stays where it is and a person decides.

This is the argument for fuzzing in one paragraph. Seven hand-written cases had passed for days.

**Still open:** this covers the pure math. Fuzzing the *instruction surface*, which is what Trident does, is a separate job and is not done. It is the only substantial testing gap left.

### Settled receipts have an archive path

`close_offer` returns the rent of a finished offer to the writer who paid it. Only the writer, only once the offer has settled or been reclaimed, and only thirty days after expiry. Nobody can make a receipt disappear from under a counterparty still reading it, and the receipt outlives the account either way: the `Settled` event carries the price, the adjusted strike, the publish time, the confidence and the split, and transaction history does not expire.

The pressure that made this matter is also gone. The offer book now filters at the RPC node with a `memcmp` on the market field instead of fetching every offer the program has ever written and filtering in the browser, so the response is proportional to one market rather than to the protocol's whole history.

### Continuous integration runs on every push

`.github/workflows/ci.yml` has three jobs. The math job runs the unit and property tests with no toolchain and no network, so a broken invariant is reported in under a minute. The program job installs the Solana toolchain and Anchor, boots the mainnet fork and runs the twelve integration tests. The web job type-checks and builds the interface.

Two supporting changes made this possible. `scripts/build.sh` now engages the `HOME` redirect **only when `~/.cache` is not writable**, which is this one developer's machine; on CI the redirect is skipped and the real cargo cache is used. And the fork's mainnet endpoint reads `MAINNET_RPC_URL`, so CI can use a private endpoint instead of being rate limited on the public one.

### The mirror has a heartbeat and a supervisor

The relayer now records `last_pushed_at` on-chain, by the target chain's clock, separately from the source publish time it copies. Those two being one field was the reason a dead relayer was invisible: a source that has not printed since Friday and a relayer that died on Saturday look identical from the price alone.

The activity screen reads it. A mirrored feed shows when the mirror last pushed and how many pushes it has made, and turns red past fifteen minutes. `scripts/mirror-service.sh` supervises the relayer with exponential backoff that resets after a healthy run, and `deploy/fi.stocklana.mirror.plist` runs that under launchd.

### The confidence gate and the multiplier adjustment now run on-chain

`tests/extensions.ts` creates a Token-2022 mint carrying the same extension set as the xStocks mints, with every authority held by the test, and drives three paths that previously existed only in unit tests:

- A paused mint refuses to settle with `MintPaused`, the offer stays `Filled` with the collateral untouched, and the same settlement succeeds once the mint resumes. The refusal being retryable rather than partial is the part that matters.
- A multiplier doubled between writing and settlement halves the strike. The assertion is not just on the stored field: a call written out of the money at 1.2 times spot becomes in the money after the adjustment, and the payout matches the split computed from the adjusted strike. That proves the adjustment reached the arithmetic and not only the record.
- A one-basis-point confidence ceiling refuses the real feed's genuine two-basis-point band. The number that triggers it is Pyth's, not one invented for the test.

Eleven integration tests now, on a mainnet fork, against the real TSLAx mint and the real Pyth account.

---

## Fixed in an earlier pass

### The writer held a free option on the bid itself

`accept_bid` checked that the offer was `Open` but never checked the clock, while `place_bid` did. So a writer could take a bid **after expiry**: wait, see where the price landed, and accept only when the call had already expired worthless. The bidder paid for time value that no longer existed, and the writer paid nothing for the privilege of choosing.

Not a crash and not an exploit of the vault. An economic one, which is the kind that survives a review that only looks for panics. Fixed, and a test now asserts the refusal and that the bidder can still withdraw afterwards.

### An unsold offer locked collateral for its whole term

`reclaim` required expiry. Write a thirty-day call, get no bids in the first hour, and the collateral was stuck for thirty days. The expiry check was never doing any work: `Open` already means no bid was accepted, so no premium was taken and no counterparty exists. Removed. Bidders are unaffected because once the offer leaves `Open`, `refund_bid` lets them out.

---

## Blocked on funding, not on work

The program and the mirror are built and tested and **not yet deployed to devnet**. The deployer holds 1.07 SOL and an upgrade needs roughly 3.5 available, because the new bytes are staged in a temporary buffer whose rent is about the program's own. That rent comes back when the buffer closes, so this is a float requirement rather than a cost.

Devnet currently runs the previous build. It works: three markets, live oracles, the full lifecycle. What it is missing is `close_offer`, `update_config`, the mirror heartbeat and the strike-to-zero guard.

Part of the shortfall is self-inflicted and worth recording. Extending the mirror program account by a round 200,000 bytes when it needed about 58,000 cost roughly 1.4 SOL in rent that cannot be recovered, because a program account can grow and not shrink. `scripts/deploy.sh` now sizes every extend from the artifact plus a tenth, and `scripts/reclaim-buffers.sh` closes buffers stranded by a failed upgrade.

To unblock: fund `HwupKzvXRfrxnfSQ3bNoYbXiWS7TWXBWURb6JpZq5kup` with about 4 devnet SOL from https://faucet.solana.com, then `./scripts/deploy.sh`.

---

## Open, in order of what it can cost

### 1. Everything polls; nothing subscribes

Oracles are polled every ten seconds and offers every twelve. Solana has account subscriptions over websocket. Polling is the right first version and the wrong permanent one: it is slower to show a change and heavier on the endpoint at the same time.

### 2. Transactions are sent without simulating first

A user signs, waits, and then learns the transaction failed. `simulate()` before `rpc()` turns most failures into a message before the wallet ever opens. The error translation in `readableError` is already there; it is being used at the wrong end of the flow.

### 3. The faucet's rate limit is per process

`lastClaim` is an in-memory `Map`. Restart the server and every cooldown resets; run two instances and there is no shared limit at all. Correct for a single deployment and wrong the moment there are two.

---

## Deliberately not doing

**Closing the `Offer` account automatically on settlement.** It is the receipt, and it stays until its writer chooses to archive it after the window. Doing it automatically would take the choice away from the person who paid for the account.

**An `emergency_pause` on the protocol.** Tempting, and it would mean the authority can stop settlements on live positions where writers and buyers have already committed. The upgrade authority is the honest place for that power, and it is already disclosed.

**Reading the underlying's AMM price on-chain to show a basis.** It would need a Jupiter or pool integration in the program, and the settlement feed is the only price that decides anything. Showing a second price is an interface job, which is item R1 on the checklist.
