import type { Metadata } from "next";

import { NewsDetailClient } from "@/components/news/news-detail-client";
import { getPublicNewsBySlug } from "@/lib/news-service";
import { prisma } from "@/lib/prisma";
import {
  absoluteSiteUrl,
  serializeJsonLd,
  SITE_NAME
} from "@/lib/site-metadata";

export async function generateMetadata({
  params
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const post = await getPublicNewsBySlug(prisma, params.slug);
    if (!post) {
      return {
        title: "Новость не найдена",
        robots: { index: false, follow: false }
      };
    }

    const description =
      post.excerpt?.slice(0, 180) ??
      `Новость ICECREAMMUSIC: ${post.title}`;

    return {
      title: post.title,
      description,
      alternates: {
        canonical: `/news/${post.slug}`
      },
      openGraph: {
        type: "article",
        url: `/news/${post.slug}`,
        title: post.title,
        description,
        publishedTime: post.published_at
      },
      twitter: {
        card: "summary",
        title: post.title,
        description
      }
    };
  } catch (error) {
    console.error("[news/metadata] failed to load post", error);
    return {
      title: "Новости ICECREAMMUSIC",
      robots: { index: false, follow: false }
    };
  }
}

export default async function NewsDetailsPage({ params }: { params: { slug: string } }) {
  let articleJsonLd: Record<string, unknown> | null = null;

  try {
    const post = await getPublicNewsBySlug(prisma, params.slug);
    if (post) {
      articleJsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.excerpt ?? `Новость ICECREAMMUSIC: ${post.title}`,
        datePublished: post.published_at,
        dateModified: post.published_at,
        mainEntityOfPage: absoluteSiteUrl(`/news/${post.slug}`),
        author: {
          "@type": "Organization",
          name: SITE_NAME,
          url: absoluteSiteUrl("/")
        },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: {
            "@type": "ImageObject",
            url: absoluteSiteUrl("/icon-512.png")
          }
        }
      };
    }
  } catch (error) {
    console.error("[news/schema] failed to load post", error);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {articleJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }}
        />
      ) : null}
      <NewsDetailClient slug={params.slug} />
    </main>
  );
}
