# Interface design brief

The interface is built as a product, not as a hackathon demo. No "submission" language, no judge-facing copy, no landing-page funnel. Someone who finds this without knowing a hackathon exists should read it as a working application.

## Decisions

**The palette is the supplied one, not the tool's.** `ui-ux-pro-max` recommended a slate and green system (`#0F172A` / `#22C55E`). The supplied workbook is a complete semantic token set with both themes, which is stronger: it already separates brand, background, border, text and status roles rather than naming raw colours. It wins.

| Role | Dark | Light |
|---|---|---|
| brand / primary | `#11B2BA` | `#11B2BA` |
| brand / hover | `#12949D` | `#12949D` |
| brand / muted | `#1C6F7C` | `#1C6F7C` |
| bg / primary | `#1B1F2C` | `#F7F8F8` |
| bg / secondary | `#272D3E` | `#FFFFFF` |
| bg / tertiary | `#151924` | `#EDEEF1` |
| bg / quaternary | `#0D1016` | `#E2E3E5` |
| border / primary | `#FFFFFF` | `#B6BAC3` |
| border / secondary | `#445371` | `#EDEEF1` |
| text / primary | `#FFFFFF` | `#272D3E` |
| text / secondary | `#B6BAC3` | `#8E95A2` |
| text / muted | `#7D7F82` | `#7D7F82` |
| status / success | `#3BC171` | `#3BC171` |
| status / warning | `#FFB800` | `#FFB800` |
| status / error | `#FF647C` | `#FF647C` |

Both themes ship. Dark is the default because the product is a trading surface and the supplied dark set is the richer one.

**Typography is Inter**, taken from the tool's recommendation for fintech and trading surfaces. It carries tabular figures, which matters on every screen here.

**The tool's "Enterprise Gateway" page pattern is rejected.** It prescribes a hero video, solutions-by-industry, client logos and a Contact Sales call to action. That is a lead-generation site for a company that sells software. This is the software. The shell is an application: persistent navigation, a market list, a market view, positions.

## What the screens are

1. **Markets.** Every registered market with its live oracle price, the age of that print, and its confidence band. The staleness column is not decoration: it is the number that decides whether settlement can happen at all.
2. **Market detail.** Write a call against a position, see the open offer book, place or accept a bid.
3. **Positions.** What is written, what is filled, what is settled, with the settlement receipt: the price used, the strike after any multiplier adjustment, the publish time and the confidence.

## Rules this interface follows

- **Numbers are tabular and never lie about precision.** A payout of 0.99999999 is shown as 0.99999999, not rounded to 1.
- **Oracle state is always visible where it matters.** Any screen that can lead to a settlement shows the publish time and the confidence band, because a stale or wide print is the difference between a correct settlement and a wrong one.
- **Empty states say what to do, not "no data".** A market with no offers is the normal state of a new market, not an error.
- **The network is stated plainly in the shell.** A devnet deployment says devnet, once, in the chrome, the way a real product marks a test environment. It is not apologised for in body copy.
- **Mocked data is labelled at the point of use.** A mirrored price is labelled on the row that shows it, with the mainnet account it mirrors.

## Accessibility floor, from the tool's checklist

Contrast at least 4.5:1 for body text in both themes. Focus rings visible and never removed. Touch targets at least 44×44. Transitions 150 to 300ms and disabled under `prefers-reduced-motion`. SVG icons only, no emoji. Breakpoints exercised at 375, 768, 1024 and 1440.
