import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { AdminAnalyticsImportDetails } from "@/components/admin/admin-analytics-import-details";
import { authOptions } from "@/lib/auth";
import { getAnalyticsImportJobDetails } from "@/lib/admin-analytics-service";
import { prisma } from "@/lib/prisma";

export default async function AdminAnalyticsImportDetailsPage({
  params
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const details = await getAnalyticsImportJobDetails({
    prisma,
    jobId: params.id
  });

  if (!details) notFound();

  return <AdminAnalyticsImportDetails details={details} />;
}
