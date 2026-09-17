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

**Still open:** this covers the pure math. Fuzzing the *instruction surface*, which is what Trident does, is a separate job and is not done.

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

## Open, in order of what it can cost

### 1. The offer book reads every account and filters in the browser

`useOffers` calls `program.account.offer.all()` and `bid.all()` and filters client-side. At three offers this is invisible. At a few thousand it is a multi-megabyte response on every poll, on a public RPC endpoint that will rate limit long before that. The fix is `memcmp` filters on the market field, which the Anchor client supports directly.

### 2. Everything polls; nothing subscribes

Oracles are polled every ten seconds and offers every twelve. Solana has account subscriptions over websocket. Polling is the right first version and the wrong permanent one: it is slower to show a change and heavier on the endpoint at the same time.

### 3. Transactions are sent without simulating first

A user signs, waits, and then learns the transaction failed. `simulate()` before `rpc()` turns most failures into a message before the wallet ever opens. The error translation in `readableError` is already there; it is being used at the wrong end of the flow.

### 4. Settled offers accumulate with no archive path

`Offer` is deliberately never closed, because it is the settlement receipt. That is the right call and it has a consequence nobody has planned for: the account count only grows, and item 1's query gets heavier forever. A receipt that has been read could be closed by its writer after some window, or the interface could page by state. Neither is designed.

### 5. There is no continuous integration

`./scripts/test-unit.sh` and `./scripts/test-fork.sh` both pass and both run only when someone remembers. A fork test needs a mainnet RPC and takes about twenty seconds, which is well within what a CI job can do on every push.

### 6. The mirror relayer has no supervision

`scripts/mirror.sh --watch` runs in a terminal. If it dies, devnet prices silently freeze and the only symptom is a staleness number climbing on a screen nobody is watching. It needs to run as a service, and the interface already has the right place to surface it: the feed health list on the activity screen could show when the mirror last pushed, not just when the source last printed.

### 7. The faucet's rate limit is per process

`lastClaim` is an in-memory `Map`. Restart the server and every cooldown resets; run two instances and there is no shared limit at all. Correct for a single deployment and wrong the moment there are two.

---

## Deliberately not doing

**Closing the `Offer` account on settlement.** It is the receipt. See item 4 for the cost, which is accepted.

**An `emergency_pause` on the protocol.** Tempting, and it would mean the authority can stop settlements on live positions where writers and buyers have already committed. The upgrade authority is the honest place for that power, and it is already disclosed.

**Reading the underlying's AMM price on-chain to show a basis.** It would need a Jupiter or pool integration in the program, and the settlement feed is the only price that decides anything. Showing a second price is an interface job, which is item R1 on the checklist.
