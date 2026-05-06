"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { Button } from "@/components/ui/button";
import { ContractVerificationModal } from "@/components/verification/contract-verification-modal";

function getModalCopy(status: ContractStatusPayload) {
  if (status.status === "pending") {
    return {
      title: "Договор на проверке",
      text: "Договор подписан и ожидает проверки администратора. До подтверждения Вы не можете создавать и отправлять релизы.",
      primary: null,
      secondary: "Понятно"
    };
  }

  if (status.status === "rejected") {
    if (status.rejectionKind === "cancelled") {
      return {
        title: "Договор отменён администратором",
        text: "Администратор отменил ранее подтверждённый договор. Чтобы снова выпускать релизы, пройдите верификацию заново.",
        primary: "Пройти верификацию заново",
        secondary: "Позже"
      };
    }
    return {
      title: "Верификация отклонена",
      text: "Администратор отклонил вашу верификацию. Чтобы выпускать релизы, пройдите её заново.",
      primary: "Пройти верификацию заново",
      secondary: "Позже"
    };
  }

  if (status.status === "invalid_signature") {
    return {
      title: "Нужно подписать договор заново",
      text: "После переноса данных подпись не найдена. Чтобы администратор мог проверить договор, подпишите его повторно.",
      primary: "Подписать заново",
      secondary: "Позже"
    };
  }

  return {
    title: "Необходимо подписать договор",
    text: "Для выпуска релизов необходимо пройти верификацию и подписать договор. Если Вы уже подписывали договор ранее, пройдите процедуру заново.",
    primary: "Пройти верификацию",
    secondary: "Позже"
  };
}

export function VerificationAccessModal({
  open,
  status,
  onClose,
  forceOpenContract = false
}: {
  open: boolean;
  status: ContractStatusPayload;
  onClose: () => void;
  forceOpenContract?: boolean;
}) {
  const router = useRouter();
  const [contractOpen, setContractOpen] = React.useState(forceOpenContract);
  const copy = getModalCopy(status);

  React.useEffect(() => {
    setContractOpen(forceOpenContract);
  }, [forceOpenContract, status.status, status.verificationId]);

  const showContractAction =
    status.status === "not_signed" ||
    status.status === "rejected" ||
    status.status === "invalid_signature";

  return (
    <>
      {open && !contractOpen ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#04050b]/82 p-4 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-2xl border border-white/12 bg-[#11131b] p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.95)]">
            <h2 className="text-[24px] font-semibold text-white">{copy.title}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/72">{copy.text}</p>
            {status.rejectionReason ? (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-[14px] text-rose-100">
                Причина: {status.rejectionReason}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="h-11 rounded-lg px-5"
              >
                {copy.secondary}
              </Button>
              {showContractAction && copy.primary ? (
                <Button
                  type="button"
                  onClick={() => setContractOpen(true)}
                  className="h-11 rounded-lg px-5"
                >
                  {copy.primary}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <ContractVerificationModal
        open={contractOpen}
        mode="gate"
        onLater={() => {
          setContractOpen(false);
          onClose();
        }}
        onSigned={() => {
          setContractOpen(false);
          onClose();
          router.refresh();
        }}
      />
    </>
  );
}
