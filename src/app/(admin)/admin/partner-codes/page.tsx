import { AdminPartnerCodesClient } from "@/components/admin/admin-partner-codes-client";
import { listPartnerCodes } from "@/lib/partner-codes";
import { prisma } from "@/lib/prisma";

export default async function AdminPartnerCodesPage() {
  const initialItems = await listPartnerCodes(prisma);

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">
        Партнёрские коды
      </h1>
      <p className="mt-2 max-w-3xl text-[14px] text-white/65">
        Создание и управление кодами, которые могут автоматически покрывать оплату релиза и
        отправлять его в модерацию без YooKassa.
      </p>

      <AdminPartnerCodesClient initialItems={initialItems} />
    </div>
  );
}
