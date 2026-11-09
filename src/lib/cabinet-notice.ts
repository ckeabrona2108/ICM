import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A temporary notice an admin shows at the top of every artist's cabinet overview, e.g.
 * "Отчёт за III квартал задерживается". Stored in platform_settings, so no migration is needed.
 */

export const CABINET_NOTICE_KEY = "cabinet_notice";

export type CabinetNoticeTone = "info" | "warning" | "success";

export interface CabinetNotice {
  enabled: boolean;
  tone: CabinetNoticeTone;
  title: string;
  message: string;
  /** Optional button. */
  linkLabel: string;
  linkHref: string;
  /** Changes on every save, so an artist who closed an old notice still sees a new one. */
  version: string;
  updatedAt: string | null;
}

export const EMPTY_CABINET_NOTICE: CabinetNotice = {
  enabled: false,
  tone: "warning",
  title: "",
  message: "",
  linkLabel: "",
  linkHref: "",
  version: "",
  updatedAt: null
};

const MAX_TITLE = 120;
const MAX_MESSAGE = 600;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Only links inside the site or https links. */
function safeHref(value: unknown): string {
  const href = text(value, 300);
  if (!href) return "";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return /^https:\/\/[^\s]+$/iu.test(href) ? href : "";
}

export function normalizeCabinetNotice(value: unknown): CabinetNotice {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const tone = source.tone === "info" || source.tone === "success" ? source.tone : "warning";
  const linkHref = safeHref(source.linkHref);
  return {
    enabled: source.enabled === true,
    tone,
    title: text(source.title, MAX_TITLE),
    message: text(source.message, MAX_MESSAGE),
    linkLabel: linkHref ? text(source.linkLabel, 40) : "",
    linkHref,
    version: text(source.version, 64),
    updatedAt: text(source.updatedAt, 40) || null
  };
}

/** What the artist sees: nothing unless switched on and filled in. */
export function visibleCabinetNotice(notice: CabinetNotice): CabinetNotice | null {
  if (!notice.enabled) return null;
  if (!notice.title && !notice.message) return null;
  return notice;
}

export async function readCabinetNotice(prisma: PrismaClient): Promise<CabinetNotice> {
  try {
    const row = await prisma.platform_settings.findUnique({
      where: { key: CABINET_NOTICE_KEY },
      select: { value_json: true }
    });
    return normalizeCabinetNotice(row?.value_json);
  } catch (error) {
    console.error("[cabinet-notice] read failed", error);
    return EMPTY_CABINET_NOTICE;
  }
}

export async function writeCabinetNotice(params: {
  prisma: PrismaClient;
  adminId: string;
  notice: unknown;
  now?: Date;
}): Promise<CabinetNotice> {
  const now = params.now ?? new Date();
  const notice: CabinetNotice = {
    ...normalizeCabinetNotice(params.notice),
    version: now.getTime().toString(36),
    updatedAt: now.toISOString()
  };
  const value = notice as unknown as Prisma.InputJsonValue;
  await params.prisma.platform_settings.upsert({
    where: { key: CABINET_NOTICE_KEY },
    create: { id: randomUUID(), key: CABINET_NOTICE_KEY, value_json: value, updated_by_id: params.adminId },
    update: { value_json: value, updated_by_id: params.adminId }
  });
  return notice;
}
