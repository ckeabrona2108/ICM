import { NextResponse } from "next/server";

import { buildFinanceUnallocatedWorkbook } from "@/lib/smart-catalog-sync-service";

import { requireAdmin } from "../admin-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const importId = new URL(request.url).searchParams.get("importId")?.trim() || undefined;
  try {
    const workbook = await buildFinanceUnallocatedWorkbook({ importId });
    return new NextResponse(new Uint8Array(workbook.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${workbook.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выгрузить нераспределённое";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
