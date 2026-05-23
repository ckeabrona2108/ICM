import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { ReleaseDraftDeleteResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const draft = await prisma.release.findFirst({
    where: {
      id: releaseId,
      userId: session.user.id,
      confirmed: false
    },
    select: { id: true }
  });

  if (!draft) {
    return NextResponse.json({ error: "Черновик не найден" }, { status: 404 });
  }

  await prisma.release.delete({ where: { id: releaseId } });

  const response: ReleaseDraftDeleteResponse = {
    ok: true,
    releaseId,
    draftsCount: await prisma.release.count({ where: { userId: session.user.id, confirmed: false } }),
    message: "Черновик удалён."
  };

  return NextResponse.json(response, { status: 200 });
}
