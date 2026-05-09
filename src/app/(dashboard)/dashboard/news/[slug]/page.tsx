import { DashboardShell } from "@/components/layout/dashboard-shell";
import { NewsDetailClient } from "@/components/news/news-detail-client";

export default function DashboardNewsDetailsPage({ params }: { params: { slug: string } }) {
  return (
    <DashboardShell>
      <main className="mx-auto w-full max-w-4xl px-1 py-2 sm:px-0">
        <NewsDetailClient slug={params.slug} backHref="/dashboard" backLabel="К новостям" />
      </main>
    </DashboardShell>
  );
}
