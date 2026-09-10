import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  adminUpdateUserFinanceReport,
  canManageUsers
} from "@/lib/admin-users-service";
import { prisma } from "@/lib/prisma";
import { listUserReports } from "@/lib/report-service";
import { buildPersonalReportReplacementFromFile } from "@/lib/smart-catalog-sync-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: { id: string; reportId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = context.params.id?.trim();
  const reportId = context.params.reportId?.trim();
  if (!userId || !reportId) {
    return NextResponse.json({ error: "User id and report id are required" }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Загрузите CSV, TSV или XLSX файл с исправленными строками." }, { status: 400 });
  }

  const reports = await listUserReports(prisma, userId);
  const existing = reports.find((report) => report.id === reportId);
  if (!existing) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const previewOnly = new URL(request.url).searchParams.get("preview") === "1";
  const replacement = await buildPersonalReportReplacementFromFile({
    userId,
    sourceFileName: file.name,
    arrayBuffer: await file.arrayBuffer()
  }).catch((error) => {
    console.error("[admin-report-replacement] parse failed", error);
    return {
      error: error instanceof Error && error.message ? error.message : "Не удалось разобрать файл замены."
    };
  });

  if ("error" in replacement) {
    return NextResponse.json({ error: replacement.error }, { status: 400 });
  }
  if (replacement.items.length === 0 || replacement.amount <= 0) {
    return NextResponse.json(
      {
        error:
          "В файле не найдено строк этого пользователя. Проверьте UPC/названия релизов и сумму."
      },
      { status: 400 }
    );
  }

  if (previewOnly) {
    return NextResponse.json({
      ok: true,
      preview: {
        reportId,
        fileName: file.name,
        oldAmount: existing.amount,
        newAmount: replacement.amount,
        rows: replacement.items.length,
        skippedRows: replacement.skippedRows,
        periodStart: (replacement.periodStart ?? new Date(existing.periodStart)).toISOString(),
        periodEnd: (replacement.periodEnd ?? new Date(existing.periodEnd)).toISOString()
      }
    });
  }

  const periodStart = replacement.periodStart ?? new Date(existing.periodStart);
  const periodEnd = replacement.periodEnd ?? new Date(existing.periodEnd);
  const replacementComment = [
    "Персональная замена отчёта.",
    `Файл: ${file.name}.`,
    `Старая сумма: ${existing.amount} RUB.`,
    `Новая сумма: ${replacement.amount} RUB.`,
    `Принято строк: ${replacement.items.length}.`,
    `Пропущено строк: ${replacement.skippedRows}.`,
    "Старый отчёт заменён для этого пользователя; к согласованию отправлена новая версия."
  ].join(" ");
  const result = await adminUpdateUserFinanceReport({
    prisma,
    adminId: session.user.id,
    userId,
    reportId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    amount: replacement.amount,
    status: "READY_TO_CONFIRM",
    quarter: existing.quarter,
    year: existing.year,
    items: replacement.items,
    comment: replacementComment
  }).catch((error) => {
    console.error("[admin-report-replacement] update failed", error);
    return {
      ok: false as const,
      error: error instanceof Error && error.message ? error.message : "Не удалось заменить отчёт."
    };
  });

  if (!result.ok) {
    const status = result.error === "Report not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    reportId,
    oldAmount: existing.amount,
    amount: replacement.amount,
    rows: replacement.items.length,
    skippedRows: replacement.skippedRows,
    message: "Отчёт пользователя заменён и отправлен на повторное согласование."
  });
}
