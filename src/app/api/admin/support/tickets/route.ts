import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SupportTicketListResponse } from "@/lib/api/contracts";
import { listAdminSupportTickets } from "@/lib/support-service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tickets = await listAdminSupportTickets(prisma);
  const response: SupportTicketListResponse = { tickets };
  return NextResponse.json(response, { status: 200 });
}
