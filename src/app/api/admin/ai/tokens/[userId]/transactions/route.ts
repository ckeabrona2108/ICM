import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { listAiTokenTransactions } from "@/lib/ai-token-service";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = context.params.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }

  const transactions = await listAiTokenTransactions(prisma, userId, 100);
  return NextResponse.json({ transactions }, { status: 200 });
}
