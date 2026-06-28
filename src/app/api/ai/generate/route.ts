import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  aiStudioGenerateRequestSchema,
  createAiStudioGeneration
} from "@/lib/ai-generation-service";
import { getAiStudioSystemStatus } from "@/lib/ai-studio-activation";
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

  const parsed = aiStudioGenerateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
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
    const result = await createAiStudioGeneration({
      prisma,
      userId: session.user.id,
      request: parsed.data
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
        assistantText: result.assistantText ?? null,
        previewUrl: result.previewUrl ?? null,
        generation: result.generation
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
        error: error instanceof Error ? error.message : "Не удалось запустить генерацию."
      },
      { status: 500 }
    );
  }
}
