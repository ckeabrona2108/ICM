import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { buildFinancialImportDetailsWorkbook } from "@/lib/smart-catalog-sync-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await context.params;
    const workbook = await buildFinancialImportDetailsWorkbook({ importId: id });
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
    const message = error instanceof Error ? error.message : "Failed to export financial details";
    return NextResponse.json({ error: message }, { status: message === "Financial import not found" ? 404 : 400 });
  }
}
