import { NextRequest, NextResponse } from "next/server";

import { listPublicArtistProfiles } from "@/lib/artist-profile-service";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit({
    key: `artist-search:${request.headers.get("x-forwarded-for") ?? "unknown"}`,
    limit: 60,
    windowMs: 60_000
  });
  if (limited) return limited;
  const query = request.nextUrl.searchParams.get("q")?.slice(0, 100) ?? "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 15);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 15) : 15;
  try {
    return NextResponse.json({ artists: await listPublicArtistProfiles(prisma, { query, limit }) });
  } catch (error) {
    console.error("[artists/search] failed", error);
    return NextResponse.json(
      { artists: [], error: "Не удалось загрузить каталог артистов" },
      { status: 503 }
    );
  }
}
