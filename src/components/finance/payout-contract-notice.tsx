"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Clock3, FileSignature } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContractVerificationModal } from "@/components/verification/contract-verification-modal";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";

type NoticeCopy = { title: string; text: string; action: string | null; tone: "wait" | "sign" };

// What stands between the artist and a payout, by the state of their licence contract.
export function getPayoutContractCopy(status: ContractStatusPayload | null): NoticeCopy | null {
  switch (status?.status) {
    case "approved":
      return null;
    case "pending":
      return {
        title: "Договор на проверке",
        text: "Вы уже подписали лицензионный договор. Вывод станет доступен, как только мы его подтвердим.",
        action: null,
        tone: "wait"
      };
    case "rejected":
      return {
        title: status.rejectionKind === "cancelled" ? "Договор аннулирован" : "Договор не принят",
        text: `Чтобы вывести деньги, подпишите договор заново.${status.rejectionReason ? ` Причина: ${status.rejectionReason}` : ""}`,
        action: "Подписать заново",
        tone: "sign"
      };
    case "invalid_signature":
      return {
        title: "Нужно подписать договор заново",
        text: "Подпись под договором не найдена. Чтобы вывести деньги, подпишите его повторно.",
        action: "Подписать заново",
        tone: "sign"
      };
    case "update_required":
      return {
        title: "Договор обновлён",
        text: "Чтобы вывести деньги, подпишите новую версию лицензионного договора.",
        action: "Открыть новую версию",
        tone: "sign"
      };
    case "not_signed":
      return {
        title: "Подпишите лицензионный договор",
        text: "Деньги выводятся по лицензионному договору. Подпишите его — после проверки администратором вывод станет доступен.",
        action: "Подписать договор",
        tone: "sign"
      };
    default:
      return {
        title: "Не удалось проверить договор",
        text: "Обновите страницу через минуту. Если сообщение не пропадёт, напишите в поддержку.",
        action: null,
        tone: "wait"
      };
  }
}

export function PayoutContractNotice({ status }: { status: ContractStatusPayload | null }) {
  const router = useRouter();
  const [contractOpen, setContractOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const copy = getPayoutContractCopy(status);
  if (!copy) return null;
  const Icon = copy.tone === "wait" ? Clock3 : FileSignature;

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-300/25 bg-amber-400/[0.08] px-4 py-4 sm:px-5"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-200">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white">{copy.title}</p>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/65">{copy.text}</p>
        </div>
        {copy.action ? (
          <Button type="button" onClick={() => setContractOpen(true)} className="btn-shine shrink-0">
            <span>{copy.action}</span>
          </Button>
        ) : null}
      </div>
      {/* The finance tabs animate with a CSS filter, which would trap a fixed overlay inside the tab. */}
      {mounted ? createPortal(<ContractVerificationModal
        open={contractOpen}
        mode="gate"
        purpose="payout"
        onLater={() => setContractOpen(false)}
        onSigned={() => {
          setContractOpen(false);
          router.refresh();
        }}
        initialSignerData={status?.signerData ?? null}
      />, document.body) : null}
    </>
  );
}
