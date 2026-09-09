import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getGlobalSearchPayload } from "@/lib/global-search-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 6);
  return NextResponse.json(await getGlobalSearchPayload({
    prisma,
    userId: session?.user?.id ?? null,
    query: q,
    limit: Number.isFinite(limit) ? limit : 6
  }));
}
