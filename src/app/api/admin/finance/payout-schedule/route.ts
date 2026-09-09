import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  getCurrentPayoutWindowState,
  writePayoutScheduleSettings
} from "@/lib/payout-schedule";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const state = await getCurrentPayoutWindowState(prisma);
  return NextResponse.json({ state }, { status: 200 });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);

  try {
    const settings = await writePayoutScheduleSettings({
      prisma,
      adminId: auth.session.user.id,
      settings: payload
    });
    const state = await getCurrentPayoutWindowState(prisma);
    return NextResponse.json({ ok: true, settings, state }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить периоды выплат." },
      { status: 400 }
    );
  }
}
