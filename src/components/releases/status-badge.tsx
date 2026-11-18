import { Badge } from "@/components/ui/badge";
import { getStatusTone } from "@/lib/format";
import { getReleaseStatusDescriptor } from "@/lib/release-status-ui";

export function StatusBadge({ status, paid }: { status: string; paid?: boolean }) {
  const releaseStatus = getReleaseStatusDescriptor(status, paid);
  if (releaseStatus) {
    return <Badge variant={releaseStatus.variant}>{releaseStatus.label}</Badge>;
  }

  const tone = getStatusTone(status);

  if (tone === "success") return <Badge variant="success">{status}</Badge>;
  if (tone === "warning") return <Badge variant="warning">{status}</Badge>;
  if (tone === "danger") return <Badge variant="danger">{status}</Badge>;

  return <Badge variant="muted">{status}</Badge>;
}
