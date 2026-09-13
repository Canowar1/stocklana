# What is missing, measured

Every number here was probed on 14 September 2026 from public, unauthenticated sources: DefiLlama's protocol API, the Kamino API, Jupiter Price v3, and Solana mainnet RPC. Nothing is quoted from memory or from a project's own marketing.

---

## 1. The asset base exists and it is large

The fourteen xStocks that have a live on-chain Pyth feed, valued at the price sitting in their feed accounts:

| Symbol | Outstanding | Price | Value |
|---|---:|---:|---:|
| TSLAx | 229,637 | $365.23 | $83.9M |
| CRCLx | 821,079 | $91.67 | $75.3M |
| SPYx | 95,232 | $769.91 | $73.3M |
| NVDAx | 321,280 | $219.52 | $70.5M |
| HOODx | 597,389 | $112.31 | $67.1M |
| MSTRx | 478,994 | $131.27 | $62.9M |
| QQQx | 84,361 | $717.39 | $60.5M |
| GOOGLx | 160,407 | $339.94 | $54.5M |
| AAPLx | 153,764 | $334.09 | $51.4M |
| METAx | 72,378 | $649.62 | $47.0M |
| GLDx | 116,269 | $398.63 | $46.3M |
| COINx | 136,179 | $176.19 | $24.0M |
| MCDx | 54,640 | $258.95 | $14.1M |
| NFLXx | 155,057 | $77.98 | $12.1M |
| **Total** | | | **$743.0M** |

That is the addressable base, and it is not speculative. It is token supply multiplied by oracle price.

---

## 2. Almost none of it does anything

Two venues can absorb tokenized equity on Solana today. Both were measured.

**AMM pools**, from Jupiter Price v3 liquidity across the same fourteen assets: **$14.4M**, or **1.93%** of outstanding. SPYx leads at $4.1M. NFLXx has $5,566, which is not a market.

**Kamino's dedicated xStocks Market** (`5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua`), thirteen reserves, deposits valued at oracle prices: roughly **$20.7M**, or **2.8%** of outstanding.

So about **5% of tokenized equity on Solana is deployed in anything at all.** The other 95% sits in wallets.

---

## 3. The 5% that is deployed earns nothing

This is the part that decides whether the product has a reason to exist. Kamino's xStocks Market, supply APY and utilization as measured:

| Asset | Supplied | Borrowed | Utilization | Supply APY |
|---|---:|---:|---:|---:|
| MSTRx | 29,546 | 0 | 0.00% | **0.00%** |
| NVDAx | 11,204 | 41.4 | 0.37% | **0.02%** |
| CRCLx | 9,560 | 0 | 0.00% | **0.00%** |
| GOOGLx | 8,208 | 0 | 0.00% | **0.00%** |
| TSLAx | 7,552 | 3.8 | 0.05% | **0.00%** |
| HOODx | 5,563 | 0 | 0.00% | **0.00%** |
| SPYx | 5,301 | 116.5 | 2.20% | **0.09%** |
| QQQx | 3,881 | 63.6 | 1.64% | **0.07%** |
| AAPLx | 1,385 | 0 | 0.00% | **0.00%** |
| METAx | 0.001 | 0 | 0.00% | **0.00%** |

For contrast, USDC in the same market: 3.94% supply APY at 87% utilization.

**The best available answer today, for someone holding tokenized equity on Solana, pays zero.** Not a low number. Zero, to two decimal places, on nine of the ten equity reserves.

The mechanism is not mysterious. Lending pays interest when somebody borrows, and borrowing a tokenized stock is how you short it. Nobody is shorting tokenized TSLA on Solana, so utilization is 0.05% and the rate is zero. Supplying to a lending market is not a yield strategy for this asset. It is a deposit that happens to pay nothing.

---

## 4. Nobody offers options on it. Nobody offers options at all.

Every Solana protocol DefiLlama classifies under Options, Options Vault, or Exotic Options:

