import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg is a native-ish dep used only in server code / route handlers.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
