import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { markDashboardNotificationRead } from "@/lib/dashboard-notification-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!context.params.id?.trim()) {
    return NextResponse.json({ error: "Некорректное уведомление" }, { status: 400 });
  }

  const updated = await markDashboardNotificationRead(prisma, session.user.id, context.params.id);
  return NextResponse.json({ ok: true, updated }, { status: 200 });
}
