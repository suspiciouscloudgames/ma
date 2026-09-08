import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/ma",
  assetPrefix: "/ma/",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
