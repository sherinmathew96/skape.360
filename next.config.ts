import type { NextConfig } from "next";

// Every screen is per-user and behind login, so pages render on request.
// Cache Components is left off on purpose.
const nextConfig: NextConfig = {
  devIndicators: false,
  // Only the embed viewers may be shown inside another site's <iframe>.
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Browsers only honour this over HTTPS, so it is harmless on localhost.
      { key: "Strict-Transport-Security", value: "max-age=63072000" },
    ];
    return [
      { source: "/embed/:path*", headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors *" }] },
      {
        source: "/((?!embed/).*)",
        headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
