import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  archiveAdminNewsPost,
  deleteAdminNewsPost,
  getAdminNewsPostById,
  NewsValidationError,
  type UpsertNewsInput,
  updateAdminNewsPost
} from "@/lib/news-service";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const item = await getAdminNewsPostById(prisma, context.params.id);
  if (!item) {
    return NextResponse.json({ error: "News post not found" }, { status: 404 });
  }

  return NextResponse.json({ item }, { status: 200 });
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => null)) as UpsertNewsInput | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await updateAdminNewsPost({
      prisma,
      id: context.params.id,
      input: payload
    });

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    if (error instanceof NewsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Failed to update news post";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const mode = new URL(request.url).searchParams.get("mode");

  if (mode === "delete") {
    const deleted = await deleteAdminNewsPost(prisma, context.params.id);
    if (!deleted) {
      return NextResponse.json({ error: "News post not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, action: "deleted" }, { status: 200 });
  }

  try {
    const item = await archiveAdminNewsPost(prisma, context.params.id);
    return NextResponse.json({ ok: true, action: "archived", item }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to archive news post";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 });
  }
}
