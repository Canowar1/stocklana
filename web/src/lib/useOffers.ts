"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useReadProgram, offerStateOf, OfferState } from "./program";

export type Offer = {
  address: string;
  market: string;
  writer: string;
  offerId: bigint;
  collateralAmount: bigint;
  strikeUsd: bigint;
  expiryTs: number;
  minPremium: bigint;
  state: OfferState;
  buyer: string | null;
  premiumPaid: bigint;
  settledPrice: bigint;
  settledStrike: bigint;
  payoutAmount: bigint;
};

export type Bid = {
  address: string;
  offer: string;
  bidder: string;
  amount: bigint;
  state: "active" | "cancelled" | "won" | "refunded";
  createdAt: number;
};

const ZERO = "11111111111111111111111111111111";

export function useOffers(marketAddress?: string) {
  const program = useReadProgram();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Filtered at the RPC node, not in the browser. `offer.all()` returns
      // every offer the program has ever written and only grows; a memcmp on
      // the market field, which sits immediately after the discriminator,
      // keeps the response proportional to one market instead of the protocol.
      const offerFilter = marketAddress
        ? [{ memcmp: { offset: 8, bytes: marketAddress } }]
        : undefined;

      const [rawOffers, rawBids] = await Promise.all([
        program.account.offer.all(offerFilter),
        program.account.bid.all(),
      ]);

      const mapped: Offer[] = rawOffers.map(({ publicKey, account }) => {
        const a = account as Record<string, any>;
        const buyer = a.buyer.toBase58();
        return {
          address: publicKey.toBase58(),
          market: a.market.toBase58(),
          writer: a.writer.toBase58(),
          offerId: BigInt(a.offerId.toString()),
          collateralAmount: BigInt(a.collateralAmount.toString()),
          strikeUsd: BigInt(a.strikeUsd.toString()),
          expiryTs: Number(a.expiryTs.toString()),
          minPremium: BigInt(a.minPremium.toString()),
          state: offerStateOf(a.state),
          buyer: buyer === ZERO ? null : buyer,
          premiumPaid: BigInt(a.premiumPaid.toString()),
          settledPrice: BigInt(a.settledPrice.toString()),
          settledStrike: BigInt(a.settledStrike.toString()),
          payoutAmount: BigInt(a.payoutAmount.toString()),
        };
      });

      const mappedBids: Bid[] = rawBids.map(({ publicKey, account }) => {
        const a = account as Record<string, any>;
        return {
          address: publicKey.toBase58(),
          offer: a.offer.toBase58(),
          bidder: a.bidder.toBase58(),
          amount: BigInt(a.amount.toString()),
          state: (Object.keys(a.state)[0]?.toLowerCase() ?? "active") as Bid["state"],
          createdAt: Number(a.createdAt.toString()),
        };
      });

      setOffers(mapped);
      setBids(mappedBids);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read offers");
    } finally {
      setLoading(false);
    }
  }, [program, marketAddress]);

  useEffect(() => {
    load();
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [load]);

  return { offers, bids, loading, error, refresh: load };
}

export function bidsFor(bids: Bid[], offerAddress: string) {
  return bids
    .filter((b) => b.offer === offerAddress && b.state === "active")
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

export function marketAddressFor(mint: string, feedId: string, pdaMarket: (m: PublicKey, f: Buffer) => PublicKey) {
  return pdaMarket(new PublicKey(mint), Buffer.from(feedId, "hex")).toBase58();
}
