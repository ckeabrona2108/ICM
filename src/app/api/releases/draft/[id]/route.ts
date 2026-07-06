import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { ReleaseDraftDeleteResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { canDeleteDraft } from "@/lib/draft-policy";
import { prisma } from "@/lib/prisma";
import { getReleaseSidebarCountsForUser } from "@/lib/release-counts";

export const dynamic = "force-dynamic";

async function draftsCount(userId: string): Promise<number> {
  const counts = await getReleaseSidebarCountsForUser({
    userId,
    prisma
  });
  return counts.draft;
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const draft = await prisma.release.findUnique({
    where: {
      id: releaseId
    },
    select: { id: true, userId: true, status: true, confirmed: true, upc: true, roles: true }
  });

  if (!draft) {
    return NextResponse.json({ error: "Релиз не найден." }, { status: 404 });
  }

  const policy = canDeleteDraft({
    status: draft.status,
    confirmed: draft.confirmed,
    upc: draft.upc,
    roles: draft.roles,
    isOwner: draft.userId === session.user.id
  });

  if (!policy.allowed) {
    if (policy.reason === "forbidden_owner") {
      return NextResponse.json({ error: "Нельзя удалить чужой релиз." }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Удалять можно только релизы в статусе черновика." },
      { status: 409 }
    );
  }

  await prisma.release.delete({ where: { id: releaseId } });

  const response: ReleaseDraftDeleteResponse = {
    ok: true,
    releaseId,
    draftsCount: await draftsCount(session.user.id),
    message: "Черновик удалён."
  };

  return NextResponse.json(response, { status: 200 });
}
