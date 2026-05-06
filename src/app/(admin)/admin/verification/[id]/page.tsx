import Link from "next/link";
import { notFound } from "next/navigation";
import { ReleaseStatus } from "@prisma/client";

import { AdminVerificationReviewActions } from "@/components/admin/admin-verification-review-actions";
import { getContractSignatureById, isVerificationSignatureUnavailable } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

function statusView(status: string) {
  if (status === "invalid_signature") {
    return {
      label: "Требуется повторная подпись",
      className: "border-amber-300/30 bg-amber-500/12 text-amber-100"
    };
  }
  if (status === "approved") return { label: "Подтверждено", className: "border-emerald-400/30 bg-emerald-500/12 text-emerald-200" };
  if (status === "rejected") return { label: "Отклонено", className: "border-rose-400/30 bg-rose-500/12 text-rose-100" };
  if (status === "pending") return { label: "Ожидает проверки", className: "border-amber-300/30 bg-amber-500/12 text-amber-100" };
  return { label: "Не подписано", className: "border-white/15 bg-white/5 text-white/70" };
}

export default async function AdminVerificationDetailPage({
  params
}: {
  params: { id: string };
}) {
  const item = await getContractSignatureById({ prisma, id: params.id });
  if (!item) notFound();
  const waitingReleaseCount = await prisma.release.count({
    where: {
      userId: item.userId,
      status: ReleaseStatus.PENDING_VERIFICATION
    }
  });
  const signatureUnavailable = isVerificationSignatureUnavailable(item.signatureImageUrl);
  const effectiveStatus =
    signatureUnavailable && (item.status === "pending" || item.status === "approved")
      ? "invalid_signature"
      : item.status;
  const statusMeta = statusView(effectiveStatus);

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">
            Верификация договора
          </h1>
          <p className="mt-2 text-[13.5px] text-white/55">
            {item.userEmail} · {new Date(item.signedAt).toLocaleString("ru-RU")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusMeta.className}`}>
              {statusMeta.label}
            </span>
            {waitingReleaseCount > 0 ? (
              <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2.5 py-1 text-[12px] font-semibold text-cyan-100">
                Релизов ожидает верификацию: {waitingReleaseCount}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {signatureUnavailable ? (
            <span className="rounded-lg border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-100">
              Подпись недоступна. Попросите пользователя переподписать договор.
            </span>
          ) : (
            <a
              href={`/api/admin/verification/${item.id}/signature/download`}
              className="rounded-lg border border-white/[0.14] bg-white/[0.03] px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.06]"
            >
              Скачать подпись PNG
            </a>
          )}
          <a
            href={`/api/admin/verification/${item.id}/contract/download`}
            className="rounded-lg border border-white/[0.14] bg-white/[0.03] px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.06]"
          >
            Скачать договор PDF
          </a>
          <Link
            href="/admin/verification"
            className="rounded-lg border border-white/[0.14] bg-white/[0.03] px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.06]"
          >
            Назад
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <AdminVerificationReviewActions verificationId={item.id} status={effectiveStatus as "not_signed" | "pending" | "approved" | "rejected" | "invalid_signature"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5 lg:col-span-2">
          <h2 className="text-[14px] font-semibold text-white">Персональные данные</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="ФИО" value={item.fullName} />
            <Info label="Дата рождения" value={item.birthDate || "—"} />
            <Info label="Адрес регистрации" value={item.address || "—"} className="sm:col-span-2" />
          </div>

          <h2 className="mt-8 text-[14px] font-semibold text-white">Паспортные данные</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Серия и номер" value={item.passportNumber || "—"} />
            <Info label="Код подразделения" value={item.passportCode || "—"} />
            <Info label="Кем выдан" value={item.passportIssuedBy || "—"} className="sm:col-span-2" />
            <Info label="Дата выдачи" value={item.passportIssueDate || "—"} />
          </div>

          <h2 className="mt-8 text-[14px] font-semibold text-white">ИНН / СНИЛС</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="ИНН" value={item.inn || "—"} />
            <Info label="СНИЛС" value={item.snils || "—"} />
            <Info label="ОГРНИП" value={item.ogrnip || "—"} />
            <Info label="Статус" value={statusMeta.label} />
          </div>

          {item.rejectionReason ? (
            <>
              <h2 className="mt-8 text-[14px] font-semibold text-white">Причина отклонения</h2>
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-[14px] text-rose-100">
                {item.rejectionReason}
              </div>
            </>
          ) : null}

          <h2 className="mt-8 text-[14px] font-semibold text-white">Тех. данные</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="IP" value={item.ipAddress || "—"} />
            <Info label="User-Agent" value={item.userAgent || "—"} className="sm:col-span-2" />
          </div>
        </section>

        <aside className="rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5">
          <h2 className="text-[14px] font-semibold text-white">Подпись</h2>
          {signatureUnavailable ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-[14px] text-amber-100">
              Старая подпись не сохранилась после переноса в локальную БД. Пользователь должен подписать договор заново, чтобы администратор мог скачать и проверить подпись.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.10] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/verification/${item.id}/signature/download?inline=1`}
                alt="Подпись"
                className="h-auto w-full"
              />
            </div>
          )}

          <div className="mt-4 text-[12.5px] text-white/55">
            Договор:{" "}
            <a
              href={`/api/admin/verification/${item.id}/contract/download`}
              className="text-sky-200 underline underline-offset-2"
            >
              {item.contractFileName}
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  className
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[12px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-[14px] text-white/80">{value}</p>
    </div>
  );
}
