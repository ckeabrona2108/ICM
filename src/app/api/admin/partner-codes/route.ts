import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  createPartnerCode,
  listPartnerCodes,
  PartnerCodeValidationError,
  type PartnerCodeUpsertInput
} from "@/lib/partner-codes";
import { prisma } from "@/lib/prisma";

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

  const items = await listPartnerCodes(prisma);
  return NextResponse.json({ items }, { status: 200 });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => null)) as PartnerCodeUpsertInput | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await createPartnerCode({
      prisma,
      adminId: auth.session.user.id,
      input: payload
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerCodeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to create partner code";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
