import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { updateCollaborationAnnouncementStatus } from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";

const statusSchema = /^(open|closed)$/u;

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) {
    return NextResponse.json({ error: "Некорректная публикация" }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as { status?: string } | null;
  const rawStatus = body?.status?.trim() ?? "";
  if (!statusSchema.test(rawStatus)) {
    return NextResponse.json({ error: "Некорректный статус объявления" }, { status: 400 });
  }
  const status = rawStatus as "open" | "closed";

  try {
    return NextResponse.json(await updateCollaborationAnnouncementStatus({
      prisma,
      postId: context.params.id,
      userId,
      status
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "COLLABORATION_POST_NOT_FOUND") {
      return NextResponse.json({ error: "Объявление не найдено" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_POST_REQUIRED") {
      return NextResponse.json({ error: "Статус можно менять только у collaboration-объявлений" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_CLOSE_FORBIDDEN") {
      return NextResponse.json({ error: "Нельзя менять статус чужого объявления" }, { status: 403 });
    }
    console.error("[collaboration-status] update failed", error);
    return NextResponse.json({ error: "Не удалось обновить статус объявления" }, { status: 503 });
  }
}
