import { AdminPayoutsClient } from "@/components/admin/admin-payouts-client";
import { listAdminPayoutRequests } from "@/lib/admin-payouts-service";
import { prisma } from "@/lib/prisma";

export default async function AdminPaymentsPage() {
  const payouts = await listAdminPayoutRequests(prisma, 200);

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Заявки на выплаты</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Контроль статусов выплат и очереди на обработку.
      </p>

      <AdminPayoutsClient initialPayouts={payouts} />
    </div>
  );
}
