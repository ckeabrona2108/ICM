import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getEventVenueSuggestions } from "@/lib/events-service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const venues = await getEventVenueSuggestions(query, session.user.id);
    return NextResponse.json({ ok: true, venues }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search venues";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
