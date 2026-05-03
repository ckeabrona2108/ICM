import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AdminAnalyticsClient } from "@/components/admin/admin-analytics-client";
import { authOptions } from "@/lib/auth";

export default async function AdminAnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Analytics Imports</h1>
      <p className="mt-2 max-w-3xl text-[14px] text-white/65">
        Импорт rolling CSV отчётов агрегатора, контроль matched/unmatched и пересчёт summary.
      </p>

      <div className="mt-6">
        <AdminAnalyticsClient />
      </div>
    </div>
  );
}
