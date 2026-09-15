import type { Config } from "tailwindcss";

/**
 * Colours are declared once, as CSS variables in globals.css, and referenced
 * here by role. No component ever writes a hex value: a raw hex in a component
 * is the thing that makes a theme impossible to change later.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand-primary)",
          hover: "var(--brand-hover)",
          muted: "var(--brand-muted)",
        },
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          tertiary: "var(--bg-tertiary)",
          quaternary: "var(--bg-quaternary)",
        },
        line: {
          primary: "var(--border-primary)",
          secondary: "var(--border-secondary)",
        },
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          onBrand: "var(--text-button)",
        },
        state: {
          success: "var(--status-success)",
          successBg: "var(--status-success-10)",
          warning: "var(--status-warning)",
          warningBg: "var(--status-warning-10)",
          error: "var(--status-error)",
          errorBg: "var(--status-error-10)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
      transitionDuration: { DEFAULT: "180ms" },
    },
  },
  plugins: [],
};
export default config;
