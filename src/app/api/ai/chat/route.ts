import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAiStudioSystemStatus } from "@/lib/ai-studio-activation";
import { authOptions } from "@/lib/auth";
import { sendAiChatMessage } from "@/lib/ai-chat-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

  const body = payload as { threadId?: string | null; modelId?: string; prompt?: string };
  if (!body.prompt || !body.modelId) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const aiStudioStatus = await getAiStudioSystemStatus(prisma);
  if (aiStudioStatus !== "active") {
    return NextResponse.json(
      {
        error: "AI Studio preparing",
        code: "AI_STUDIO_PREPARING",
        aiStudioStatus
      },
      { status: 423 }
    );
  }

  try {
    const result = await sendAiChatMessage({
      prisma,
      userId: session.user.id,
      threadId: body.threadId ?? null,
      modelCode: body.modelId,
      prompt: body.prompt
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
        thread: result.thread,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось отправить сообщение."
      },
      { status: 500 }
    );
  }
}
