import Link from "next/link";

import { ReportReplacementUpload, ReportReworkDeleteButton } from "@/components/admin/report-replacement-upload";
import { formatRubCurrency } from "@/lib/currency-format";
import { prisma } from "@/lib/prisma";
import { listAdminChangesRequestedReports } from "@/lib/report-service";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

function userLabel(user: { name: string | null; email: string | null }) {
  return user.name?.trim() || user.email?.trim() || "Пользователь";
}

export default async function AdminChangesRequestedReportsPage() {
  const reports = await listAdminChangesRequestedReports(prisma, 200);

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">
            Отчёты на доработке
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
            Финансовые отчёты, которые пользователи отклонили и отправили с комментарием администратору.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[12px] font-semibold text-amber-100">
          Всего: {reports.length}
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="mt-8 rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-8 text-center shadow-[0_24px_80px_-56px_rgba(0,0,0,0.9)]">
          <p className="text-[16px] font-semibold text-white">Нет отчётов на доработке</p>
          <p className="mt-2 text-[13.5px] text-white/50">
            Когда пользователь отклонит финансовый отчёт, он появится здесь вместе с причиной.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {reports.map((report) => (
            <article
              key={report.id}
              className="rounded-[24px] border border-white/[0.08] bg-[#12131a]/92 p-5 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[18px] font-semibold text-white">{report.quarterLabel}</h2>
                    <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                      На доработке
                    </span>
                  </div>
                  <p className="mt-2 text-[13.5px] text-white/55">
                    {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-2 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Сумма</p>
                    <p className="text-[16px] font-semibold text-white">{formatRubCurrency(report.amount)}</p>
                  </div>
                  <Link
                    href={`/admin/users/${report.user.id}`}
                    className="inline-flex items-center justify-center rounded-2xl border border-[#7b3df5]/45 bg-[#7b3df5]/16 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#7b3df5]/28"
                  >
                    Открыть пользователя
                  </Link>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="rounded-2xl border border-white/[0.08] bg-black/18 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Пользователь</p>
                  <p className="mt-2 truncate text-[15px] font-semibold text-white">{userLabel(report.user)}</p>
                  <p className="mt-1 truncate text-[13px] text-white/50">{report.user.email ?? "Email не указан"}</p>
                </div>

                <div className="rounded-2xl border border-amber-300/12 bg-amber-300/[0.045] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">
                    Причина от пользователя
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-white/82">
                    {report.userComment || "Комментарий не указан."}
                  </p>
                </div>
              </div>

              {report.adminComment ? (
                <div className="mt-4 rounded-2xl border border-emerald-300/12 bg-emerald-300/[0.045] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">
                    История админа
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/72">
                    {report.adminComment}
                  </p>
                </div>
              ) : null}

              <ReportReplacementUpload
                userId={report.user.id}
                reportId={report.id}
              />
              <ReportReworkDeleteButton
                userId={report.user.id}
                reportId={report.id}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
