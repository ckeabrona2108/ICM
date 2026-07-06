import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  deleteSmartCatalogSyncImport,
  getSmartCatalogSyncImportDetails
} from "@/lib/smart-catalog-sync-service";

type RouteContext = {
  params: Promise<{
    kind: "catalog" | "finance";
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { kind, id } = await context.params;
    const item = await getSmartCatalogSyncImportDetails(kind, id);

    if (!item) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load import details";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { kind, id } = await context.params;
    const result = await deleteSmartCatalogSyncImport({
      kind,
      importId: id,
      adminId: session.user.id
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete import";
    const status = message === "Import not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
