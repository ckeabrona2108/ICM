"use client";

import * as React from "react";

import { useCurrentUser } from "@/components/user/user-provider";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { VerificationAccessModal } from "@/components/verification/verification-access-modal";

export function DashboardVerificationStatusModal({
  initialStatus
}: {
  initialStatus: ContractStatusPayload;
}) {
  const { user } = useCurrentUser();
  const effectiveStatus =
    initialStatus.status === "update_required" ? initialStatus : user?.verification ?? initialStatus;
  const shouldPrompt =
    effectiveStatus.status === "rejected" ||
    effectiveStatus.status === "invalid_signature" ||
    effectiveStatus.status === "update_required";
  const [warningOpen, setWarningOpen] = React.useState(shouldPrompt);

  React.useEffect(() => {
    setWarningOpen(
      effectiveStatus.status === "rejected" ||
        effectiveStatus.status === "invalid_signature" ||
        effectiveStatus.status === "update_required"
    );
  }, [effectiveStatus.rejectionReason, effectiveStatus.status, effectiveStatus.verificationId]);

  return (
    <VerificationAccessModal
      open={warningOpen}
      status={effectiveStatus}
      onClose={() => setWarningOpen(false)}
    />
  );
}
