import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import {
  adminCreateReportSchema,
  adminCreateUserFinanceReport
} from "@/lib/admin-users-service";
import { prisma } from "@/lib/prisma";
import { listUserReports } from "@/lib/report-service";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = context.params.id?.trim();
  if (!userId) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const reports = await listUserReports(prisma, userId);
  return NextResponse.json({ reports }, { status: 200 });
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = context.params.id?.trim();
  if (!userId) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminCreateReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректные данные отчета." },
      { status: 400 }
    );
  }

  const result = await adminCreateUserFinanceReport({
    prisma,
    adminId: session.user.id,
    userId,
    ...parsed.data
  }).catch((error) => {
    console.error("[admin/users/reports] create failed", error);
    return {
      ok: false as const,
      error: error instanceof Error && error.message ? error.message : "Не удалось создать отчет."
    };
  });

  if (!result.ok) {
    const status = result.error === "User not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      reportId: result.reportId,
      message: "Отчет отправлен пользователю."
    },
    { status: 200 }
  );
}
