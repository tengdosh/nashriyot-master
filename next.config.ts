import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output = a self-contained server bundle for a small Docker image
  // (deploy/Dockerfile copies .next/standalone). No effect on `npm run dev`.
  output: "standalone",
};

export default withNextIntl(nextConfig);
