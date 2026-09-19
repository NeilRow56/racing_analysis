import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React's development renderer can attach more than ten backpressure listeners
  // to Next's request-scoped compression stream for large streamed pages.
  compress: process.env.NODE_ENV !== "development",
  allowedDevOrigins: ["192.168.1.74"],
  reactCompiler: true,
};

export default nextConfig;
