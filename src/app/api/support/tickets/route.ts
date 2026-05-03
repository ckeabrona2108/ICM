import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  CreateSupportTicketRequest,
  SupportTicketListResponse,
  SupportTicketMutationResponse
} from "@/lib/api/contracts";
import {
  createSupportTicket,
  createSupportTicketSchema,
  listUserSupportTickets
} from "@/lib/support-service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await listUserSupportTickets(prisma, session.user.id);
  const response: SupportTicketListResponse = { tickets };
  return NextResponse.json(response, { status: 200 });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSupportTicketSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request payload"
      },
      { status: 400 }
    );
  }

  const body: CreateSupportTicketRequest = parsed.data;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const ticket = await createSupportTicket({
    prisma,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    subject: body.subject,
    body: body.body
  });

  const response: SupportTicketMutationResponse = {
    ok: true,
    ticket
  };
  return NextResponse.json(response, { status: 201 });
}
