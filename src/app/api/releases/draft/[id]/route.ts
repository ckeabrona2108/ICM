import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { ReleaseDraftDeleteResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapReleaseStatusToSection } from "@/lib/release-counts";

export const dynamic = "force-dynamic";

async function draftsCount(userId: string): Promise<number> {
  const releases = await prisma.release.findMany({
    where: { userId },
    select: { status: true, confirmed: true, upc: true, roles: true }
  });

  return releases.reduce((count, release) => {
    const submittedToModeration =
      Boolean(release.roles) &&
      typeof release.roles === "object" &&
      !Array.isArray(release.roles) &&
      (release.roles as Record<string, unknown>).submittedToModeration === true;
    const section = mapReleaseStatusToSection(
      release.status,
      release.confirmed,
      submittedToModeration,
      {
        upc: release.upc,
        roles: release.roles
      }
    );
    return section === "draft" ? count + 1 : count;
  }, 0);
}

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
      userId: session.user.id
    },
    select: { id: true, status: true, confirmed: true, upc: true, roles: true }
  });

  const submittedToModeration =
    Boolean(draft?.roles) &&
    typeof draft?.roles === "object" &&
    !Array.isArray(draft?.roles) &&
    (draft?.roles as Record<string, unknown>).submittedToModeration === true;
  const section = draft
    ? mapReleaseStatusToSection(draft.status, draft.confirmed, submittedToModeration, {
        upc: draft.upc,
        roles: draft.roles
      })
    : null;

  if (!draft || section !== "draft") {
    return NextResponse.json({ error: "Черновик не найден" }, { status: 404 });
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
