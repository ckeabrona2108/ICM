import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listDashboardNotifications } from "@/lib/dashboard-notification-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await listDashboardNotifications(prisma, session.user.id);
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
