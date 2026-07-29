import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mongodb has optional native/binary deps used only in server code / route handlers.
  serverExternalPackages: ["mongodb"],
  // Smaller, self-contained production build for the Docker image.
  output: "standalone",
};

export default nextConfig;
