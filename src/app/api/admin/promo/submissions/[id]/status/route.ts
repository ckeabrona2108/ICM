import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  promoSubmissionStatuses,
  PromoValidationError,
  type PromoSubmissionStatus,
  updatePromoSubmissionStatus
} from "@/lib/promo-service";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => null)) as { status?: string } | null;
  if (!payload?.status || !promoSubmissionStatuses.includes(payload.status as PromoSubmissionStatus)) {
    return NextResponse.json({ error: "Некорректный статус заявки." }, { status: 400 });
  }

  try {
    const item = await updatePromoSubmissionStatus({
      prisma,
      submissionId: context.params.id,
      adminId: auth.session.user.id,
      status: payload.status as PromoSubmissionStatus
    });
    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to update promo submission status";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
