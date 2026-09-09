import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestReleaseDeletion } from "@/lib/release-deletion-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { comment?: unknown } | null;
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
  if (!comment) {
    return NextResponse.json({ error: "Комментарий обязателен." }, { status: 400 });
  }

  const result = await requestReleaseDeletion({
    prisma,
    userId: session.user.id,
    releaseId,
    comment
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      releaseId: result.releaseId,
      deletionStatus: result.deletionStatus,
      message: "Запрос на удаление релиза отправлен администратору."
    },
    { status: 200 }
  );
}
