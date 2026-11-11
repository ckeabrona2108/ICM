"use client";

import * as React from "react";

import {
  buildFinanceImportOverview,
  type FinanceBreakdownItem,
  type FinanceFileMeta,
  type FinanceOverviewRow
} from "@/lib/finance-import-overview";

const COLUMN_LABELS: Record<string, string> = {
  upc: "UPC",
  isrc: "ISRC",
  internal_code: "Код трека",
  title: "Название",
  artist: "Артист",
  label: "Лейбл",
  platform: "Площадка",
  usage_type: "Тип использования",
  usage_period: "Период",
  release_date: "Начало периода",
  end_date: "Конец периода",
  quantity: "Количество",
  royalty_author: "Авторские",
  royalty_related: "Смежные",
  royalty_total: "Сумма",
  gross_amount: "Сумма до комиссии",
  territory: "Территория",
  rights_type: "Тип прав",
  content_type: "Тип контента"
};

function money(value: number) {
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function count(value: number) {
  return value.toLocaleString("ru-RU");
}

function plural(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${count(value)} ${word}`;
}

function percent(part: number, total: number) {
  if (total <= 0) return "0%";
  const value = (part / total) * 100;
  if (value > 0 && value < 0.1) return "<0.1%";
  return `${value < 1 && value > 0 ? value.toFixed(1).replace(".", ",") : Math.round(value)}%`;
}

function Card({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 ${className}`}>
      <h3 className="text-[15px] font-semibold text-white">{title}</h3>
      {hint ? <p className="mt-1 text-[12px] leading-relaxed text-white/50">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BreakdownList({ items, total, limit = 8 }: { items: FinanceBreakdownItem[]; total: number; limit?: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  const max = items[0]?.amount ?? 0;

  return (
    <div>
      <ul className="space-y-2.5">
        {visible.map((item) => (
          <li key={item.name}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-white/85">{item.name}</span>
              <span className="shrink-0 tabular-nums text-white">
                {money(item.amount)}
                <span className="ml-2 text-[11px] text-white/40">{percent(item.amount, total)}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[#7b3df5]"
                style={{ width: `${max > 0 ? Math.max(1, (item.amount / max) * 100) : 0}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-white/38">
              {plural(item.quantity, "прослушивание", "прослушивания", "прослушиваний")} ·{" "}
              {plural(item.rows, "строка", "строки", "строк")}
            </div>
          </li>
        ))}
      </ul>
      {items.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-[12px] font-medium text-[#c4b5fd] hover:text-white"
        >
          {expanded ? "Свернуть" : `Показать все (${items.length})`}
        </button>
      ) : null}
    </div>
  );
}

export function FinanceImportOverviewPanel(props: {
  rows: FinanceOverviewRow[];
  fileMeta?: FinanceFileMeta | null;
  detectedColumns?: Record<string, string> | null;
  commissionAlreadyDeducted?: boolean;
  status: string;
}) {
  const overview = React.useMemo(
    () => buildFinanceImportOverview({ rows: props.rows, fileMeta: props.fileMeta, detectedColumns: props.detectedColumns }),
    [props.rows, props.fileMeta, props.detectedColumns]
  );
  const [showAllUnmatched, setShowAllUnmatched] = React.useState(false);
  const meta = props.fileMeta ?? null;
  const total = overview.totalAmount;
  const flow = [
    { key: "artists", label: "Артистам", amount: overview.toArtists, bar: "bg-emerald-400", text: "text-emerald-300" },
    { key: "commission", label: "Комиссия ICECREAMMUSIC", amount: overview.commission, bar: "bg-amber-400", text: "text-amber-200" },
    { key: "unmatched", label: "Не сопоставлено — никому", amount: overview.unmatched.amount, bar: "bg-rose-400/80", text: "text-rose-300" }
  ];
  const unmatchedVisible = showAllUnmatched ? overview.unmatchedItems : overview.unmatchedItems.slice(0, 15);
  const columns = Object.entries(props.detectedColumns ?? {});

  return (
    <div className="space-y-4">
      <Card
        title="Что в файле"
        hint="Как система прочитала отчёт. Если колонка распознана неправильно, суммы ниже будут неверными — проверьте это первым."
      >
        {meta?.preamble?.length ? (
          <dl className="grid gap-2 sm:grid-cols-3">
            {meta.preamble.map((item) => (
              <div key={`${item.label}-${item.value}`} className="rounded-xl border border-white/[0.06] bg-[#11131a] px-3 py-2">
                <dt className="text-[11px] text-white/40">{item.label}</dt>
                <dd className="mt-0.5 truncate text-[13px] font-medium text-white">{item.value || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-white/70">
          <span>
            Строк в файле: <b className="text-white">{count(overview.sourceRows)}</b>
          </span>
          <span>
            Треков/релизов: <b className="text-white">{count(overview.groups)}</b>
          </span>
          <span>
            Прослушиваний: <b className="text-white">{count(overview.quantity)}</b>
          </span>
          {typeof meta?.headerRowIndex === "number" && meta.headerRowIndex > 0 ? (
            <span className="text-white/45">Шапка таблицы найдена не в первой строке — служебные строки сверху пропущены</span>
          ) : null}
          {meta?.skippedFooterRows ? <span className="text-white/45">Строка «ИТОГО» не считается как продажа</span> : null}
        </div>

        {columns.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {columns.map(([canonical, header]) => (
              <span
                key={canonical}
                className="rounded-full border border-white/10 bg-[#11131a] px-2.5 py-1 text-[11px] text-white/60"
              >
                {header} → <span className="text-white/90">{COLUMN_LABELS[canonical] ?? canonical}</span>
              </span>
            ))}
          </div>
        ) : null}
      </Card>

      <Card
        title="Куда пойдут деньги"
        hint={
          props.status === "CONFIRMED"
            ? "Импорт применён: эти суммы уже начислены."
            : "Пока это черновик: балансы артистов не меняются, пока вы не нажмёте «Применить»."
        }
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[12px] text-white/45">Всего в отчёте</div>
            <div className="text-[28px] font-bold tabular-nums text-white">{money(total)}</div>
          </div>
          {props.commissionAlreadyDeducted ? (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[12px] text-amber-200">
              Комиссия не удерживается: сумма в файле уже за её вычетом
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
          {flow.map((part) =>
            part.amount > 0 ? (
              <div key={part.key} className={part.bar} style={{ width: `${total > 0 ? (part.amount / total) * 100 : 0}%` }} />
            ) : null
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {flow.map((part) => (
            <div key={part.key} className="rounded-xl border border-white/[0.06] bg-[#11131a] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[12px] text-white/55">
                <span className={`h-2 w-2 rounded-full ${part.bar}`} />
                {part.label}
              </div>
              <div className={`mt-1 text-[18px] font-semibold tabular-nums ${part.text}`}>{money(part.amount)}</div>
              <div className="text-[11px] text-white/40">{percent(part.amount, total)} от отчёта</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-white/50">
          Сопоставлено {count(overview.matched.groups)} из {count(overview.groups)} · артистов: {count(overview.matched.artists)} ·
          релизов: {count(overview.matched.releases)}
        </p>
      </Card>

      {overview.reconciliation.length > 0 ? (
        <Card
          title="Сверка с итогами файла"
          hint="Сравниваем строку «ИТОГО» из отчёта с тем, что получилось, если сложить все строки. Небольшая разница обычно из-за округлений у дистрибьютора."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                  <th className="py-1.5 pr-4 font-medium" />
                  <th className="py-1.5 pr-4 font-medium">«ИТОГО» в файле</th>
                  <th className="py-1.5 pr-4 font-medium">Сумма строк</th>
                  <th className="py-1.5 font-medium">Разница</th>
                </tr>
              </thead>
              <tbody>
                {overview.reconciliation.map((line) => {
                  const isQuantity = line.label === "Количество";
                  const format = isQuantity ? count : money;
                  const ok = line.difference !== null && Math.abs(line.difference) < 0.01;
                  return (
                    <tr key={line.label} className="border-t border-white/[0.06]">
                      <td className="py-2 pr-4 text-white/70">{line.label}</td>
                      <td className="py-2 pr-4 tabular-nums text-white/85">{line.fileTotal === null ? "—" : format(line.fileTotal)}</td>
                      <td className="py-2 pr-4 tabular-nums text-white">{format(line.readTotal)}</td>
                      <td className={`py-2 tabular-nums ${line.difference === null ? "text-white/40" : ok ? "text-emerald-300" : "text-amber-300"}`}>
                        {line.difference === null ? "—" : ok ? "✓ сходится" : `${line.difference > 0 ? "+" : ""}${format(line.difference)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="По площадкам" hint="Сколько принесла каждая площадка по всему файлу.">
          <BreakdownList items={overview.byPlatform} total={total} />
        </Card>
        <div className="space-y-4">
          <Card title="По периодам" hint="За какие месяцы пришли деньги — в отчёт часто попадают прошлые периоды.">
            <BreakdownList items={overview.byPeriod} total={total} limit={24} />
          </Card>
          <Card title="По типу использования">
            <BreakdownList items={overview.byUsageType} total={total} limit={5} />
          </Card>
        </div>
      </div>

      <Card title="Как сопоставили" hint="По какому признаку строки отчёта привязаны к релизам в каталоге.">
        <div className="flex flex-wrap gap-2">
          {overview.byRule.map((rule) => (
            <span
              key={rule.rule}
              className="rounded-xl border border-white/[0.08] bg-[#11131a] px-3 py-2 text-[12px] text-white/70"
            >
              <span className="text-white">{rule.label}</span> · {count(rule.groups)} · {money(rule.amount)}
            </span>
          ))}
        </div>
      </Card>

      {overview.unmatchedItems.length > 0 ? (
        <Card
          title={`Не сопоставлено: ${count(overview.unmatchedItems.length)} на ${money(overview.unmatched.amount)}`}
          hint="Эти деньги никому не начислятся. Чаще всего релиза нет в каталоге или у него другое название. Добавьте релиз или поправьте его и загрузите отчёт заново."
          className="border-rose-500/15 bg-rose-500/[0.04]"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12px] text-white/70">
              <thead>
                <tr className="border-b border-white/[0.08] text-white/45">
                  <th className="px-2 py-2 font-medium">Код</th>
                  <th className="px-2 py-2 font-medium">Трек</th>
                  <th className="px-2 py-2 font-medium">Артист</th>
                  <th className="px-2 py-2 font-medium">Строк</th>
                  <th className="px-2 py-2 font-medium">Сумма</th>
                  <th className="px-2 py-2 font-medium">Почему</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedVisible.map((item) => (
                  <tr key={item.key} className="border-b border-white/[0.05] align-top">
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-white/80">{item.identifier}</td>
                    <td className="px-2 py-2 text-white">{item.title}</td>
                    <td className="px-2 py-2">{item.artist}</td>
                    <td className="px-2 py-2 tabular-nums">{count(item.rows)}</td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-rose-300">{money(item.amount)}</td>
                    <td className="min-w-[220px] px-2 py-2 text-white/55">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overview.unmatchedItems.length > 15 ? (
            <button
              type="button"
              onClick={() => setShowAllUnmatched((value) => !value)}
              className="mt-3 text-[12px] font-medium text-[#c4b5fd] hover:text-white"
            >
              {showAllUnmatched ? "Свернуть" : `Показать все (${overview.unmatchedItems.length})`}
            </button>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
