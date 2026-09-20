import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listUserReports } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";
import { formatRubCurrency } from "@/lib/currency-format";

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export async function GET(_request: Request, { params }: { params: { reportId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = (await listUserReports(prisma, session.user.id, { strict: true }))
    .find((item) => item.id === params.reportId);
  if (!report) return NextResponse.json({ error: "Отчет не найден." }, { status: 404 });

  const rows = report.items.map((item) => `<tr><td>${escapeHtml(item.upc)}</td><td>${escapeHtml(item.releaseTitle)}</td><td>${escapeHtml(item.artistName ?? "—")}</td><td>${escapeHtml(item.platformName)}</td><td>${escapeHtml(item.usageType ?? "—")}</td><td>${item.quantity ?? "—"}</td><td>${formatRubCurrency(item.amount)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Отчетная ведомость</title><style>body{font:14px Arial;margin:32px;color:#172033}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d6dbe5;padding:8px;text-align:left}th{background:#f1f4f8}h1{margin-bottom:4px}.muted{color:#667085}</style><h1>Отчетная ведомость</h1><p class="muted">${escapeHtml(report.quarterLabel)} · ${formatRubCurrency(report.amount)}</p><table><thead><tr><th>UPC</th><th>Релиз</th><th>Исполнитель</th><th>Площадка</th><th>Вид использования</th><th>Кол-во</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody></table></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": "inline", "Cache-Control": "private, no-store" }
  });
}
