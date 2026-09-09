import { AdminPayoutScheduleClient } from "@/components/admin/admin-payout-schedule-client";
import { getCurrentPayoutWindowState } from "@/lib/payout-schedule";
import { prisma } from "@/lib/prisma";

export default async function AdminPayoutSchedulePage() {
  const state = await getCurrentPayoutWindowState(prisma);

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Периоды выплат</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Настройка дней, когда пользователи могут создавать заявки на выплату по согласованным отчётам.
      </p>

      <AdminPayoutScheduleClient initialState={state} />
    </div>
  );
}
