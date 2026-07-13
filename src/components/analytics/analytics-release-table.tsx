"use client";

import * as React from "react";

import type { AnalyticsReleaseListItemResponse } from "@/lib/api/contracts";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

function AnalyticsReleaseTableBase({
  releases,
  selectedReleaseId,
  onSelectRelease
}: {
  releases: AnalyticsReleaseListItemResponse[];
  selectedReleaseId: string;
  onSelectRelease: (releaseId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#13151d]/85 p-4 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[18px] font-semibold text-white">Релизы</h3>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Релиз</TableHead>
              <TableHead>UPC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {releases.map((release) => {
              const isActive = selectedReleaseId === release.release_id;
              return (
                <TableRow
                  key={release.release_id}
                  className={`${isActive ? "bg-white/[0.04]" : ""} cursor-pointer`}
                  onClick={() => onSelectRelease(release.release_id)}
                >
                  <TableCell>
                    <div className="font-medium text-white">{release.title}</div>
                  </TableCell>
                  <TableCell>{release.upc || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export const AnalyticsReleaseTable = React.memo(AnalyticsReleaseTableBase);
AnalyticsReleaseTable.displayName = "AnalyticsReleaseTable";
