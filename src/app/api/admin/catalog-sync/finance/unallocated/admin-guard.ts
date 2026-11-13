import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";

/** Returns the admin id, or a response to send back when the caller is not an admin. */
export async function requireAdmin(): Promise<{ adminId: string } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { adminId: session.user.id };
}
