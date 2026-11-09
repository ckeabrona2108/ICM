import { AdminCabinetNoticeClient } from "@/components/admin/admin-cabinet-notice-client";
import { readCabinetNotice } from "@/lib/cabinet-notice";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminCabinetNoticePage() {
  const notice = await readCabinetNotice(prisma);
  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Срочное уведомление</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Плашка вверху «Обзора» у всех артистов. Например: «Отчёт за III квартал задерживается». Артист может её
        закрыть; после нового сохранения она покажется снова.
      </p>
      <AdminCabinetNoticeClient initialNotice={notice} />
    </div>
  );
}
