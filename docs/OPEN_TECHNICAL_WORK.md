# Technical work still open

Written 16 September 2026 by reading the program and the interface rather than from a checklist. Two items at the top were found during this pass and are already fixed; the rest are open, ordered by whether they can cost someone money.

---

## Fixed in this pass

### The writer held a free option on the bid itself

`accept_bid` checked that the offer was `Open` but never checked the clock, while `place_bid` did. So a writer could take a bid **after expiry**: wait, see where the price landed, and accept only when the call had already expired worthless. The bidder paid for time value that no longer existed, and the writer paid nothing for the privilege of choosing.

Not a crash and not an exploit of the vault. An economic one, which is the kind that survives a review that only looks for panics. Fixed, and a test now asserts the refusal and that the bidder can still withdraw afterwards.

### An unsold offer locked collateral for its whole term

`reclaim` required expiry. Write a thirty-day call, get no bids in the first hour, and the collateral was stuck for thirty days. The expiry check was never doing any work: `Open` already means no bid was accepted, so no premium was taken and no counterparty exists. Removed. Bidders are unaffected because once the offer leaves `Open`, `refund_bid` lets them out.

---

## Open, in order of what it can cost

### 1. The configuration is immutable after deployment

There is no `update_config`. `fee_bps`, `min_duration` and `fee_destination` are written once by `init_config` and can never change. If the fee destination account is ever closed, every `accept_bid` fails permanently and the only remedy is a program upgrade. Three instructions' worth of work, and the absence is a live single point of failure rather than a missing feature.

### 2. Nothing is fuzzed

`settlement_split` and `adjust_strike` are covered by seven hand-written cases. They are the two functions that decide who gets paid, they run on `u128` intermediates and an `f64` ratio, and nobody has thrown a few million random inputs at them. Trident is the tool. This is the single highest-value item before any real money.

### 3. Two settlement paths are asserted in unit tests and never exercised on-chain

The confidence gate and the multiplier adjustment both have unit tests for the arithmetic and neither has an integration test against a real mint. The replica mints exist and their authority is ours, so both are now cheap to test properly: pause a mint and assert `settle` fails cleanly, move a multiplier between write and settle and assert the strike adjusts. Until that exists, the corporate-action story is a claim about code that has only ever run in isolation.

### 4. The offer book reads every account and filters in the browser

`useOffers` calls `program.account.offer.all()` and `bid.all()` and filters client-side. At three offers this is invisible. At a few thousand it is a multi-megabyte response on every poll, on a public RPC endpoint that will rate limit long before that. The fix is `memcmp` filters on the market field, which the Anchor client supports directly.

### 5. Everything polls; nothing subscribes

Oracles are polled every ten seconds and offers every twelve. Solana has account subscriptions over websocket. Polling is the right first version and the wrong permanent one: it is slower to show a change and heavier on the endpoint at the same time.

### 6. Transactions are sent without simulating first

A user signs, waits, and then learns the transaction failed. `simulate()` before `rpc()` turns most failures into a message before the wallet ever opens. The error translation in `readableError` is already there; it is being used at the wrong end of the flow.

### 7. Settled offers accumulate with no archive path

`Offer` is deliberately never closed, because it is the settlement receipt. That is the right call and it has a consequence nobody has planned for: the account count only grows, and item 4's query gets heavier forever. A receipt that has been read could be closed by its writer after some window, or the interface could page by state. Neither is designed.

### 8. There is no continuous integration

`./scripts/test-unit.sh` and `./scripts/test-fork.sh` both pass and both run only when someone remembers. A fork test needs a mainnet RPC and takes about twenty seconds, which is well within what a CI job can do on every push.

### 9. The mirror relayer has no supervision

`scripts/mirror.sh --watch` runs in a terminal. If it dies, devnet prices silently freeze and the only symptom is a staleness number climbing on a screen nobody is watching. It needs to run as a service, and the interface already has the right place to surface it: the feed health list on the activity screen could show when the mirror last pushed, not just when the source last printed.

### 10. The faucet's rate limit is per process

`lastClaim` is an in-memory `Map`. Restart the server and every cooldown resets; run two instances and there is no shared limit at all. Correct for a single deployment and wrong the moment there are two.

---

## Deliberately not doing

**Closing the `Offer` account on settlement.** It is the receipt. See item 7 for the cost, which is accepted.

**An `emergency_pause` on the protocol.** Tempting, and it would mean the authority can stop settlements on live positions where writers and buyers have already committed. The upgrade authority is the honest place for that power, and it is already disclosed.

**Reading the underlying's AMM price on-chain to show a basis.** It would need a Jupiter or pool integration in the program, and the settlement feed is the only price that decides anything. Showing a second price is an interface job, which is item R1 on the checklist.
