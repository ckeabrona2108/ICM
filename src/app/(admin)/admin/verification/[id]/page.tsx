import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminVerificationReviewActions } from "@/components/admin/admin-verification-review-actions";
import {
  getContractSignatureById,
  isVerificationSignatureUnavailable
} from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
}

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

function statusView(status: string) {
  if (status === "invalid_signature") {
    return {
      label: "Требуется повторная подпись",
      className: "border-amber-300/30 bg-amber-500/12 text-amber-100"
    };
  }
  if (status === "approved") {
    return {
      label: "Подтверждено",
      className: "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
    };
  }
  if (status === "rejected") {
    return {
      label: "Отклонено",
      className: "border-rose-400/30 bg-rose-500/12 text-rose-100"
    };
  }
  if (status === "pending") {
    return {
      label: "Ожидает проверки",
      className: "border-amber-300/30 bg-amber-500/12 text-amber-100"
    };
  }
  return {
    label: "Не подписано",
    className: "border-white/15 bg-white/5 text-white/70"
  };
}

function Field({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <div className="mt-1.5 break-words text-[14px] font-medium text-white/82">{value || "—"}</div>
    </div>
  );
}

export default async function VerificationDetailsPage({
  params
}: {
  params: { id: string };
}) {
  const item = await getContractSignatureById({ prisma, id: params.id });
  if (!item) {
    notFound();
  }

  const effectiveStatus =
    isVerificationSignatureUnavailable(item.signatureImageUrl) &&
    (item.status === "pending" || item.status === "approved")
      ? "invalid_signature"
      : item.status;
  const status = statusView(effectiveStatus);
  const canOpenSignature = !isVerificationSignatureUnavailable(item.signatureImageUrl);

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/verification"
            className="text-[13px] font-medium text-white/48 transition-colors hover:text-white/75"
          >
            ← Назад к верификациям
          </Link>
          <h1 className="mt-3 text-[24px] font-semibold tracking-tight text-white sm:text-[28px]">
            Детали верификации
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
            Проверка подписанного договора и реквизитов пользователя.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <span className={`inline-flex rounded-full border px-3 py-1.5 text-[12px] font-semibold ${status.className}`}>
            {status.label}
          </span>
          <AdminVerificationReviewActions verificationId={item.id} status={effectiveStatus} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5">
          <h2 className="text-[18px] font-semibold text-white">Пользователь</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="ФИО" value={item.fullName || item.userName || "—"} />
            <Field label="Email" value={item.userEmail} />
            <Field label="ID пользователя" value={item.userId} />
            <Field label="Дата подписи" value={formatDate(item.signedAt)} />
            <Field label="Версия договора" value={item.contractVersion} />
            <Field label="IP" value={item.ipAddress ?? "—"} />
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5">
          <h2 className="text-[18px] font-semibold text-white">Документы</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/api/admin/verification/${item.id}/contract/download`}
              className="rounded-lg border border-white/[0.14] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
            >
              Скачать договор
            </a>
            {canOpenSignature ? (
              <>
                <a
                  href={`/api/admin/verification/${item.id}/signature/download?inline=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/[0.14] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
                >
                  Открыть подпись
                </a>
                <a
                  href={`/api/admin/verification/${item.id}/signature/download`}
                  className="rounded-lg border border-white/[0.14] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
                >
                  Скачать подпись
                </a>
              </>
            ) : (
              <span className="rounded-lg border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[13px] font-medium text-amber-100">
                Подпись недоступна
              </span>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Файл договора</p>
            <p className="mt-1.5 break-words text-[13px] text-white/70">{item.contractFileName || "—"}</p>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5">
        <h2 className="text-[18px] font-semibold text-white">Паспортные данные и реквизиты</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Дата рождения" value={formatDateOnly(item.birthDate)} />
          <Field label="Паспорт" value={item.passportNumber ?? "—"} />
          <Field label="Кем выдан" value={item.passportIssuedBy ?? "—"} />
          <Field label="Код подразделения" value={item.passportCode ?? "—"} />
          <Field label="Дата выдачи" value={formatDateOnly(item.passportIssueDate)} />
          <Field label="ИНН" value={item.inn ?? "—"} />
          <Field label="СНИЛС" value={item.snils ?? "—"} />
          <Field label="ОГРНИП" value={item.ogrnip ?? "—"} />
          <Field label="Адрес" value={item.address ?? "—"} />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5">
        <h2 className="text-[18px] font-semibold text-white">История решения</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Создано" value={formatDate(item.createdAt)} />
          <Field label="Обновлено" value={formatDate(item.updatedAt)} />
          <Field label="Подтверждено" value={formatDate(item.approvedAt)} />
          <Field label="Отклонено" value={formatDate(item.rejectedAt)} />
          <Field label="ID админа подтверждения" value={item.approvedByAdminId ?? "—"} />
          <Field label="ID админа отклонения" value={item.rejectedByAdminId ?? "—"} />
          <Field label="Причина отклонения" value={item.rejectionReason ?? "—"} />
        </div>
      </section>

      {item.userAgent ? (
        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5">
          <h2 className="text-[18px] font-semibold text-white">User Agent</h2>
          <p className="mt-3 break-words rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[13px] text-white/62">
            {item.userAgent}
          </p>
        </section>
      ) : null}
    </div>
  );
}
