import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-api-auth";
import { searchUsersForCommission } from "@/lib/commission-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** ?q= name or e-mail, at least 2 characters */
export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const users = await searchUsersForCommission(prisma, q);
  return NextResponse.json({ ok: true, users });
}
