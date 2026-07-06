import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { createTicketOrder } from "@/lib/events-service";

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  try {
    const payload = await request.json();
    const result = await createTicketOrder({
      eventId: context.params.id,
      buyerUserId: session?.user?.id ?? null,
      payload,
      requestOrigin: new URL(request.url).origin
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to purchase ticket";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
