import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { findSmartLinkLinksForOwner } from "@/lib/smart-link-service";

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  const limited = enforceRateLimit({ key: `smart-link-autofill:${session.user.id}`, limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const result = await findSmartLinkLinksForOwner({ userId: session.user.id, releaseId });
    if (!result) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[smart-link:autofill] owner search failed", error);
    return NextResponse.json({ error: "Не удалось выполнить поиск. Попробуйте позже." }, { status: 500 });
  }
}
