import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { applyCatalogImport, applyFinancialImport } from "@/lib/smart-catalog-sync-service";

type RouteContext = {
  params: Promise<{
    kind: "catalog" | "finance";
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { kind, id } = await context.params;
    const payload = (await request.json().catch(() => null)) as
      | { allocations?: Array<{ rowId?: string; netAmount?: number | string }> }
      | null;
    const allocations = Array.isArray(payload?.allocations)
      ? payload.allocations
          .filter((item) => typeof item?.rowId === "string")
          .map((item) => ({
            rowId: String(item?.rowId),
            netAmount: Number(item?.netAmount ?? 0)
          }))
      : undefined;
    const item =
      kind === "catalog"
        ? await applyCatalogImport({ importId: id, adminId: session.user.id })
        : await applyFinancialImport({ importId: id, adminId: session.user.id, allocations });

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply import";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
