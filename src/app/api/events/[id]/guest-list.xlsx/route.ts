import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { buildEventGuestListWorkbook } from "@/lib/event-ticketing";

export async function GET(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workbook = await buildEventGuestListWorkbook({
      eventId: context.params.id,
      actorUserId: session.user.id,
      requestOrigin: new URL(request.url).origin
    });

    return new NextResponse(new Uint8Array(workbook.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(workbook.eventTitle)}-guest-list.xlsx"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export guest list" },
      { status: 400 }
    );
  }
}
