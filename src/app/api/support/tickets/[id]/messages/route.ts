import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  AddSupportTicketMessageRequest,
  SupportTicketMutationResponse
} from "@/lib/api/contracts";
import {
  addUserSupportMessage,
  supportMessageSchema,
  SupportAccessError,
  SupportNotFoundError,
  SupportStorageUnavailableError
} from "@/lib/support-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceRateLimit({
    key: `support:message:${session.user.id}`,
    limit: 30,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

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
    const ticket = await addUserSupportMessage({
      prisma,
      userId: session.user.id,
      ticketId: context.params.id,
      body: body.body
    });
    const response: SupportTicketMutationResponse = { ok: true, ticket };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof SupportNotFoundError) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (error instanceof SupportAccessError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof SupportStorageUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
