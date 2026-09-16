/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // A production build writes to its own directory. Sharing `.next` with a
  // running dev server corrupts that server's chunk manifest mid-session, and
  // the failure looks like a module resolution bug rather than what it is.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
