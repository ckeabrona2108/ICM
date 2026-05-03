import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { SupportUnreadCountResponse } from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";
import { getUserUnreadSupportTicketCount } from "@/lib/support-service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await getUserUnreadSupportTicketCount(prisma, session.user.id);
  const response: SupportUnreadCountResponse = { count };
  return NextResponse.json(response, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=30"
    }
  });
}
