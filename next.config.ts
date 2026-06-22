import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@triarchsecurity/shared-ui'],
  serverExternalPackages: ['@google-cloud/secret-manager', '@myalterlego/secrets'],
};

export default nextConfig;
