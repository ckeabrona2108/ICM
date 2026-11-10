import type { PrismaClient } from "@prisma/client";

import { createAdminLog } from "@/lib/admin-log-service";

export const NEW_YEAR_THEME_SETTING_KEY = "new_year_theme";

/**
 * Whether the New Year look (snow, garland, festive smart link headers) is on.
 * Switched in the admin "Оформление" page. NEW_YEAR_THEME=on|off overrides it, e.g. for a local preview.
 */
export async function isNewYearThemeEnabled(prisma: PrismaClient): Promise<boolean> {
  const override = process.env.NEW_YEAR_THEME?.trim().toLowerCase();
  if (override === "on") return true;
  if (override === "off") return false;
  try {
    const setting = await prisma.platform_settings.findUnique({ where: { key: NEW_YEAR_THEME_SETTING_KEY } });
    return Number(setting?.value_number ?? 0) === 1;
  } catch (error) {
    console.error("[seasonal-theme] failed to read setting", error);
    return false;
  }
}

export async function setNewYearThemeEnabled(params: { prisma: PrismaClient; adminId: string; enabled: boolean }) {
  await params.prisma.platform_settings.upsert({
    where: { key: NEW_YEAR_THEME_SETTING_KEY },
    create: { key: NEW_YEAR_THEME_SETTING_KEY, value_number: params.enabled ? 1 : 0, updated_by_id: params.adminId },
    update: { value_number: params.enabled ? 1 : 0, updated_by_id: params.adminId }
  });
  await createAdminLog(params.prisma, {
    adminId: params.adminId,
    action: "appearance.new_year_theme",
    targetType: "platform_settings",
    targetId: NEW_YEAR_THEME_SETTING_KEY,
    newValue: params.enabled
  });
}
