"use client";

import type { ContractSignatureStatus } from "@/lib/contract-verification-shared";
import { getVerificationStatusMeta } from "@/lib/verification-status-ui";

export function VerificationStatusBadge({
  status,
  className = ""
}: {
  status: ContractSignatureStatus;
  className?: string;
}) {
  const meta = getVerificationStatusMeta(status);

  return (
    <span
      title={meta.tooltip}
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.className} ${className}`.trim()}
    >
      {meta.label}
    </span>
  );
}
