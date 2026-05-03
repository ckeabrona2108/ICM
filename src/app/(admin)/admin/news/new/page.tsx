import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AdminNewsForm } from "@/components/admin/admin-news-form";
import { authOptions } from "@/lib/auth";

export default async function AdminCreateNewsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return <AdminNewsForm />;
}
