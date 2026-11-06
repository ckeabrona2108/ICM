import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getReleaseLinksOverview } from "@/lib/platform-link-discovery-service";

export const dynamic = "force-dynamic";

/** Artist cards with their platform profiles and the release × platform links table. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getReleaseLinksOverview(session.user.id));
}
