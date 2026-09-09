import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { SendDirectMessageResponse } from "@/lib/api/contracts";
import {
  directConversationSchema,
  DirectMessageNotFoundError,
  DirectMessageValidationError,
  ensureDirectConversation,
  resolveDirectMessageRecipient
} from "@/lib/direct-message-service";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({
    key: `direct-conversation:${session.user.id}`,
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

  const parsed = directConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request payload" }, { status: 400 });
  }

  try {
    const recipientId = await resolveDirectMessageRecipient({
      prisma,
      senderId: session.user.id,
      recipientSlug: parsed.data.recipientSlug
    });
    const conversation = await ensureDirectConversation({
      prisma,
      senderId: session.user.id,
      recipientId
    });
    const response: SendDirectMessageResponse = { ok: true, conversation };
    return NextResponse.json(response, { status: 200 });
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
