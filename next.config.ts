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
  // @google/genai depends on "ws" for its Node client. Marking it external
  // (below) stops Next from bundling it, but the standalone build's file
  // tracer (@vercel/nft) still fails to detect the `import ... from "ws"`
  // inside @google/genai's compiled .mjs output, so "ws" itself never gets
  // copied into .next/standalone/node_modules -- confirmed by building the
  // actual production Docker image locally: "ws" is present in the full
  // node_modules at build time, but missing from the pruned standalone
  // output, so the container throws ERR_MODULE_NOT_FOUND for "ws" at
  // runtime even though the build succeeds. outputFileTracingIncludes
  // force-includes it regardless of what the tracer's static analysis finds.
  serverExternalPackages: ["mongodb", "openid-client", "@google/genai"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/ws/**/*"],
  },
  // Smaller, self-contained production build for the Docker image.
  output: "standalone",
};

export default nextConfig;
