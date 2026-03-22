/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["avatars.githubusercontent.com", "lh3.googleusercontent.com", "github.com"],
  },
  /** Fewer bad vendor-chunk splits for motion in App Router (dev + prod) */
  transpilePackages: ["framer-motion"],
};

module.exports = nextConfig;
