import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AdminNewsClient } from "@/components/admin/admin-news-client";
import { authOptions } from "@/lib/auth";

export default async function AdminNewsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return <AdminNewsClient />;
}
