import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="text-sm font-medium text-ink-primary">That market does not exist here</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-secondary">
        It may be configured for a different network. Markets available on this one are listed on
        the markets page.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-medium text-ink-onBrand transition-colors hover:bg-brand-hover"
      >
        Back to markets
      </Link>
    </div>
  );
}
