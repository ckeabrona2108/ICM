import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import type {
  DirectConversationListResponse,
  SendDirectMessageRequest,
  SendDirectMessageResponse
} from "@/lib/api/contracts";
import {
  directMessageSchema,
  DirectMessageNotFoundError,
  DirectMessageValidationError,
  listDirectConversations,
  resolveDirectMessageRecipient,
  sendDirectMessage
} from "@/lib/direct-message-service";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedConversationId = new URL(request.url).searchParams.get("conversationId");
  const response: DirectConversationListResponse = {
    conversations: await listDirectConversations(prisma, session.user.id, {
      messageConversationId: requestedConversationId
    })
  };
  return NextResponse.json(response, { status: 200 });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({
    key: `direct-message:${session.user.id}`,
    limit: 60,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = directMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request payload" }, { status: 400 });
  }

  const body: SendDirectMessageRequest = parsed.data;
  try {
    const recipientId = await resolveDirectMessageRecipient({
      prisma,
      senderId: session.user.id,
      recipientSlug: body.recipientSlug
    });
    const conversation = await sendDirectMessage({
      prisma,
      senderId: session.user.id,
      recipientId,
      body: body.body
    });
    const response: SendDirectMessageResponse = { ok: true, conversation };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DirectMessageNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DirectMessageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
