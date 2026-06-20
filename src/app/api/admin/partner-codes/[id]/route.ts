import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  PartnerCodeValidationError,
  type PartnerCodePatchInput,
  updatePartnerCode
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

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const id = context.params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Partner code id is required" }, { status: 400 });
  }

  const payload = (await request.json().catch(() => null)) as PartnerCodePatchInput | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await updatePartnerCode({
      prisma,
      id,
      input: payload
    });
    if (!item) {
      return NextResponse.json({ error: "Partner code not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    if (error instanceof PartnerCodeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to update partner code";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
