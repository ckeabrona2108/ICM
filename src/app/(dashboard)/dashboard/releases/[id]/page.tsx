import { notFound } from "next/navigation";
import * as React from "react";

import { StatusBadge } from "@/components/releases/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ReleaseModerationStepper } from "@/components/dashboard/release-moderation-stepper";
import { releases } from "@/lib/mock-data";
import { formatCurrency, formatNumber } from "@/lib/format";

export default function ReleaseDetailsPage({ params }: { params: { id: string } }) {
  const release = releases.find((item) => item.id === params.id);

  if (!release) {
    notFound();
  }

  return (
    <div className="pb-8">
      <PageHeader
        title={release.title}
        description={`${release.artist} · ${release.genre} · ${release.type.toUpperCase()}`}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Release Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row label="Status" value={<StatusBadge status={release.status} />} />
            {(release.status === "moderation" ||
              release.status === "approved" ||
              release.status === "distributed") && (
              <div className="pt-2">
                <ReleaseModerationStepper
                  currentStep={
                    release.status === "approved" || release.status === "distributed" ? 3 : 2
                  }
                />
              </div>
            )}
            <Row label="Release Date" value={release.releaseDate} />
            <Row label="Language" value={release.language} />
            <Row label="Streams" value={formatNumber(release.streams)} />
            <Row label="Earnings" value={formatCurrency(release.earnings)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {release.platforms.map((platform) => (
              <div key={platform.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <span>{platform.name}</span>
                <StatusBadge status={platform.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
