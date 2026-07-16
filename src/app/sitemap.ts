import type { MetadataRoute } from "next";

import { listPublicNews } from "@/lib/news-service";
import { prisma } from "@/lib/prisma";
import { absoluteSiteUrl } from "@/lib/site-metadata";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteSiteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: absoluteSiteUrl("/news"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8
    }
  ];

  try {
    const posts = await listPublicNews(prisma);
    const newsEntries: MetadataRoute.Sitemap = posts.map((post) => ({
      url: absoluteSiteUrl(`/news/${post.slug}`),
      lastModified: new Date(post.published_at),
      changeFrequency: "monthly",
      priority: 0.7
    }));

    return [...staticEntries, ...newsEntries];
  } catch (error) {
    console.error("[sitemap] failed to load published news", error);
    return staticEntries;
  }
}
