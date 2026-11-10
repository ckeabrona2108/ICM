import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { isNewYearThemeEnabled, setNewYearThemeEnabled } from "@/lib/seasonal-theme";

export const dynamic = "force-dynamic";

/** { newYearTheme: boolean } */
export async function PUT(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { newYearTheme?: unknown } | null;
  if (typeof body?.newYearTheme !== "boolean") {
    return NextResponse.json({ error: "newYearTheme must be true or false" }, { status: 400 });
  }

  await setNewYearThemeEnabled({ prisma, adminId: auth.session.user.id, enabled: body.newYearTheme });
  return NextResponse.json({ ok: true, newYearTheme: await isNewYearThemeEnabled(prisma) });
}
