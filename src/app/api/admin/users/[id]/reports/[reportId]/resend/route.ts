import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { adminResendUserFinanceReport, canManageUsers } from "@/lib/admin-users-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: { id: string; reportId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = context.params.id?.trim();
  const reportId = context.params.reportId?.trim();
  if (!userId || !reportId) {
    return NextResponse.json({ error: "User id and report id are required" }, { status: 400 });
  }

  const result = await adminResendUserFinanceReport({
    prisma,
    userId,
    reportId
  }).catch((error) => {
    console.error("[admin/users/reports] resend failed", error);
    return {
      ok: false as const,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Не удалось отправить отчет повторно."
    };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "Report not found" ? 404 : 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    reportId,
    message: "Отчет повторно отправлен пользователю."
  });
}
