import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { searchArtistForWizard } from "@/lib/platform-link-discovery-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Release wizard: the artist's own profiles and namesakes on platforms for a performer name. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (name.length < 2 || name.length > 120) return NextResponse.json({ known: [], candidates: {} });

  const limited = enforceRateLimit({ key: `platform-links-artist-search:${session.user.id}`, limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    return NextResponse.json(await searchArtistForWizard(session.user.id, name));
  } catch (error) {
    console.error("[platform-links] artist search failed", error);
    return NextResponse.json({ error: "Поиск артиста сейчас недоступен" }, { status: 500 });
  }
}
