import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type * as React from "react";

import { authOptions } from "@/lib/auth";

export default async function AdminUsersLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/admin");
  }

  return children;
}
