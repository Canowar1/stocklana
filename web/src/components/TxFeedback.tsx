"use client";

import { EXPLORER } from "@/lib/config";
import { IconCheck, IconWarning, IconExternal } from "./icons";

export type TxState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "confirming"; signature: string }
  | { kind: "done"; signature: string; message: string }
  | { kind: "error"; message: string };

/**
 * A transaction is the moment the product either works or does not, so the
 * result is stated in place rather than as a toast that disappears before it
 * is read, and a failure always names what went wrong.
 */
export function TxFeedback({ state }: { state: TxState }) {
  if (state.kind === "idle") return null;

  if (state.kind === "signing" || state.kind === "confirming") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-bg-tertiary px-4 py-3 text-xs">
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <span className="text-ink-secondary">
          {state.kind === "signing" ? "Waiting for your wallet" : "Confirming on-chain"}
        </span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-state-errorBg px-4 py-3" role="alert">
        <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-state-error" />
        <p className="text-xs leading-relaxed text-ink-primary">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-state-successBg px-4 py-3">
      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-state-success" />
      <div className="min-w-0 text-xs leading-relaxed">
        <p className="text-ink-primary">{state.message}</p>
        <a
          href={EXPLORER(state.signature, "tx")}
          target="_blank" rel="noreferrer noopener"
          className="mt-1 inline-flex items-center gap-1 text-ink-secondary underline decoration-line-secondary underline-offset-2 transition-colors hover:text-brand"
        >
          View transaction <IconExternal className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
