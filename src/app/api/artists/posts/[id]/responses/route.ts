import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  collaborationResponseSchema,
  createCollaborationResponse,
  listCollaborationResponses
} from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

function isValidId(value: string) {
  return /^[0-9a-f-]{36}$/iu.test(value);
}

export async function GET(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!isValidId(context.params.id)) {
    return NextResponse.json({ error: "Некорректная публикация" }, { status: 400 });
  }
  try {
    return NextResponse.json(await listCollaborationResponses({
      prisma,
      postId: context.params.id,
      userId
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "COLLABORATION_POST_NOT_FOUND") {
      return NextResponse.json({ error: "Объявление не найдено" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_RESPONSE_FORBIDDEN") {
      return NextResponse.json({ error: "Отклики доступны только автору объявления" }, { status: 403 });
    }
    console.error("[collaboration-responses] list failed", error);
    return NextResponse.json({ error: "Не удалось загрузить отклики" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!isValidId(context.params.id)) {
    return NextResponse.json({ error: "Некорректная публикация" }, { status: 400 });
  }
  const parsed = collaborationResponseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте отклик" }, { status: 400 });
  }
  try {
    return NextResponse.json(await createCollaborationResponse({
      prisma,
      postId: context.params.id,
      userId,
      artistKey: parsed.data.artistKey,
      message: parsed.data.message,
      linkedReleaseId: parsed.data.linkedReleaseId
    }), { status: 201 });
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) {
      return NextResponse.json({ error: "Отклик недоступен" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_POST_NOT_FOUND") {
      return NextResponse.json({ error: "Объявление не найдено" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_POST_REQUIRED") {
      return NextResponse.json({ error: "Отклик можно отправить только на collaboration-объявление" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_RESPONSE_SELF_FORBIDDEN") {
      return NextResponse.json({ error: "Нельзя откликнуться на своё объявление" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_RESPONSE_CLOSED") {
      return NextResponse.json({ error: "Объявление уже закрыто" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_RESPONSE_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Вы уже отправили отклик на это объявление" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "COLLABORATION_RESPONSE_INVALID_RELEASE") {
      return NextResponse.json({ error: "Выберите свой релиз для отклика" }, { status: 400 });
    }
    console.error("[collaboration-responses] create failed", error);
    return NextResponse.json({ error: "Не удалось отправить отклик" }, { status: 503 });
  }
}
