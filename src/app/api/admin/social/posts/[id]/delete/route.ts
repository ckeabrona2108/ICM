import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { deleteAdminSocialPost } from "@/lib/admin-social-moderation-service";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const result = await deleteAdminSocialPost(prisma, context.params.id);
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete social post";
    return NextResponse.json({ error: message }, { status: /not found|record/i.test(message) ? 404 : 400 });
  }
}
