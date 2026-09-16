# What the established interfaces do, and what we take

Reviewed 16 September 2026 by opening each product and reading the live screens. Nothing here is from memory. Kamino is missing because its application body would not render in the browser used, and a claim about an interface nobody looked at is worth less than no claim.

---

## Derive, on-chain options

**Spot is drawn inside the strike ladder.** A blue dotted line reading `ETH $2,385.03` sits physically between the $2,375 and $2,400 rows. Moneyness is therefore spatial: you see which strikes are above the money without computing anything. This is the single best idea across all three products.

**Expiry carries a date and a countdown together.** The chain header reads `Sat Sep 19  2d 23h 46m`. Neither alone is enough; the date is for planning and the countdown is for urgency.

**Term structure is a horizontal tab strip.** Sep 17, Sep 18, Sep 19, Sep 20, Sep 25, Oct 2, Oct 30, Nov 27, Dec 25, Mar 26 2027. Switching expiry is one click and never leaves the page.

**The trade form is permanent and empty until you select something.** The right rail always shows `Trade Form` and a `Payoff / Greeks / Trades / Book` tab set, with `Select an instrument to view` in place of content. The layout never jumps when a selection happens.

**The ticket states its cost before a wallet is connected.** `Max Cost`, `Margin Required`, `Buying Power`, `Est. Fee`, `Est. Rewards` are visible with a `Connect a Wallet` button below them, not behind it.

## Hyperliquid, perpetuals

**Mark and Oracle are two separate labelled numbers, side by side in the header.** `Mark 77.429` and `Oracle 77.451`. Two prices for the same asset, both shown, neither hidden. This is the production answer to the question our own settlement design raises, and it is the answer the Pyth track is asking for.

**The consequence panel is a key-value list under the order form**, and it updates as you type: `Liquidation Price`, `Order Value`, `Margin Required`, `Slippage  Est: 0% / Max: 8.00%`, `Fees  0.0450% / 0.0150%`. Terse, aligned, no prose.

**Balance is above the size input, not below it.** `Available to Trade  0.00 USDC` and `Current Position  0.00 HYPE` sit between the buy/sell toggle and the amount field, so the constraint is read before the number is typed rather than after.

**Connection health is always on screen.** A small `● Online` sits bottom-left at all times.

**The live price is in the browser tab title**, which updates continuously. The tab becomes a ticker when the window is in the background.

## Deribit, the options terminal

**Spot is again drawn inside the strike ladder**, as a highlighted `75,457` row between 75,000 and 75,500. Two independent products converged on this, which is the strongest signal in this document.

**Time to expiry is a first-class header metric with the contract type**: `Time to Expiry: 23h 45m (Daily)` beside `Underlying future: $75,457.22` and `IV: 44.4%`.

**Each price cell carries two denominations stacked**: `0.0965` over `$7279.69`, the contract's own unit and the fiat equivalent, in one cell without a toggle.

**Density is solved by letting the reader choose, not by showing less.** The chain has roughly nineteen columns, and the toolbar offers `Expiry dates`, `Columns` and `Filter` plus a CSV export. The answer to "this is too much" is a column picker, not a simpler table.

---

## What we take

Ordered by value to this product.

1. **A payoff diagram.** Neither Hyperliquid nor Deribit needs one; Derive has one for a reason. Our whole pitch is that the payoff is capped and the collateral always covers it, and no sentence explains that as fast as the shape does. On the write form it should redraw as the strike is typed.

2. **Two prices, both labelled.** Hyperliquid's Mark and Oracle becomes, for us, the settlement feed beside the equity reference feed, each with its own publish time. This is exactly what `docs/SIDE_TRACKS.md` proposed for the Pyth track, and seeing it solved in production settles the layout question.

3. **The consequence panel as a key-value list.** Our "What you are agreeing to" card is currently prose bullets. It says the right things and reads slowly. Convert it to aligned rows: maximum payout, what is kept below the strike, the premium floor, the fee, and the liquidation price stated as `None` rather than omitted. Stating `None` where every competitor shows a number is the point.

4. **Balance above the input.** A one-line move with a real effect: the size field's constraint is read before the number is typed.

5. **The live price in the tab title.** Cheap, and it makes an open tab useful.

6. **Spot drawn inside the ladder**, once there is a ladder. Today each market has one strike per offer and there is nothing to draw it into. The moment the offer book holds several strikes, they sort by strike with the oracle price as a line between them.

## What we deliberately do not take

**The option chain grid.** Nineteen columns of bid, ask, and two-sided IV exist because those products quote a continuous surface. We have one strike per offer and an escrowed bid book. Copying the grid would be borrowing the appearance of liquidity we do not have, which is worse than looking simple.

**Implied volatility and greeks.** We have no IV surface and no pricing model. Columns computed from a model we did not build, presented next to prices that are real, would be the least honest thing on the screen.

**Leverage and margin controls.** There is no leverage here and no margin. The absence is the product.

**A column picker.** Deribit needs one at nineteen columns. We have six, and a configurator for six columns is complexity pretending to be power.
