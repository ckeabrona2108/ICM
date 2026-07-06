import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listSmartCatalogSyncImports } from "@/lib/smart-catalog-sync-service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");

  try {
    const items = await listSmartCatalogSyncImports(Number.isFinite(limit) ? limit : 100);
    return NextResponse.json({ ok: true, ...items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load smart catalog sync imports";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
