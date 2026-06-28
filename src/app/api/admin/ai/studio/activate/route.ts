import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { updateAIStudioStatus } from "@/lib/payment-order-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = (await request.json().catch(() => null)) as { status?: unknown } | null;
    const status = payload?.status === "preparing" ? "preparing" : "active";

    const result = await updateAIStudioStatus({ prisma, status });
    return NextResponse.json(
      {
        success: true,
        status: result.mode,
        alreadyInStatus: result.alreadyInStatus,
        processedOrders: result.processedOrders,
        affectedUsers: result.affectedUsers
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось изменить глобальный статус AI Studio."
      },
      { status: 500 }
    );
  }
}
