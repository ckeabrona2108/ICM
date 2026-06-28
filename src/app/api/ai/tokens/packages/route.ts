import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { AI_TOKEN_PACKAGE_FALLBACKS, listAiTokenPackages } from "@/lib/ai-token-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const packages = await listAiTokenPackages(prisma);
    return NextResponse.json({ packages }, { status: 200 });
  } catch {
    return NextResponse.json({ packages: AI_TOKEN_PACKAGE_FALLBACKS }, { status: 200 });
  }
}
