import type { NextConfig } from "next";

function backendRewriteBase(): string | undefined {
  const raw = process.env.SCOUT_BACKEND_INTERNAL_URL?.trim() ?? "";
  if (raw === "") {
    return undefined;
  }
  return raw.replace(/\/$/, "");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    const backendBase = backendRewriteBase();
    if (!backendBase) {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${backendBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
