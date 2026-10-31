import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVkGroupMembership, getVkIdConfig } from "@/lib/vk-id";

export const dynamic = "force-dynamic";

async function timed<T>(run: () => Promise<T>): Promise<{ ok: boolean; ms: number; error?: string; value?: T }> {
  const startedAt = Date.now();
  try {
    const value = await run();
    return { ok: true, ms: Date.now() - startedAt, value };
  } catch (error) {
    return { ok: false, ms: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) };
  }
}

// Open in the browser as an admin to check that this server reaches VK and the free
// release is fully configured. Makes no changes.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = getVkIdConfig();
  const env = {
    AUTH_VK_ID: Boolean(process.env.AUTH_VK_ID?.trim()),
    VK_GROUP_ID: Boolean(process.env.VK_GROUP_ID?.trim()),
    VK_GROUP_TOKEN: Boolean(process.env.VK_GROUP_TOKEN?.trim()),
    FREE_RELEASE_IDENTITY_SECRET: Boolean(process.env.FREE_RELEASE_IDENTITY_SECRET?.trim())
  };

  const [vkApi, vkId, tables] = await Promise.all([
    config
      ? timed(() => checkVkGroupMembership({ config, vkUserId: "1" }))
      : Promise.resolve({ ok: false, ms: 0, error: "VK не настроен" }),
    timed(async () => {
      const response = await fetch("https://id.vk.ru/authorize", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }),
    timed(async () => {
      await Promise.all([prisma.vk_links.count(), prisma.free_release_claims.count()]);
    })
  ]);

  const ok = Object.values(env).every(Boolean) && vkApi.ok && vkId.ok && tables.ok;
  return NextResponse.json(
    {
      ok,
      env,
      checks: {
        vkApiGroupsIsMember: { ok: vkApi.ok, ms: vkApi.ms, error: vkApi.error },
        vkIdReachable: { ok: vkId.ok, ms: vkId.ms, error: vkId.error },
        databaseTables: { ok: tables.ok, error: tables.error ? "Таблицы не найдены — примените миграцию." : undefined }
      }
    },
    { status: ok ? 200 : 503 }
  );
}
