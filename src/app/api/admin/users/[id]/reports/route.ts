import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { FinanceReportStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import {
  canManageUsers
} from "@/lib/admin-user-service";
import { createUserReportByAdmin, listUserReports } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createReportSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  amount: z.number().positive("Сумма отчёта должна быть больше 0.").max(10_000_000),
  status: z.enum(["READY_TO_CONFIRM", "AGREED"]),
  comment: z.string().trim().max(500).optional()
});

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: context.params.id },
    select: { id: true }
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const reports = await listUserReports(prisma, context.params.id);
  return NextResponse.json({ reports }, { status: 200 });
}

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createReportSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
  }

  const result = await createUserReportByAdmin({
    prisma,
    adminId: session.user.id,
    userId: context.params.id,
    periodStart: new Date(parsed.data.periodStart),
    periodEnd: new Date(parsed.data.periodEnd),
    amount: parsed.data.amount,
    status:
      parsed.data.status === "AGREED"
        ? FinanceReportStatus.AGREED
        : FinanceReportStatus.READY_TO_CONFIRM,
    comment: parsed.data.comment
  });

  if (!result.ok) {
    const status = result.error === "User not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      reportId: result.reportId,
      message: "Отчет добавлен пользователю."
    },
    { status: 201 }
  );
}
