import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

/** Ties a placement to a release by hand: accepts a release id or an admin release link. */
export async function PATCH(request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { release?: unknown; position?: unknown } | null;
  const data: { releaseId?: string | null; userId?: string | null; position?: string | null } = {};

  if (typeof body?.release === "string") {
    const releaseId = body.release.match(UUID)?.[0]?.toLowerCase();
    if (!releaseId) {
      return NextResponse.json({ error: "Вставьте ссылку на релиз из админки или его ID." }, { status: 400 });
    }
    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { id: true, userId: true } });
    if (!release) return NextResponse.json({ error: "Релиз не найден." }, { status: 404 });
    data.releaseId = release.id;
    data.userId = release.userId;
  }
  if (typeof body?.position === "string") {
    data.position = body.position.trim() || null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего менять." }, { status: 400 });
  }

  const updated = await prisma.playlist_placements
    .update({ where: { id: context.params.id }, data, select: { id: true } })
    .catch(() => null);
  if (!updated) return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await prisma.playlist_placements.deleteMany({ where: { id: context.params.id } });
  if (result.count === 0) return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
