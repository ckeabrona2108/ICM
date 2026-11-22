import { notFound } from "next/navigation";

import { AdminModerationCalendarClient } from "@/components/admin/admin-moderation-calendar-client";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { loadModerationCalendar } from "@/lib/moderation-calendar-settings";
import { prisma } from "@/lib/prisma";
import { areRussianHolidaysEnabled } from "@/lib/russian-holidays";

export const dynamic = "force-dynamic";

export default async function AdminModerationCalendarPage() {
  await requireAdminPage();
  // Hidden while the holiday calendar is switched off.
  if (!areRussianHolidaysEnabled()) notFound();
  const calendar = await loadModerationCalendar(prisma);

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Праздники и график модерации</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Выходные и праздники РФ уже учтены по производственному календарю (2026 и 2027 годы). Здесь можно добавить
        свои дни: когда модерация не работает, хотя день рабочий, или работает в выходной. Изменения сразу видят все
        артисты — в календаре даты релиза, в плашках о сроках и о праздниках.
      </p>
      <AdminModerationCalendarClient initialCalendar={calendar} />
    </div>
  );
}
