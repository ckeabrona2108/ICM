import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SupportTicketMutationResponse } from "@/lib/api/contracts";
import { getAdminSupportTicket, SupportNotFoundError } from "@/lib/support-service";

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const ticket = await getAdminSupportTicket(prisma, context.params.id);
    const response: SupportTicketMutationResponse = { ok: true, ticket };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof SupportNotFoundError) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    throw error;
  }
}
