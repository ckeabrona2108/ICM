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

  const columns = [
    ["Период использования", (item: typeof report.items[number]) => item.usagePeriod],
    ["Тип прав", (item: typeof report.items[number]) => item.rightsType],
    ["Территория", (item: typeof report.items[number]) => item.territory],
    ["Тип контента", (item: typeof report.items[number]) => item.contentType],
    ["Площадка", (item: typeof report.items[number]) => item.platformName],
    ["Вид использования", (item: typeof report.items[number]) => item.usageType],
    ["Исполнитель", (item: typeof report.items[number]) => item.artistName],
    ["Название трека", (item: typeof report.items[number]) => item.releaseTitle],
    ["Название альбома", (item: typeof report.items[number]) => item.albumTitle],
    ["Автор слов", (item: typeof report.items[number]) => item.lyricsAuthor],
    ["Автор музыки", (item: typeof report.items[number]) => item.musicAuthor],
    ["Доля авторских прав", (item: typeof report.items[number]) => item.authorRightsShare],
    ["Доля смежных прав", (item: typeof report.items[number]) => item.relatedRightsShare],
    ["ISRC", (item: typeof report.items[number]) => item.isrc],
    ["UPC", (item: typeof report.items[number]) => item.upc],
    ["Количество", (item: typeof report.items[number]) => item.quantity],
    ["Все прослушивания", (item: typeof report.items[number]) => item.streams],
    ["Прослушивания >30 секунд", (item: typeof report.items[number]) => item.paidStreams],
    ["Авторские права", (item: typeof report.items[number]) => item.authorAmount],
    ["Смежные права", (item: typeof report.items[number]) => item.relatedAmount],
    ["Итого вознаграждение", (item: typeof report.items[number]) => item.amount],
    ["Код лицензиара", (item: typeof report.items[number]) => item.licenseeCode]
  ] as const;
  const visibleColumns = columns.filter(([, getValue]) => report.items.some((item) => {
    const value = getValue(item);
    return value !== null && value !== undefined && value !== "";
  }));
  const rows = report.items.map((item) => `<tr>${visibleColumns.map(([, getValue]) => {
    const value = getValue(item);
    return `<td>${escapeHtml(value === null || value === undefined || value === "" ? "—" : String(value))}</td>`;
  }).join("")}</tr>`).join("");
  const headers = visibleColumns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Отчетная ведомость</title><style>body{font:14px Arial;margin:32px;color:#172033}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d6dbe5;padding:8px;text-align:left;vertical-align:top}th{background:#f1f4f8;white-space:nowrap}h1{margin-bottom:4px}.muted{color:#667085}</style><h1>Отчетная ведомость</h1><p class="muted">${escapeHtml(report.quarterLabel)} · ${formatRubCurrency(report.amount)}</p><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": "inline", "Cache-Control": "private, no-store" }
  });
}
