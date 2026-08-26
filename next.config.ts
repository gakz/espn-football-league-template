import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is generated from committed JSON in data/, so nothing needs a
  // server at request time. Failing the build on type/lint errors is the point:
  // a broken ingest should never ship a half-rendered history.
  typedRoutes: true,
};

export default nextConfig;
