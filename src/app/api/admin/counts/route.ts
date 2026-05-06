import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { AdminCountsResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { getAdminVerificationCounts } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const counts: AdminCountsResponse = await getAdminVerificationCounts({ prisma });
  return NextResponse.json(counts, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=15, stale-while-revalidate=15"
    }
  });
}
