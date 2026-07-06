import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminReleases, type AdminReleaseStatusFilter } from "@/lib/admin-release-queries";
import { canManageReleases, canManageReleasesSession } from "@/lib/admin-release-service";

const allowedStatuses = new Set<AdminReleaseStatusFilter>([
  "moderation",
  "pending_verification",
  "all",
  "approved",
  "rejected"
]);

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get("status") ?? "all").toLowerCase();
  if (!allowedStatuses.has(raw as AdminReleaseStatusFilter)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const releases = await getAdminReleases(raw as AdminReleaseStatusFilter);
  return NextResponse.json({ releases }, { status: 200 });
}
