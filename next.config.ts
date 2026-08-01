import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mongodb has optional native/binary deps used only in server code / route handlers.
  //
  // openid-client must be external for a different reason: /api/auth/sso/start
  // and /api/auth/sso/callback are separate route bundles, and if each bundles
  // its own copy of the library they get distinct Configuration classes. The
  // Configuration instance we cache on globalThis in src/server/sso/oidc.ts is
  // then created under one class and checked under the other, so
  // authorizationCodeGrant() rejects it with
  //   "config" must be an instance of Configuration
  // Externalizing it makes Node's require cache hand every route the same
  // module instance. This only shows up at runtime -- the build passes either
  // way -- so it is easy to reintroduce by removing this line.
  // @google/genai depends on "ws" for its Node client, but that require() is
  // buried deep enough in its compiled output that the standalone build's
  // file-tracer doesn't detect it, so "ws" never gets copied into
  // .next/standalone/node_modules -- the Docker image then throws
  // "Cannot find module 'ws'" at runtime even though the build succeeds.
  // Marking the package external makes Next trace its real require() graph
  // from disk instead of bundling it, which picks up "ws" correctly.
  serverExternalPackages: ["mongodb", "openid-client", "@google/genai"],
  // Smaller, self-contained production build for the Docker image.
  output: "standalone",
};

export default nextConfig;
