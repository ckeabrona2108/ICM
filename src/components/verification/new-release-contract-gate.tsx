"use client";

import * as React from "react";

import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { ReleaseWizard } from "@/components/release-wizard/release-wizard";
import { useCurrentUser } from "@/components/user/user-provider";
import { VerificationAccessModal } from "@/components/verification/verification-access-modal";

export function NewReleaseContractGate({
  initialStatus
}: {
  initialStatus: ContractStatusPayload;
}) {
  const { user } = useCurrentUser();
  const effectiveStatus = user?.verification ?? initialStatus;
  const [modalOpen, setModalOpen] = React.useState(!effectiveStatus.canCreateRelease);

  React.useEffect(() => {
    setModalOpen(!effectiveStatus.canCreateRelease);
  }, [effectiveStatus.canCreateRelease, effectiveStatus.status, effectiveStatus.verificationId]);

  if (!effectiveStatus.canCreateRelease) {
    return (
      <>
        <div className="rounded-3xl border border-rose-300/18 bg-rose-500/8 p-6 text-white">
          <h1 className="text-[24px] font-semibold">Новый релиз недоступен</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/72">
            {effectiveStatus.reason}
          </p>
        </div>
        <VerificationAccessModal
          open={modalOpen}
          status={effectiveStatus}
          onClose={() => setModalOpen(false)}
        />
      </>
    );
  }

  return <ReleaseWizard key="release-wizard-new" submissionMode="new" />;
}
