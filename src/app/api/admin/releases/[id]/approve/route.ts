import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approveReleaseByAdmin, canManageReleases } from "@/lib/admin-release-service";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageReleases(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const upc =
    payload && typeof payload === "object" && "upc" in payload
      ? String((payload as { upc?: unknown }).upc ?? "")
      : "";

  const approved = await approveReleaseByAdmin({
    prisma,
    adminId: session.user.id,
    releaseId,
    upc
  });
  if (!approved) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }
  if ("error" in approved) {
    if (approved.error === "UPC_ALREADY_EXISTS") {
      return NextResponse.json(
        { error: "UPC уже используется в другом релизе." },
        { status: 409 }
      );
    }
    if (approved.error === "STATUS_TRANSITION_NOT_ALLOWED") {
      return NextResponse.json(
        { error: "Релиз нельзя принять в текущем статусе." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: approved.error },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      releaseId,
      status: "approved",
      message: "Релиз принят."
    },
    { status: 200 }
  );
}
