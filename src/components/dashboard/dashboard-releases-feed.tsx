"use client";

import { ReleaseRowCard } from "@/components/dashboard/release-row-card";
import { cabinetReleases } from "@/lib/cabinet-data";

export function DashboardReleasesFeed() {
  return (
    <div className="space-y-4">
      {cabinetReleases.map((release, index) => (
        <ReleaseRowCard key={release.id} release={release} index={index} />
      ))}
    </div>
  );
}
