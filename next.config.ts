import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy.
 *
 * `script-src` carries 'unsafe-inline' rather than a nonce, and that is a
 * bounded, deliberate choice rather than an oversight. Next injects inline
 * bootstrap and flight-data scripts into every page; the only way to nonce them
 * is middleware stamping a per-request nonce, which forces every page out of
 * static prerendering. This app's pages are prerendered today (the `○` rows in
 * the build output), so a nonce would trade a real, measured property for a
 * mitigation that has little left to mitigate here: React escapes every
 * interpolation, and the single dangerouslySetInnerHTML in the codebase
 * (src/components/org-brand.tsx) emits a fixed CSS template built from an admin
 * hex colour that is regex-validated at the database boundary and again at
 * render.
 *
 * Everything that does not cost prerendering is locked down instead.
 * `object-src 'none'` and `base-uri 'self'` close the two classic
 * 'unsafe-inline' escalations -- plugin content and <base> hijacking --
 * `form-action 'self'` stops an injected form from posting credentials offsite,
 * and `frame-ancestors 'none'` blocks the clickjacking that matters most for a
 * product whose entire subject is people being fooled by convincing UI.
 *
 * `style-src` needs 'unsafe-inline' for that same OrgAccent <style> element and
 * for React's inline style attributes.
 *
 * `img-src` allows any https host because an organisation's logo is an
 * arbitrary customer CDN URL. It is validated https-only and rendered
 * `unoptimized`, so Next never fetches it server-side -- no SSRF through the
 * image optimiser.
 *
 * `connect-src 'self'` is correct because the browser never talks to a third
 * party: the LLM providers and the ML service are reached from route handlers.
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' is React Refresh, dev only -- never sent in production.
    "script-src": ["'self'", "'unsafe-inline'", ...(isProd ? [] : ["'unsafe-eval'"])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    // Fonts are self-hosted by next/font, so there is no third-party origin.
    "font-src": ["'self'", "data:"],
    // ws: is the dev server's hot-reload socket.
    "connect-src": ["'self'", ...(isProd ? [] : ["ws:", "wss:"])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return isProd ? `${policy}; upgrade-insecure-requests` : policy;
}

/**
 * Sent on every response, API routes included.
 *
 * Next sets none of these by default, so before this the app shipped with no
 * clickjacking defence, no MIME-sniffing defence, and a Referer that handed the
 * path of an internal tool to whatever CDN hosts a customer's logo.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  // Redundant with frame-ancestors on modern browsers, honoured by the ones
  // that ignore CSP. Costs one header.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // The voice scenarios use speechSynthesis, which is output-only and needs no
  // permission, so every capture-capable feature is denied outright.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
  // same-origin on the opener policy severs the window.opener handle a
  // popup-based phishing page would otherwise hold onto.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Production only. A browser ignores HSTS from the http:// dev server anyway,
  // and sending it from an https staging host would pin that host for two years.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Don't advertise the framework and version to a scanner. Free.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
  // Lint is its own gate (`bun run lint`), run separately, not a build-blocker
  // -- the same split most CI setups use. eslint.config.mjs used to be broken
  // outright (next lint's eslintrc bridging hit a circular-JSON bug and
  // crashed before linting anything), so this had no practical effect before;
  // now that lint actually runs, leaving this unset would make `bun run build`
  // fail on the app's existing lint backlog instead of just its own compile
  // errors, which is a different, separate cleanup effort.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
