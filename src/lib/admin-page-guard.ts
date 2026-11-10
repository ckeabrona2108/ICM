import { getServerSession, type Session } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export type AdminPageAccess = "ok" | "login" | "forbidden";

export function resolveAdminPageAccess(session: Pick<Session, "user"> | null | undefined): AdminPageAccess {
  if (!session?.user?.id) return "login";
  return session.user.role === "ADMIN" ? "ok" : "forbidden";
}

/**
 * Server-side admin check for every admin page that loads data.
 *
 * The admin layout checks the role too, but Next.js skips re-rendering a shared layout when the
 * client says it already has it (soft navigation, or a hand-crafted RSC request), so the page
 * itself must not rely on the layout alone.
 */
export async function requireAdminPage(): Promise<Session> {
  const session = await getServerSession(authOptions);
  const access = resolveAdminPageAccess(session);
  if (access === "login") redirect("/login");
  if (access === "forbidden") redirect("/dashboard");
  return session as Session;
}
