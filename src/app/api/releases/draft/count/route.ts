import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapReleaseStatusToSection } from "@/lib/release-counts";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const releases = await prisma.release.findMany({
    where: { userId: session.user.id },
    select: { status: true, confirmed: true, upc: true, roles: true }
  });

  const draftsCount = releases.reduce((count, release) => {
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

  return NextResponse.json({ draftsCount }, { status: 200 });
}
