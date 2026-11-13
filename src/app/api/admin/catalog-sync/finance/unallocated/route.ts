import { NextResponse } from "next/server";

import { getFinanceUnallocatedOverview } from "@/lib/smart-catalog-sync-service";

import { requireAdmin } from "./admin-guard";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ ok: true, overview: await getFinanceUnallocatedOverview() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось посчитать нераспределённое";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
