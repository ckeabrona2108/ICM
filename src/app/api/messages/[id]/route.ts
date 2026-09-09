import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  deleteDirectConversation,
  deleteDirectMessage,
  DirectMessageAccessError,
  DirectMessageNotFoundError
} from "@/lib/direct-message-service";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = context.params.id;
  if (!/^[0-9a-f-]{36}$/iu.test(conversationId)) {
    return NextResponse.json({ error: "Некорректный диалог" }, { status: 400 });
  }

  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");
  const deleteMode = url.searchParams.get("mode") === "everyone" ? "everyone" : "self";

  try {
    if (messageId) {
      if (!/^[0-9a-f-]{36}$/iu.test(messageId)) {
        return NextResponse.json({ error: "Некорректное сообщение" }, { status: 400 });
      }
      return NextResponse.json(await deleteDirectMessage({
        prisma,
        userId,
        conversationId,
        messageId,
        mode: deleteMode
      }));
    }

    return NextResponse.json(await deleteDirectConversation({
      prisma,
      userId,
      conversationId
    }));
  } catch (error) {
    if (error instanceof DirectMessageNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DirectMessageAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
