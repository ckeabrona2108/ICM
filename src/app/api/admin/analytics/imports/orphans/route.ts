import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  cleanupOrphanedAnalyticsSources,
  listOrphanedAnalyticsSources
} from "@/lib/admin-analytics-service";
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

// Данные отчётов, у которых уже нет записи об импорте (остались после старого удаления).
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const orphans = await listOrphanedAnalyticsSources({ prisma });
  return NextResponse.json({ orphans }, { status: 200 });
}

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const result = await cleanupOrphanedAnalyticsSources({ prisma });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось очистить данные удалённых отчётов";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
