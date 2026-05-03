import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  adminUsersListQuerySchema,
  canManageUsers,
  listAdminUsers
} from "@/lib/admin-user-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = adminUsersListQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    subscription: url.searchParams.get("subscription") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    sortOrder: url.searchParams.get("sortOrder") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query params" },
      { status: 400 }
    );
  }

  const result = await listAdminUsers(prisma, parsed.data);
  return NextResponse.json(result, { status: 200 });
}
