import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  AddSupportTicketMessageRequest,
  SupportTicketMutationResponse
} from "@/lib/api/contracts";
import {
  addAdminSupportReply,
  supportMessageSchema,
  SupportNotFoundError
} from "@/lib/support-service";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = supportMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request payload"
      },
      { status: 400 }
    );
  }

  const body: AddSupportTicketMessageRequest = parsed.data;

  try {
    const ticket = await addAdminSupportReply({
      prisma,
      adminId: session.user.id,
      ticketId: context.params.id,
      body: body.body
    });
    const response: SupportTicketMutationResponse = { ok: true, ticket };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof SupportNotFoundError) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    throw error;
  }
}
