import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { updateAdminSocialReportStatus } from "@/lib/admin-social-moderation-service";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statusSchema = z.object({
  status: z.enum(["pending", "reviewing", "resolved", "dismissed"])
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report status" }, { status: 400 });
  }

  try {
    const item = await updateAdminSocialReportStatus(prisma, context.params.id, parsed.data.status);
    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update report status";
    return NextResponse.json({ error: message }, { status: /not found|record/i.test(message) ? 404 : 400 });
  }
}
