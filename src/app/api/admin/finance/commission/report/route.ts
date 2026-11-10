import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-api-auth";
import { getCommissionReport } from "@/lib/commission-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (to is inclusive). Both optional: all time. */
export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const from = parseDay(url.searchParams.get("from"));
  const toDay = parseDay(url.searchParams.get("to"));
  const to = toDay ? new Date(toDay.getTime() + 24 * 60 * 60 * 1000) : null;

  const report = await getCommissionReport(prisma, { from, to });
  return NextResponse.json({ ok: true, report });
}
