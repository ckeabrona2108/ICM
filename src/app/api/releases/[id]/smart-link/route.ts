import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getSmartLinkOwnerView, updateSmartLinkOwnerSettings } from "@/lib/smart-link-service";

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  const data = await getSmartLinkOwnerView({
    userId: session.user.id,
    releaseId
  });
  if (!data) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  const payload = (await request.json().catch(() => null)) as Parameters<typeof updateSmartLinkOwnerSettings>[0]["input"] | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const data = await updateSmartLinkOwnerSettings({
      userId: session.user.id,
      releaseId,
      input: payload
    });
    if (!data) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "SLUG_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Этот slug уже занят." }, { status: 409 });
    }
    console.error("[smart-link:update] failed", error);
    return NextResponse.json({ error: "Не удалось сохранить Smart Link." }, { status: 500 });
  }
}
