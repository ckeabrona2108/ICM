import { getServerSession } from "next-auth";

import { PublicFeedPage } from "@/components/feed/public-feed-page";
import { authOptions } from "@/lib/auth";
import { normalizeLockedAuthorFeedQueryState } from "@/lib/feed-client-state";
import { resolveDashboardCommunityFeedQueryState } from "@/lib/feed-query-state";
import { prisma } from "@/lib/prisma";
import { getPublicFeedPayload } from "@/lib/public-feed-service";

export const dynamic = "force-dynamic";

type FeedPageSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardCommunityPage({ searchParams = {} }: { searchParams?: FeedPageSearchParams }) {
  const session = await getServerSession(authOptions);
  const author = first(searchParams.author)?.trim() || null;
  const query = normalizeLockedAuthorFeedQueryState(resolveDashboardCommunityFeedQueryState({
    view: first(searchParams.view),
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
  }), author);
  const initialPayload = await getPublicFeedPayload({
    prisma,
    userId: session?.user?.id ?? null,
    ...query,
    author,
    limit: 20
  });

  return <PublicFeedPage initialPayload={initialPayload} surface="dashboard" lockedAuthorSlug={author} />;
}