| Protocol | TVL now | Peak | Peak date |
|---|---:|---:|---|
| Friktion | **$0** | $164.1M | Apr 2022 |
| PsyOptions | $571k | $105.8M | Jan 2022 |
| Katana | $1.92M | $43.7M | Jan 2022 |
| Zeta | **$0** | $21.8M | Apr 2024 |
| Dual Finance | $223k | $16.7M | Mar 2024 |
| Cega V1 | $308k | | |
| Chest Finance | $640k | | |
| Exotic Markets | $5.8k | | |
| OptiFi | **$0** | | |

The whole category is roughly **$3.7M** and every protocol in it is down 95% or more from its peak. Meanwhile Jupiter Perpetual Exchange alone holds **$748M**, and the Derivatives category on Solana is over $800M.

None of the options protocols above touches tokenized equity. The option surface for $743M of tokenized stock on Solana is **zero instruments**.

---

## 5. The gap, in one paragraph

There is $743M of tokenized equity on Solana. Ninety-five percent of it is idle. The five percent that is deployed earns 0.00%, because the only venue that accepts it is a lending market and nobody wants to borrow a stock they cannot short profitably. Solana has $800M of derivatives volume infrastructure, all of it perpetual futures on crypto. It has no options venue with a pulse, and not one instrument on tokenized equity. The holder of a tokenized stock has exactly two actions available: sell it, or deposit it somewhere that pays nothing.

---

## 6. The objection this data raises, and the answer

**The objection.** Solana options are not an empty field, they are a graveyard. Friktion raised real money, reached $164M, and went to zero. PsyOptions, Katana and Zeta followed. A judge who knows this asks why the sixth attempt works.

**Do not wave this away.** The honest answer has two parts.

*First, the failure mode was specific.* Those were DeFi option vaults selling weekly calls on SOL, BTC and ETH, priced by RFQ to a small closed set of market makers, in an asset class where giving up upside was catastrophic and where depositors could not evaluate the premium they were being paid. The vault hid the trade. Depositors underperformed holding, and left. That is a pricing and disclosure failure as much as a product failure, and it is the reason the price here is discovered in an open auction that anyone can bid into, with the trade shown as a trade rather than as yield.

*Second, the asset class did not exist.* In April 2022 there was no tokenized equity on Solana to write calls against. The $743M in §1 is a 2025 and 2026 phenomenon. The graveyard is a graveyard of crypto-underlying options. It is evidence about that product, not about this one.

**The sharper version of the same objection**, which the data in §3 raises directly: if borrow demand for TSLAx is 0.05%, meaning nobody wants the asset, why would anybody pay premium for a call on it?

Because those are different demands. Zero borrow demand means nobody wants to short tokenized equity. A call buyer is long. The build contract's observation about onchain capital preferring leveraged price exposure over spot is about long leverage, and the $748M sitting in Jupiter Perps against $14M of xStocks pool liquidity is the same preference measured on Solana. Whether that preference extends to equity underlyings is the load-bearing assumption, and it stays load-bearing. It is now stated against numbers instead of against a feeling.

---

## 7. What this means for the pitch

- The user's alternative is not "a worse rate." It is **0.00%**. That is a stronger baseline than anything the original build contract assumed.
- "Why Solana" gets a second leg. The asset exists here at scale, its oracle is pushed here continuously, and the settlement can touch both in one transaction. None of those three is true anywhere else at the same time.
- Do not claim the options category is empty because nobody thought of it. Say it is empty because the previous generation died, name them, and say what is different. A judge who already knows the history will trust everything else more.

---

## 8. Reproduce

```bash
# Kamino xStocks market: supply APYs and utilization
curl -s https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics

# Solana options protocols and their history
curl -s https://api.llama.fi/protocols
curl -s https://api.llama.fi/protocol/friktion

# xStocks pooled liquidity
curl -s "https://lite-api.jup.ag/price/v3?ids=<comma separated mints from docs/constants.json>"
```
Outstanding supply comes from the mints, prices from the feed accounts, both listed in `docs/constants.json`.
