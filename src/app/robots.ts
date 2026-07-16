import type { MetadataRoute } from "next";

import { absoluteSiteUrl } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/dashboard/",
        "/api/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/ticket/",
        "/event/"
      ]
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: absoluteSiteUrl("/")
  };
}
