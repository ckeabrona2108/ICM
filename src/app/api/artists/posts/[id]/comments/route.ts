import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { artistPostCommentSchema, commentEditSchema, createArtistPostComment, deleteArtistPostComment, listArtistPostComments, updateArtistPostComment } from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

export async function GET(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) {
    return NextResponse.json({ error: "Некорректная запись" }, { status: 400 });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  try {
    return NextResponse.json(await listArtistPostComments({
      prisma,
      postId: context.params.id,
      userId: session?.user?.id ?? null,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0
    }));
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ARTIST_POST_NOT_FOUND") {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    console.error("[artist-post-comments] list failed", error);
    return NextResponse.json({ error: "Комментарии временно недоступны" }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите, чтобы оставить комментарий" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) {
    return NextResponse.json({ error: "Некорректная запись" }, { status: 400 });
  }
  const limited = enforceRateLimit({ key: `artist-post-comment:${userId}`, limit: 30, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const parsed = artistPostCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте комментарий" }, { status: 400 });
  }
  try {
    return NextResponse.json(await createArtistPostComment({
      prisma,
      postId: context.params.id,
      userId,
      content: parsed.data.content,
      parentId: parsed.data.parentId ?? null,
      idempotencyKey: request.headers.get("Idempotency-Key")
    }), { status: 201 });
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) {
      return NextResponse.json({ error: "SOCIAL_INTERACTION_BLOCKED" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "ARTIST_POST_NOT_FOUND") {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ARTIST_POST_COMMENT_PARENT_NOT_FOUND") {
      return NextResponse.json({ error: "Родительский комментарий не найден" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "SOCIAL_IDEMPOTENCY_KEY_INVALID") return NextResponse.json({ error: "Некорректный Idempotency-Key" }, { status: 400 });
    console.error("[artist-post-comments] create failed", error);
    return NextResponse.json({ error: "Комментарии временно недоступны" }, { status: 503 });
  }
}


export async function DELETE(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите, чтобы удалить комментарий" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) {
    return NextResponse.json({ error: "Некорректная запись" }, { status: 400 });
  }
  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId") ?? "";
  if (!/^[0-9a-f-]{36}$/iu.test(commentId)) {
    return NextResponse.json({ error: "Некорректный комментарий" }, { status: 400 });
  }
  try {
    return NextResponse.json(await deleteArtistPostComment({ prisma, postId: context.params.id, commentId, userId }));
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_POST_NOT_FOUND") return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    if (error instanceof Error && error.message === "ARTIST_POST_COMMENT_NOT_FOUND") return NextResponse.json({ error: "Комментарий не найден" }, { status: 404 });
    if (error instanceof Error && error.message === "ARTIST_POST_COMMENT_FORBIDDEN") return NextResponse.json({ error: "Нельзя удалить чужой комментарий" }, { status: 403 });
    console.error("[artist-post-comments] delete failed", error);
    return NextResponse.json({ error: "Не удалось удалить комментарий" }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите, чтобы изменить комментарий" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) return NextResponse.json({ error: "Некорректная запись" }, { status: 400 });
  const parsed = commentEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте комментарий" }, { status: 400 });
  try {
    return NextResponse.json(await updateArtistPostComment({ prisma, postId: context.params.id, commentId: parsed.data.commentId, userId, content: parsed.data.content }));
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_POST_NOT_FOUND") return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    if (error instanceof Error && error.message === "ARTIST_POST_COMMENT_NOT_FOUND") return NextResponse.json({ error: "Комментарий не найден" }, { status: 404 });
    if (error instanceof Error && error.message === "ARTIST_POST_COMMENT_FORBIDDEN") return NextResponse.json({ error: "Нельзя изменить чужой комментарий" }, { status: 403 });
    throw error;
  }
}
