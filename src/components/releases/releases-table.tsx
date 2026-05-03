import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/releases/status-badge";
import type { ReleaseItem } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";

interface ReleasesTableProps {
  data: ReleaseItem[];
}

export function ReleasesTable({ data }: ReleasesTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Release</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Release Date</TableHead>
            <TableHead>Streams</TableHead>
            <TableHead>Earnings</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((release) => (
            <TableRow key={release.id}>
              <TableCell>
                <p className="font-medium text-white">{release.title}</p>
                <p className="text-xs text-muted-foreground">
                  {release.genre} · {release.type.toUpperCase()}
                </p>
              </TableCell>
              <TableCell>
                <StatusBadge status={release.status} />
              </TableCell>
              <TableCell>{release.releaseDate}</TableCell>
              <TableCell>{formatNumber(release.streams)}</TableCell>
              <TableCell>{formatCurrency(release.earnings)}</TableCell>
              <TableCell className="text-right">
                <Link href={`/dashboard/releases/${release.id}`} className="text-cyan-300 hover:text-cyan-200">
                  Open
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
