"use client";

import { formatCurrency } from "@/lib/format";
import { resolveNetReportRightsAmounts } from "@/lib/finance-client";

type ReportDetailItem = {
  id?: string;
  platformName?: string | null;
  upc?: string | null;
  releaseTitle?: string | null;
  amount: number;
  artistName?: string | null;
  usagePeriod?: string | null;
  rightsType?: string | null;
  territory?: string | null;
  contentType?: string | null;
  usageType?: string | null;
  albumTitle?: string | null;
  lyricsAuthor?: string | null;
  musicAuthor?: string | null;
  isrc?: string | null;
  licenseeCode?: string | null;
  quantity?: number | null;
  streams?: number | null;
  paidStreams?: number | null;
  authorRightsShare?: number | null;
  relatedRightsShare?: number | null;
  authorAmount?: number | null;
  relatedAmount?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

type DetailColumn = {
  label: string;
  value: (item: ReportDetailItem) => unknown;
  format?: "currency" | "date" | "number";
  align?: "right";
  className?: string;
};

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function formatValue(value: unknown, format?: DetailColumn["format"]): string {
  if (!hasValue(value)) return "";

  if (format === "currency" && typeof value === "number" && Number.isFinite(value)) {
    return formatCurrency(value, "RUB");
  }
  if (format === "number" && typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ru-RU");
  }
  if (format === "date" && typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("ru-RU");
  }

  return String(value);
}

const detailColumns: DetailColumn[] = [
  { label: "Период использования", value: (item) => item.usagePeriod, className: "text-white/58" },
  { label: "Тип прав", value: (item) => item.rightsType },
  { label: "Территория", value: (item) => item.territory },
  { label: "Тип контента", value: (item) => item.contentType },
  { label: "Площадка", value: (item) => item.platformName, className: "max-w-[170px] break-words" },
  { label: "Вид использования", value: (item) => item.usageType },
  { label: "Исполнитель", value: (item) => item.artistName, className: "max-w-[180px] break-words" },
  { label: "Название трека", value: (item) => item.releaseTitle, className: "max-w-[220px] break-words font-semibold text-white" },
  { label: "Название альбома", value: (item) => item.albumTitle, className: "max-w-[220px] break-words" },
  { label: "Автор слов", value: (item) => item.lyricsAuthor },
  { label: "Автор музыки", value: (item) => item.musicAuthor },
  { label: "Доля авторских прав", value: (item) => item.authorRightsShare, format: "number", align: "right" },
  { label: "Доля смежных прав", value: (item) => item.relatedRightsShare, format: "number", align: "right" },
  { label: "ISRC", value: (item) => item.isrc, className: "text-white/54" },
  { label: "UPC", value: (item) => item.upc, className: "text-white/54" },
  { label: "Период начала", value: (item) => item.periodStart, format: "date", className: "text-white/58" },
  { label: "Период окончания", value: (item) => item.periodEnd, format: "date", className: "text-white/58" },
  { label: "Кол-во", value: (item) => item.quantity, format: "number", align: "right" },
  { label: "Все прослушивания", value: (item) => item.streams, format: "number", align: "right" },
  { label: "Прослушивания >30 сек.", value: (item) => item.paidStreams, format: "number", align: "right" },
  {
    label: "Авторские права",
    value: (item) => resolveNetReportRightsAmounts(item).authorAmount,
    format: "currency",
    align: "right",
    className: "font-semibold text-white/78"
  },
  {
    label: "Смежные права",
    value: (item) => resolveNetReportRightsAmounts(item).relatedAmount,
    format: "currency",
    align: "right",
    className: "font-semibold text-white/78"
  },
  { label: "К начислению", value: (item) => item.amount, format: "currency", align: "right", className: "font-semibold text-emerald-300" },
  { label: "Код лицензиара", value: (item) => item.licenseeCode, className: "text-white/54" }
];

export function ReportDetailTable({ items }: { items: ReportDetailItem[] }) {
  const visibleColumns = detailColumns.filter((column) => items.some((item) => hasValue(column.value(item))));

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/20">
      <table className="w-full text-left text-[13px]" style={{ minWidth: `${Math.max(960, visibleColumns.length * 150)}px` }}>
        <thead className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.12em] text-white/40">
          <tr>
            {visibleColumns.map((column) => (
              <th key={column.label} className={`px-3 py-3 font-semibold ${column.align === "right" ? "text-right" : ""}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {items.map((item, index) => (
            <tr key={item.id ?? `report-line-${index}`} className="text-white/72">
              {visibleColumns.map((column) => (
                <td
                  key={column.label}
                  className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""} ${column.className ?? ""}`}
                >
                  {formatValue(column.value(item), column.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
