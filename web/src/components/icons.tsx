/**
 * Inline SVG icons. No emoji and no icon font: an emoji renders differently on
 * every platform and carries a screen-reader announcement nobody chose.
 * Everything here is decorative and hidden from assistive technology; the
 * label always lives in the text beside it.
 */
type P = { className?: string };
const base = (className?: string) => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});

export const IconMarkets = ({ className }: P) => (
  <svg {...base(className)}><path d="M3 3v18h18" /><path d="m7 14 3-4 3 3 5-7" /></svg>
);
export const IconPositions = ({ className }: P) => (
  <svg {...base(className)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></svg>
);
export const IconActivity = ({ className }: P) => (
  <svg {...base(className)}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
);
export const IconSun = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const IconMoon = ({ className }: P) => (
  <svg {...base(className)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
);
export const IconWarning = ({ className }: P) => (
  <svg {...base(className)}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
);
export const IconCheck = ({ className }: P) => (
  <svg {...base(className)}><path d="m20 6-11 11-5-5" /></svg>
);
export const IconClock = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconExternal = ({ className }: P) => (
  <svg {...base(className)}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
);
export const IconArrowRight = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconEmptyBook = ({ className }: P) => (
  <svg {...base(className)}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M8 8h8M8 12h5" /></svg>
);
