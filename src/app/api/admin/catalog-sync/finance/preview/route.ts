import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { previewFinancialImport } from "@/lib/smart-catalog-sync-service";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Expected file in multipart payload." }, { status: 400 });
    }

    const preview = await previewFinancialImport({
      adminId: session.user.id,
      sourceFileName: file.name,
      arrayBuffer: await file.arrayBuffer()
    });

    return NextResponse.json({ ok: true, preview }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview financial import";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
