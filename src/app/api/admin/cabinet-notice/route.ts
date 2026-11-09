import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { readCabinetNotice, writeCabinetNotice } from "@/lib/cabinet-notice";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ notice: await readCabinetNotice(prisma) });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  try {
    const notice = await writeCabinetNotice({ prisma, adminId: auth.session.user.id, notice: payload });
    return NextResponse.json({ notice });
  } catch (error) {
    console.error("[cabinet-notice] save failed", error);
    return NextResponse.json({ error: "Не удалось сохранить объявление." }, { status: 500 });
  }
}
