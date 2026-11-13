import { NextResponse } from "next/server";
import { z } from "zod";

import { applyFinanceSupplement } from "@/lib/smart-catalog-sync-service";

import { requireAdmin } from "../admin-guard";

export const maxDuration = 300;

const bodySchema = z.object({
  sourceImportId: z.string().uuid(),
  userId: z.string().uuid(),
  reportQuarter: z.coerce.number().int().min(1).max(4),
  reportYear: z.coerce.number().int().min(2000).max(3000)
});

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Укажите импорт, артиста и квартал." }, { status: 400 });
  }
  try {
    const item = await applyFinanceSupplement({ ...parsed.data, adminId: auth.adminId });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось начислить";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
