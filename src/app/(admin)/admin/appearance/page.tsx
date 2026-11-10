import { AdminAppearanceClient } from "@/components/admin/admin-appearance-client";
import { prisma } from "@/lib/prisma";
import { isNewYearThemeEnabled } from "@/lib/seasonal-theme";

export const dynamic = "force-dynamic";

export default async function AdminAppearancePage() {
  const newYearTheme = await isNewYearThemeEnabled(prisma);
  const envOverride = process.env.NEW_YEAR_THEME?.trim().toLowerCase();

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Оформление</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-white/50 sm:text-[14px]">
        Сезонное оформление сайта и смарт-ссылок. Включается и выключается сразу для всех посетителей.
      </p>
      <AdminAppearanceClient
        initialNewYearTheme={newYearTheme}
        envOverride={envOverride === "on" || envOverride === "off" ? envOverride : null}
      />
    </div>
  );
}
