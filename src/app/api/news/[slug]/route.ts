import { NextResponse } from "next/server";

import { getPublicNewsBySlug } from "@/lib/news-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: { slug: string } }
) {
  const item = await getPublicNewsBySlug(prisma, context.params.slug);
  if (!item) {
    return NextResponse.json({ error: "News not found" }, { status: 404 });
  }

  return NextResponse.json({ item }, { status: 200 });
}
