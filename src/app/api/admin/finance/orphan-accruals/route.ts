import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { cleanupOrphanAccruals, listOrphanAccruals } from "@/lib/finance-orphan-accruals";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const sources = await listOrphanAccruals(prisma);
  return NextResponse.json({ sources }, { status: 200 });
}

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const result = await cleanupOrphanAccruals(prisma);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось удалить начисления удалённых отчётов";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
