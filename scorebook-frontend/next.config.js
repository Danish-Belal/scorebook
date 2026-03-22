/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    // Strip stray console.* from browser bundles in production (keep console.error)
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error"] }
        : false,
  },
  images: {
    domains: ["avatars.githubusercontent.com", "lh3.googleusercontent.com", "github.com"],
  },
  /** Fewer bad vendor-chunk splits for motion in App Router (dev + prod) */
  transpilePackages: ["framer-motion"],
};

module.exports = nextConfig;
