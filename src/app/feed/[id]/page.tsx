import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { FeedDetailPage } from "@/components/feed/feed-detail-page";
import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { authOptions } from "@/lib/auth";
import { getUserArtistProfileSettings } from "@/lib/artist-profile-service";
import { prisma } from "@/lib/prisma";
import { getPublicFeedItemById } from "@/lib/public-feed-service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  if (params.id.startsWith("post_")) {
    return { title: "Collab Market — ICECREAMMUSIC" };
  }
  const item = await getPublicFeedItemById({ prisma, id: params.id });
  if (!item) return { title: "Материал не найден — ICECREAMMUSIC" };
  const title = item.kind === "post" ? `${item.author.displayName} — публикация` : item.kind === "release" ? `${item.title} — релиз` : `${item.title} — новости ICECREAMMUSIC`;
  const description = item.kind === "post" ? item.content.slice(0, 160) : item.kind === "release" ? `Релиз ${item.title} от ${item.author.displayName}` : item.excerpt ?? item.content?.slice(0, 160) ?? "";
  return { title: { absolute: `${title} — ICECREAMMUSIC` }, description, alternates: { canonical: item.permalink } };
}

export default async function FeedItemPage({ params }: { params: { id: string } }) {
  if (params.id.startsWith("post_")) {
    redirect(`/dashboard/community?view=collaborations&post=${encodeURIComponent(params.id.slice(5))}`);
  }
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const [item, ownProfile] = await Promise.all([
    getPublicFeedItemById({ prisma, userId, id: params.id }),
    userId ? getUserArtistProfileSettings(prisma, userId) : Promise.resolve(null)
  ]);
  if (!item) notFound();
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/feed/${params.id}`)}`;
  return <main className="feed-skin relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(123,97,255,0.16),transparent_26%),linear-gradient(180deg,#10162b_0%,#0d1530_54%,#0b1228_100%)] text-white"><LandingScrollUnlock /><IcmHeader /><section className="mx-auto max-w-6xl px-6 pb-24 pt-32 sm:px-8 sm:pt-40"><FeedDetailPage initialItem={item} releaseOptions={ownProfile?.releases ?? []} viewerAuthenticated={Boolean(session?.user?.id)} viewerId={userId} loginHref={loginHref} /></section></main>;
}
