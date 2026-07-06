import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deletePromoSubmissionForUser,
  getPromoSubmissionForUser,
  type PromoSubmissionCreateInput,
  PromoValidationError,
  updatePromoSubmissionForUser
} from "@/lib/promo-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await getPromoSubmissionForUser(prisma, session.user.id, context.params.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item }, { status: 200 });
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await request.json().catch(() => null)) as PromoSubmissionCreateInput | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const item = await updatePromoSubmissionForUser({
      prisma,
      userId: session.user.id,
      submissionId: context.params.id,
      input: payload
    });
    return NextResponse.json({ ok: true, item }, { status: 200 });
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
    const message = error instanceof Error ? error.message : "Failed to update promo submission";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await deletePromoSubmissionForUser({
      prisma,
      userId: session.user.id,
      submissionId: context.params.id
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to delete promo submission";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
