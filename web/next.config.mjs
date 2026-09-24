import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // The app imports config/*.json from the repo root. Pin tracing there so
  // Vercel does not guess from the two lockfiles.
  outputFileTracingRoot: repoRoot,
  // Local `npm run build` writes to `.next-build` so it cannot corrupt a
  // running dev server's `.next` manifest. Vercel only publishes `.next`, and
  // its build sets VERCEL=1, so that path stays the default there.
  distDir: process.env.VERCEL ? ".next" : process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
