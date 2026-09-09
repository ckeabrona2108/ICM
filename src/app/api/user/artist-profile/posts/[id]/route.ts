import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { artistPostEditSchema, deleteArtistProfilePost, updateArtistProfilePost } from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";
import { deleteStoredObject } from "@/lib/s3";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) return NextResponse.json({ error: "Некорректная запись" }, { status: 400 });
  const parsed = artistPostEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте публикацию" }, { status: 400 });
  try {
    return NextResponse.json(await updateArtistProfilePost({ prisma, userId, postId: context.params.id, content: parsed.data.content }));
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_POST_NOT_FOUND") return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    if (error instanceof Error && error.message === "ARTIST_POST_FORBIDDEN") return NextResponse.json({ error: "Нельзя изменить чужую запись" }, { status: 403 });
    if (error instanceof Error && error.message === "ARTIST_POST_EMPTY") return NextResponse.json({ error: "Публикация не может быть пустой" }, { status: 400 });
    if (error instanceof Error && error.message === "ARTIST_POST_EDIT_WINDOW_EXPIRED") {
      return NextResponse.json(
        { error: "Прошло 24 часа, и, к сожалению, отредактировать данную публикацию нельзя." },
        { status: 409 }
      );
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) {
    return NextResponse.json({ error: "Некорректная запись" }, { status: 400 });
  }

  try {
    const result = await deleteArtistProfilePost({
      prisma,
      userId,
      postId: context.params.id
    });
    const cleanup = await Promise.allSettled(result.mediaKeys.map((key) => deleteStoredObject({ key })));
    if (cleanup.some((item) => item.status === "rejected")) {
      console.error("[artist-social-post] media cleanup incomplete", { postId: context.params.id });
    }
    return NextResponse.json({ deleted: result.deleted, id: result.id });
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_POST_NOT_FOUND") {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ARTIST_POST_FORBIDDEN") {
      return NextResponse.json({ error: "Нельзя удалить чужую запись" }, { status: 403 });
    }
    console.error("[artist-social-post] delete failed", { postId: context.params.id, error });
    return NextResponse.json({ error: "Не удалось удалить публикацию" }, { status: 500 });
  }
}
