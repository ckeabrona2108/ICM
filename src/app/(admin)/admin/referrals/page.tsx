import { AdminReferralsClient } from "@/components/admin/admin-referrals-client";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { prisma } from "@/lib/prisma";
import { listReferralsForAdmin } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export default async function AdminReferralsPage() {
  await requireAdminPage();
  const rows = await listReferralsForAdmin(prisma).catch((error) => {
    console.error("[admin/referrals] list failed", error);
    return null;
  });

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Приглашения</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Кто кого пригласил. Бонус пригласившему начисляется через 14 дней после первой оплаты друга. Явную накрутку можно
        отменить: уже выданный бонус спишется.
      </p>
      {rows ? (
        <AdminReferralsClient rows={rows} />
      ) : (
        <p className="mt-6 text-[14px] text-amber-200">Таблицы приглашений ещё не созданы: примените миграцию 20261124120000_referrals.</p>
      )}
    </div>
  );
}
