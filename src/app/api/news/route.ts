import { NextResponse } from "next/server";

import { listPublicNews } from "@/lib/news-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listPublicNews(prisma);
  return NextResponse.json({ items }, { status: 200 });
}
