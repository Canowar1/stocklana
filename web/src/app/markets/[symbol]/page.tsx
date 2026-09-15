import { notFound } from "next/navigation";
import { MARKETS } from "@/lib/config";
import { MarketDetail } from "@/components/MarketDetail";

export function generateStaticParams() {
  return MARKETS.map((m) => ({ symbol: m.symbol }));
}

export default async function Page({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const market = MARKETS.find((m) => m.symbol === symbol);
  if (!market) notFound();
  return <MarketDetail market={market} />;
}
