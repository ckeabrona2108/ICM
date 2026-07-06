import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { confirmEventTicketCheckIn, previewEventTicketCheck } from "@/lib/event-ticketing";

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const payload = (await request.json().catch(() => ({}))) as {
    action?: "preview" | "confirm";
    access?: string;
    ticketReference?: string;
    gateName?: string;
    method?: string;
    notes?: string;
  };

  if (!payload.ticketReference?.trim()) {
    return NextResponse.json({ error: "ticketReference is required" }, { status: 400 });
  }

  const requestMeta = {
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent")
  };

  try {
    if (payload.action === "confirm") {
      const result = await confirmEventTicketCheckIn({
        eventId: context.params.id,
        ticketReference: payload.ticketReference,
        organizerUserId: session?.user?.id ?? null,
        staffToken: payload.access,
        gateName: payload.gateName,
        method: payload.method,
        notes: payload.notes,
        requestMeta
      });
      return NextResponse.json({ ok: true, ...result }, { status: 200 });
    }

    const result = await previewEventTicketCheck({
      eventId: context.params.id,
      ticketReference: payload.ticketReference,
      organizerUserId: session?.user?.id ?? null,
      staffToken: payload.access,
      requestMeta
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check ticket" },
      { status: 400 }
    );
  }
}
