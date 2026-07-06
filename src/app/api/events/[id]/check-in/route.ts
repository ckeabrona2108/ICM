import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkInTicket } from "@/lib/events-service";

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const result = await checkInTicket({
      eventId: context.params.id,
      actorUserId: session.user.id,
      payload
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check in ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
