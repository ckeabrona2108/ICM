import { NextResponse } from "next/server";

import { getFinanceUnallocatedDetails } from "@/lib/smart-catalog-sync-service";

import { requireAdmin } from "../admin-guard";

export const dynamic = "force-dynamic";

/** Money still in the pool, one line per track (optionally of one import). Read-only. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const importId = new URL(request.url).searchParams.get("importId")?.trim() || undefined;
  try {
    return NextResponse.json({ ok: true, details: await getFinanceUnallocatedDetails({ importId }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось показать нераспределённое";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
