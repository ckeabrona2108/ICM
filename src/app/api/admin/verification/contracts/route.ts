import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listContractSignaturesForAdmin } from "@/lib/contract-verification";
import { canManageUsers } from "@/lib/admin-user-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await listContractSignaturesForAdmin({ prisma });
  return NextResponse.json({ items });
}

