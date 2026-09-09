import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { PublicFeedPage } from "@/components/feed/public-feed-page";
import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { authOptions } from "@/lib/auth";
import { parseFeedQueryParams } from "@/lib/feed-query-state";
import { prisma } from "@/lib/prisma";
import { createAuthRequiredFeedPayload, getPublicFeedPayload } from "@/lib/public-feed-service";

export const metadata: Metadata = {
  title: { absolute: "Лента — ICECREAMMUSIC" },
  description: "Публичная лента постов артистов, релизов и официальных новостей ICECREAMMUSIC.",
  alternates: { canonical: "/feed" }
};

export const dynamic = "force-dynamic";

type FeedPageSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FeedPage({ searchParams = {} }: { searchParams?: FeedPageSearchParams }) {
  const session = await getServerSession(authOptions);
  const query = parseFeedQueryParams({
    scope: first(searchParams.scope),
    type: first(searchParams.type),
    search: first(searchParams.search),
    collab: first(searchParams.collab),
    intent: first(searchParams.intent),
    role: first(searchParams.role),
    workflow: first(searchParams.workflow),
    format: first(searchParams.format),
    city: first(searchParams.city),
    status: first(searchParams.status),
    sort: first(searchParams.sort),
    profileType: first(searchParams.profileType)
  });
  const initialPayload = query.scope === "following" && !session?.user?.id
    ? createAuthRequiredFeedPayload({ ...query, userId: null })
    : await getPublicFeedPayload({ prisma, userId: session?.user?.id ?? null, ...query, limit: 20 });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(94,76,255,0.18),transparent_26%),radial-gradient(circle_at_18%_12%,rgba(123,97,255,0.12),transparent_32%),linear-gradient(180deg,#101322_0%,#0c0f1d_58%,#090a10_100%)] text-white">
      <LandingScrollUnlock />
      <IcmHeader />
      <section className="mx-auto max-w-7xl px-6 pb-24 pt-36 sm:px-8 sm:pt-44">
        <PublicFeedPage initialPayload={initialPayload} surface="public" />
      </section>
    </main>
  );
}
