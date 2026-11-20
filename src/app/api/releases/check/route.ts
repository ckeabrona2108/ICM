import type { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReleaseOnServer, type ReleaseServerCheckRequest } from "@/lib/release-server-check";

export const dynamic = "force-dynamic";

/** Review-step re-check of the wizard data on the server. Saves nothing. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ReleaseServerCheckRequest;
  try {
    body = (await request.json()) as ReleaseServerCheckRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "data is required" }, { status: 400 });
  }

  try {
    const result = await checkReleaseOnServer({
      prisma: prisma as unknown as PrismaClient,
      userId: session.user.id,
      request: body
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[release-check] failed", error);
    return NextResponse.json({ error: "Сервер не смог проверить релиз. Попробуйте ещё раз." }, { status: 503 });
  }
}
