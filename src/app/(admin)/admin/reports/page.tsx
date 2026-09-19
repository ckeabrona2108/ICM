import Link from "next/link";

import { AdminReportDeleteButton } from "@/components/admin/admin-report-delete-button";
import { AdminReportPreviewButton } from "@/components/admin/admin-report-preview-button";
import { formatRubCurrency } from "@/lib/currency-format";
import { prisma } from "@/lib/prisma";
import { listAdminFinanceReports, type AdminFinanceReportItem } from "@/lib/report-service";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

function userLabel(user: AdminFinanceReportItem["user"]) {
  return user.name?.trim() || user.email?.trim() || "Пользователь";
}

function lifecycleLabel(report: AdminFinanceReportItem) {
  if (report.lifecycleState === "agreed") return "Согласован";
  if (report.lifecycleState === "changes_requested") return "На доработке";
  return "Ожидает согласования";
}

function lifecycleClass(report: AdminFinanceReportItem) {
  if (report.lifecycleState === "agreed") return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  if (report.lifecycleState === "changes_requested") return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  return "border-sky-300/20 bg-sky-400/10 text-sky-100";
}

export default async function AdminFinanceReportsPage() {
  const reports = await listAdminFinanceReports(prisma, 500, { includeDetails: false });
  const pendingCount = reports.filter((report) => report.lifecycleState === "ready_to_confirm").length;
  const reworkCount = reports.filter((report) => report.lifecycleState === "changes_requested").length;

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">
            Финансовые отчёты
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
            Все активные отчёты пользователей в одном месте. Здесь можно быстро найти ошибочный отчёт и удалить его без перехода по каждому профилю вручную.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-white/76">
            Всего: {reports.length}
          </span>
          <span className="inline-flex w-fit rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-[12px] font-semibold text-sky-100">
            На согласовании: {pendingCount}
          </span>
          <span className="inline-flex w-fit rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[12px] font-semibold text-amber-100">
            На доработке: {reworkCount}
          </span>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="mt-8 rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-8 text-center shadow-[0_24px_80px_-56px_rgba(0,0,0,0.9)]">
          <p className="text-[16px] font-semibold text-white">Финансовых отчётов нет</p>
          <p className="mt-2 text-[13.5px] text-white/50">
            После отправки отчёта пользователю он появится в этом списке.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#12131a]/92 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-[13px]">
              <thead className="border-b border-white/[0.08] bg-white/[0.025] text-[11px] uppercase tracking-[0.16em] text-white/38">
                <tr>
                  <th className="px-5 py-4 font-semibold">Пользователь</th>
                  <th className="px-5 py-4 font-semibold">Отчёт</th>
                  <th className="px-5 py-4 font-semibold">Период</th>
                  <th className="px-5 py-4 font-semibold">Статус</th>
                  <th className="px-5 py-4 text-right font-semibold">Сумма</th>
                  <th className="px-5 py-4 text-right font-semibold">Строк</th>
                  <th className="px-5 py-4 text-right font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {reports.map((report) => (
                  <tr key={report.id} className="align-top text-white/72">
                    <td className="px-5 py-4">
                      <p className="max-w-[260px] truncate text-[14px] font-semibold text-white">
                        {userLabel(report.user)}
                      </p>
                      <p className="mt-1 max-w-[260px] truncate text-[12.5px] text-white/45">
                        {report.user.email ?? "Email не указан"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[14px] font-semibold text-white">{report.quarterLabel}</p>
                      <p className="mt-1 max-w-[260px] truncate text-[12.5px] text-white/45">
                        ID: {report.id}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-white/62">
                      {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${lifecycleClass(report)}`}>
                        {lifecycleLabel(report)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-[14px] font-semibold text-white">
                      {formatRubCurrency(report.amount)}
                    </td>
                    <td className="px-5 py-4 text-right text-[14px] font-semibold text-white/78">
                      {report.itemCount ?? report.items.length}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <AdminReportPreviewButton report={report} />
                        <Link
                          href={`/admin/users/${report.user.id}`}
                          className="inline-flex items-center justify-center rounded-2xl border border-[#7b3df5]/45 bg-[#7b3df5]/16 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#7b3df5]/28"
                        >
                          Профиль
                        </Link>
                        <AdminReportDeleteButton
                          userId={report.user.id}
                          reportId={report.id}
                          quarterLabel={report.quarterLabel}
                          amount={report.amount}
                          isAgreed={report.lifecycleState === "agreed"}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
