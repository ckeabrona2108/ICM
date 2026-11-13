import { NextResponse } from "next/server";

import { scanFinanceUnallocatedCandidates } from "@/lib/smart-catalog-sync-service";

import { requireAdmin } from "../admin-guard";

export const maxDuration = 300;

export async function POST() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ ok: true, ...(await scanFinanceUnallocatedCandidates()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить нераспределённое";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
