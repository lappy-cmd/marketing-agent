import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Slide fonts are read from disk at runtime; make sure deployments ship them.
  outputFileTracingIncludes: {
    "/api/render": ["./assets/fonts/**"],
  },
};

export default nextConfig;
