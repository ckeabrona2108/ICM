import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getVideoSnippetSources } from "@/lib/video-snippet-sources";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sources = await getVideoSnippetSources(session.user.id);
  return NextResponse.json({ sources });
}
