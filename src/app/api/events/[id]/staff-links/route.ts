import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { createStaffAccessLink } from "@/lib/event-ticketing";

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as { label?: string; expiresInHours?: number };

  try {
    const result = await createStaffAccessLink({
      eventId: context.params.id,
      actorUserId: session.user.id,
      label: payload.label,
      expiresInHours: payload.expiresInHours,
      requestOrigin: new URL(request.url).origin
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create staff link" },
      { status: 400 }
    );
  }
}
