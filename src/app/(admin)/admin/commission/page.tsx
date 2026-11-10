import { AdminCommissionClient } from "@/components/admin/admin-commission-client";
import {
  getCommissionReport,
  listArtistCommissionRates,
  rateToPercent,
  readGlobalCommissionRate
} from "@/lib/commission-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminCommissionPage() {
  const [globalRate, artists, report] = await Promise.all([
    readGlobalCommissionRate(prisma),
    listArtistCommissionRates(prisma),
    getCommissionReport(prisma, {})
  ]);

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Комиссия</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Процент ICECREAMMUSIC, который удерживается из роялти при финансовом импорте. Видно только администраторам: артист в
        кабинете видит лишь сумму к получению, без процента и комиссии.
      </p>

      <AdminCommissionClient
        initialState={{ globalPercent: rateToPercent(globalRate), artists }}
        initialReport={report}
      />
    </div>
  );
}
