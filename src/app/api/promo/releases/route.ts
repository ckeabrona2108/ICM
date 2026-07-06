import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPromoReleasesForUser } from "@/lib/promo-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await getPromoReleasesForUser(prisma, session.user.id);
  return NextResponse.json({ items }, { status: 200 });
}
