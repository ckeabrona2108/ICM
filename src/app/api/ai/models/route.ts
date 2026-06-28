import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getAiStudioModelCatalog } from "@/lib/ai-studio-model-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getAiStudioModelCatalog(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
