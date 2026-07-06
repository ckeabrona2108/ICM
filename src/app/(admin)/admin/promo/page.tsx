import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  listAdminPromoSubmissions,
  promoSubmissionStatuses,
  formatPromoSubmissionStatusLabel
} from "@/lib/promo-service";

export const dynamic = "force-dynamic";

export default async function AdminPromoPage({
  searchParams
}: {
  searchParams?: { q?: string; status?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const query = searchParams?.q?.trim() ?? "";
  const status = searchParams?.status?.trim() ?? "";
  const items = await listAdminPromoSubmissions(prisma, {
    query: query || null,
    status: status || null
  });

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Промо</h1>
      <p className="mt-2 max-w-3xl text-[14px] text-white/65">
        Все пользовательские заявки на промо-поддержку, фильтрация по статусу и поиск по артисту, релизу, UPC и пользователю.
      </p>

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/[0.08] bg-[#11141d] p-4 sm:grid-cols-[1fr_220px_auto]" method="get">
        <input
          name="q"
          defaultValue={query}
          placeholder="Поиск по артисту, релизу, UPC, пользователю"
          className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
        />
        <select
          name="status"
          defaultValue={status}
          className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
        >
          <option value="">Все статусы</option>
          {promoSubmissionStatuses.map((item) => (
            <option key={item} value={item}>{formatPromoSubmissionStatusLabel(item)}</option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-xl bg-[#7b3df5] px-4 text-[14px] font-semibold text-white transition hover:bg-[#8b4ff7]">
          Применить
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#11141d]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-white/78">
            <thead className="bg-white/[0.03] text-[12px] uppercase tracking-[0.18em] text-white/42">
              <tr>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Пользователь</th>
                <th className="px-4 py-3">Артист</th>
                <th className="px-4 py-3">Релиз</th>
                <th className="px-4 py-3">Дата релиза</th>
                <th className="px-4 py-3">UPC</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Действие</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-white/48">Заявок пока нет.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-white/[0.06]">
                    <td className="px-4 py-3">{item.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{item.userName}</div>
                      <div className="text-xs text-white/44">{item.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">{item.artistName}</td>
                    <td className="px-4 py-3">{item.releaseTitle}</td>
                    <td className="px-4 py-3">{item.releaseDate}</td>
                    <td className="px-4 py-3">{item.upc}</td>
                    <td className="px-4 py-3">{formatPromoSubmissionStatusLabel(item.status)}</td>
                    <td className="px-4 py-3">{item.email}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/promo/${item.id}`} className="font-semibold text-violet-200 transition hover:text-white">
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
