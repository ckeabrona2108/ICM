import Link from "next/link";

import { isVerificationSignatureUnavailable, listContractSignaturesForAdmin } from "@/lib/contract-verification";
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

export default async function AdminVerificationPage() {
  const items = await listContractSignaturesForAdmin({ prisma });

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Верификация</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Договоры пользователей, ожидающие проверки, и история решений.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0f16]">
        <div className="hidden grid-cols-12 gap-2 border-b border-white/[0.08] px-5 py-3 text-[12px] uppercase tracking-wide text-white/45 md:grid">
          <div className="col-span-3">Пользователь</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Дата</div>
          <div className="col-span-2">Статус</div>
          <div className="col-span-2">Версия</div>
          <div className="col-span-2 text-right">Действия</div>
        </div>

        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-white/55">Подписей пока нет.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {items.map((item) => {
              const effectiveStatus =
                isVerificationSignatureUnavailable(item.signatureImageUrl) &&
                (item.status === "pending" || item.status === "approved")
                  ? "invalid_signature"
                  : item.status;

              return (
                <div key={item.id}>
                  <div className="p-4 md:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold text-white">
                          {item.userName || item.fullName || "—"}
                        </p>
                        <p className="mt-1 break-all text-[12px] leading-5 text-white/[0.42]">ID: {item.userId}</p>
                      </div>
                      <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusView(effectiveStatus).className}`}>
                        {statusView(effectiveStatus).label}
                      </span>
                    </div>

                    <div className="mt-4 border-t border-white/[0.06] pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/[0.38]">Email</p>
                      <p className="mt-1 break-all text-[14px] leading-5 text-white/[0.78]">{item.userEmail}</p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/[0.38]">Дата</p>
                        <p className="mt-1 text-[13px] leading-5 text-white/[0.72]">
                          {new Date(item.signedAt).toLocaleString("ru-RU")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/[0.38]">Версия</p>
                        <p className="mt-1 text-[13px] leading-5 text-white/[0.72]">{item.contractVersion}</p>
                      </div>
                    </div>

                    <Link
                      href={`/admin/verification/${item.id}`}
                      className="mt-5 flex h-11 w-full items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.04] text-[13px] font-semibold text-white/[0.86] transition hover:bg-white/[0.08]"
                    >
                      Открыть
                    </Link>
                  </div>

                  <div className="hidden grid-cols-12 items-center gap-2 px-5 py-4 md:grid">
                    <div className="col-span-3">
                      <p className="text-[14px] font-medium text-white">{item.userName || item.fullName || "—"}</p>
                      <p className="mt-1 text-[12px] text-white/45">id: {item.userId}</p>
                    </div>
                    <div className="col-span-3 text-[13px] text-white/70">{item.userEmail}</div>
                    <div className="col-span-2 text-[13px] text-white/70">
                      {new Date(item.signedAt).toLocaleString("ru-RU")}
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusView(effectiveStatus).className}`}>
                        {statusView(effectiveStatus).label}
                      </span>
                    </div>
                    <div className="col-span-2 text-[13px] text-white/70">{item.contractVersion}</div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <Link
                        href={`/admin/verification/${item.id}`}
                        className="rounded-lg border border-white/[0.14] bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-white/80 hover:bg-white/[0.06]"
                      >
                        Открыть
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
