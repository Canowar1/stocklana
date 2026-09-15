"use client";

import { ReactNode } from "react";
import { IconExternal } from "./icons";
import { EXPLORER, shortAddressSafe } from "@/lib/ui-helpers";

export function Card({
  children, className = "", as: Tag = "div",
}: { children: ReactNode; className?: string; as?: "div" | "section" }) {
  return (
    <Tag className={`rounded-xl border border-line-secondary bg-bg-secondary ${className}`}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action }: {
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-secondary px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink-primary">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "error" | "brand";
const toneClass: Record<Tone, string> = {
  neutral: "bg-bg-tertiary text-ink-secondary",
  success: "bg-state-successBg text-state-success",
  warning: "bg-state-warningBg text-state-warning",
  error: "bg-state-errorBg text-state-error",
  brand: "bg-brand/10 text-brand",
};

export function Badge({ tone = "neutral", children, title }: {
  tone?: Tone; children: ReactNode; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-2xs font-medium uppercase tracking-wide ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children, variant = "primary", className = "", ...rest
}: {
  children: ReactNode; variant?: "primary" | "secondary" | "ghost";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary:
      "bg-brand text-ink-onBrand hover:bg-brand-hover disabled:bg-brand-muted disabled:text-ink-onBrand/60",
    secondary:
      "border border-line-secondary bg-bg-tertiary text-ink-primary hover:border-brand/50 disabled:text-ink-muted",
    ghost: "text-ink-secondary hover:bg-bg-tertiary hover:text-ink-primary",
  };
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label, hint, error, children, htmlFor,
}: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      {/* A visible label, never a placeholder standing in for one: the
          placeholder disappears the moment someone starts typing. */}
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-state-error" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`tnum h-11 w-full rounded-lg border border-line-secondary bg-bg-primary px-3 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-brand ${props.className ?? ""}`}
    />
  );
}

export function Stat({ label, value, sub, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: Tone;
}) {
  const color =
    tone === "success" ? "text-state-success"
    : tone === "error" ? "text-state-error"
    : tone === "warning" ? "text-state-warning"
    : "text-ink-primary";
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`tnum mt-1 text-lg font-semibold ${color}`}>{value}</div>
      {sub && <div className="tnum mt-0.5 text-xs text-ink-secondary">{sub}</div>}
    </div>
  );
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      href={EXPLORER(address)}
      target="_blank"
      rel="noreferrer noopener"
      className="tnum inline-flex items-center gap-1 text-ink-secondary underline decoration-line-secondary underline-offset-2 transition-colors hover:text-brand"
    >
      {label ?? shortAddressSafe(address)}
      <IconExternal className="h-3 w-3" />
    </a>
  );
}

export function EmptyState({ icon, title, body, action }: {
  icon: ReactNode; title: string; body: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 text-ink-muted">{icon}</div>
      <p className="text-sm font-medium text-ink-primary">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-secondary">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
