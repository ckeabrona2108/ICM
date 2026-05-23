import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const draftsCount = await prisma.release.count({
    where: {
      userId: session.user.id,
      confirmed: false
    }
  });

  return NextResponse.json({ draftsCount }, { status: 200 });
}
