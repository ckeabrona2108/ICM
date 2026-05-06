import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "docs", "contract-2026-01.pdf");
    const bytes = await readFile(filePath);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Document unavailable" }, { status: 404 });
  }
}

