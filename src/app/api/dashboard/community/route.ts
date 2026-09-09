import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { normalizeFeedQueryState, resolveDashboardCommunityFeedQueryState } from "@/lib/feed-query-state";
import { prisma } from "@/lib/prisma";
import { FeedAuthRequiredError, FeedCursorError, getPublicFeedPayload } from "@/lib/public-feed-service";

export const dynamic = "force-dynamic";

function toUnifiedSearchParams(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  const legacyFilter = next.get("filter");
  if (!next.has("type") && legacyFilter && legacyFilter !== "all") {
    next.set("type", legacyFilter);
  }
  return next;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  try {
    const searchParams = toUnifiedSearchParams(request.nextUrl.searchParams);
    const query = normalizeFeedQueryState(resolveDashboardCommunityFeedQueryState(searchParams));
    const payload = await getPublicFeedPayload({
      prisma,
      userId: session?.user?.id ?? null,
      view: query.view,
      scope: query.scope,
      type: query.type,
      collaborationFilter: query.collaborationFilter,
      collaborationIntent: query.collaborationIntent,
      collaborationRole: query.collaborationRole,
      collaborationWorkflow: query.collaborationWorkflow,
      collaborationPreference: query.collaborationPreference,
      collaborationCity: query.collaborationCity,
      collaborationStatus: query.collaborationStatus,
      sort: query.sort,
      profileType: query.profileType,
      cursor: searchParams.get("cursor"),
      limit: Number(searchParams.get("limit") || 20),
      author: searchParams.get("author"),
      search: query.search
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof FeedAuthRequiredError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof FeedCursorError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/dashboard/community] failed", error);
    return NextResponse.json({ error: "Не удалось загрузить Collab Market" }, { status: 500 });
  }
}
