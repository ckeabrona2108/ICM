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
  listUserSupportTickets,
  markUserSupportTicketsRead,
  SupportStorageUnavailableError
} from "@/lib/support-service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupportReleaseForUser } from "@/lib/support-release-options";
import {
  buildSupportReleaseMessage,
  buildSupportReleaseSubject,
  encodeSupportDescription,
  pickSupportPlatformLinks,
  supportReleaseRequestSchema,
  type SupportReleaseContext
} from "@/lib/support-release-request";

type TicketDraft = { subject: string; body: string; description?: string };

/** A "Релиз и модерация" request: the release must be the user's own; its data comes from the DB. */
async function buildReleaseTicketDraft(
  userId: string,
  raw: unknown
): Promise<TicketDraft | { error: string; status: number }> {
  const parsed = supportReleaseRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля заявки.", status: 400 };
  }
  const input = parsed.data;
  const release = await getSupportReleaseForUser(userId, input.releaseId);
  if (!release) {
    return { error: "Релиз не найден.", status: 404 };
  }

  const context: SupportReleaseContext = {
    v: 1,
    requestType: input.requestType,
    release: {
      id: release.id,
      title: release.title,
      artist: release.artist,
      upc: release.upc,
      status: release.status,
      coverUrl: release.coverUrl
    },
    platforms: input.platforms,
    platformLinks: pickSupportPlatformLinks(input)
  };
  const body = buildSupportReleaseMessage(context, input.comment);
  return {
    subject: buildSupportReleaseSubject(context),
    body,
    description: encodeSupportDescription(context, body)
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await markUserSupportTicketsRead(prisma, session.user.id);
    const tickets = await listUserSupportTickets(prisma, session.user.id);
    const response: SupportTicketListResponse = { tickets };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof SupportStorageUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceRateLimit({
    key: `support:create:${session.user.id}`,
    limit: 10,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let draft: TicketDraft;
  if (payload && typeof payload === "object" && "releaseRequest" in payload) {
    const result = await buildReleaseTicketDraft(
      session.user.id,
      (payload as { releaseRequest: unknown }).releaseRequest
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    draft = result;
  } else {
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
    draft = { subject: body.subject, body: body.body };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let ticket;
  try {
    ticket = await createSupportTicket({
      prisma,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      subject: draft.subject,
      body: draft.body,
      description: draft.description
    });
  } catch (error) {
    if (error instanceof SupportStorageUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const response: SupportTicketMutationResponse = {
    ok: true,
    ticket
  };
  return NextResponse.json(response, { status: 201 });
}
