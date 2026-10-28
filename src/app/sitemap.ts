import type { MetadataRoute } from "next";

import { listPublicArtistProfiles } from "@/lib/artist-profile-service";
import { GUIDES } from "@/lib/guides";
import { listPublicNews } from "@/lib/news-service";
import { prisma } from "@/lib/prisma";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { absoluteSiteUrl } from "@/lib/site-metadata";

export const revalidate = 3600;

async function loadNewsEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const posts = await listPublicNews(prisma);
    return posts.map((post) => ({
      url: absoluteSiteUrl(`/news/${post.slug}`),
      lastModified: new Date(post.published_at),
      changeFrequency: "monthly",
      priority: 0.6
    }));
  } catch (error) {
    console.error("[sitemap] failed to load published news", error);
    return [];
  }
}

async function loadSmartLinkEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const links = await prisma.promo_links.findMany({
      where: { release: { date: { lte: new Date() } } },
      select: {
        shortName: true,
        release: { select: { status: true, confirmed: true, upc: true, roles: true, date: true } }
      }
    });
    // Same visibility rule as the public smart link page: only approved releases.
    return links
      .filter((link) => shouldTreatReleaseAsApproved(link.release))
      .map((link) => ({
        url: absoluteSiteUrl(`/l/${encodeURIComponent(link.shortName)}`),
        lastModified: link.release.date ?? undefined,
        changeFrequency: "monthly",
        priority: 0.5
      }));
  } catch (error) {
    console.error("[sitemap] failed to load smart links", error);
    return [];
  }
}

async function loadArtistEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const artists = await listPublicArtistProfiles(prisma, { limit: 30 });
    return artists.map((artist) => ({
      url: absoluteSiteUrl(`/artists/${encodeURIComponent(artist.slug)}`),
      changeFrequency: "weekly",
      priority: 0.5
    }));
  } catch (error) {
    console.error("[sitemap] failed to load artists", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteSiteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: absoluteSiteUrl("/guides"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9
    },
    {
      url: absoluteSiteUrl("/news"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8
    },
    {
      url: absoluteSiteUrl("/plugins"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8
    }
  ];

  const guideEntries: MetadataRoute.Sitemap = GUIDES.map((guide) => ({
    url: absoluteSiteUrl(`/guides/${guide.slug}`),
    lastModified: new Date(guide.updatedAt),
    changeFrequency: "monthly",
    priority: 0.8
  }));

  const [newsEntries, smartLinkEntries, artistEntries] = await Promise.all([
    loadNewsEntries(),
    loadSmartLinkEntries(),
    loadArtistEntries()
  ]);

  return [...staticEntries, ...guideEntries, ...newsEntries, ...artistEntries, ...smartLinkEntries];
}
