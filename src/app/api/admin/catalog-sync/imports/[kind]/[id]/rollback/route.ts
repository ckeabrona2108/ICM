import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { rollbackCatalogImport, rollbackFinancialImport } from "@/lib/smart-catalog-sync-service";

type RouteContext = {
  params: Promise<{
    kind: "catalog" | "finance";
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { kind, id } = await context.params;
    const item =
      kind === "catalog"
        ? await rollbackCatalogImport({ importId: id, adminId: session.user.id })
        : await rollbackFinancialImport({ importId: id, adminId: session.user.id });

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rollback import";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
