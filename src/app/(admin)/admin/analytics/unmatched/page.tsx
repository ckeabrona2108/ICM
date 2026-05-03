import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AdminAnalyticsUnmatchedClient } from "@/components/admin/admin-analytics-unmatched-client";
import { authOptions } from "@/lib/auth";
import { listAnalyticsReleaseOptions } from "@/lib/admin-analytics-service";
import { prisma } from "@/lib/prisma";

export default async function AdminAnalyticsUnmatchedPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const releaseOptions = await listAnalyticsReleaseOptions(prisma, 1500);

  return <AdminAnalyticsUnmatchedClient releaseOptions={releaseOptions} />;
}
