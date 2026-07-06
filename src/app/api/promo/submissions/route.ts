import { getServerSession } from "next-auth";
import { ZodError } from "zod";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createPromoSubmission,
  listPromoSubmissionsForUser,
  PromoValidationError,
  type PromoSubmissionCreateInput
} from "@/lib/promo-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await listPromoSubmissionsForUser(prisma, session.user.id);
  return NextResponse.json({ items }, { status: 200 });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await request.json().catch(() => null)) as PromoSubmissionCreateInput | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await createPromoSubmission({
      prisma,
      userId: session.user.id,
      input: payload
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Проверьте заполнение формы." },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to create promo submission";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
