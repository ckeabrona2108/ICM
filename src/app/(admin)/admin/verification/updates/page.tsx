import Link from "next/link";

import { listContractSignaturesForAdmin } from "@/lib/contract-verification";
import { CONTRACT_VERSION } from "@/lib/contract-verification-shared";
import { prisma } from "@/lib/prisma";

export default async function AdminContractUpdatesPage() {
  const allItems = await listContractSignaturesForAdmin({ prisma });
  const awaitingRenewal = allItems.filter(
    (item) => (item.status === "pending" || item.status === "approved") && item.contractVersion !== CONTRACT_VERSION
  );
  const renewedItems = allItems.filter((item) => item.contractHistory.length > 0);

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Обновления договоров</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-white/50">
        Контроль пользователей, которым требуется новая редакция, и история повторно подписанных договоров.
      </p>

      <section className="mt-6">
        <h2 className="text-[17px] font-semibold text-amber-100">Требуется обновление договора</h2>
        <div className="mt-3 space-y-3">
          {awaitingRenewal.length ? awaitingRenewal.map((item) => (
            <Link key={item.id} href={`/admin/verification/${item.id}`} className="block rounded-2xl border border-amber-300/20 bg-amber-500/[0.04] p-5 transition hover:border-amber-300/35 hover:bg-amber-500/[0.07]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[17px] font-semibold text-white">{item.userName || item.fullName || "Пользователь"}</p>
                  <p className="mt-1 text-[13px] text-white/52">{item.userEmail}</p>
                </div>
                <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-[12px] font-semibold text-amber-100">
                  {item.contractVersion} → {CONTRACT_VERSION}
                </span>
              </div>
              <p className="mt-4 text-[13px] text-white/62">Подписанная версия сохранена. Пользователю требуется подписать новую редакцию.</p>
            </Link>
          )) : (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0d0f16] px-5 py-8 text-center text-[14px] text-white/55">Все подписанные договоры актуальны.</div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[17px] font-semibold text-white">Повторно подписанные договоры</h2>
        <div className="mt-3 space-y-3">
        {renewedItems.length ? renewedItems.map((item) => {
          const previous = item.contractHistory.at(-1);
          return (
            <Link key={item.id} href={`/admin/verification/${item.id}`} className="block rounded-2xl border border-white/[0.08] bg-[#0d0f16] p-5 transition hover:border-amber-300/30 hover:bg-white/[0.03]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[17px] font-semibold text-white">{item.userName || item.fullName || "Пользователь"}</p>
                  <p className="mt-1 text-[13px] text-white/52">{item.userEmail}</p>
                </div>
                <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-[12px] font-semibold text-amber-100">
                  {previous?.contractVersion ?? "—"} → {item.contractVersion}
                </span>
              </div>
              <p className="mt-4 text-[13px] text-white/62">Подписано повторно: {new Date(item.signedAt).toLocaleString("ru-RU")}</p>
            </Link>
          );
        }) : (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d0f16] px-5 py-10 text-center text-[14px] text-white/55">Повторно подписанных договоров пока нет.</div>
        )}
        </div>
      </section>
    </div>
  );
}
