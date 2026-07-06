import { NextResponse } from "next/server";

import { getPublicTicketCheckView } from "@/lib/event-ticketing";

export async function GET(request: Request, context: { params: { token: string } }) {
  const result = await getPublicTicketCheckView({
    publicToken: context.params.token,
    requestMeta: {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent")
    }
  });

  return NextResponse.json(result, { status: result.ticket ? 200 : 404 });
}
