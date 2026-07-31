import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep the authenticated app and API out of search indexes. /invite/
      // is public but token-bearing, so it must never be crawled or indexed.
      disallow: [
        "/dashboard",
        "/practice",
        "/profile",
        "/settings",
        "/onboarding",
        "/admin",
        "/invite/",
        "/api/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
