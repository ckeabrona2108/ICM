"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function AdminVerificationReviewActions({
  verificationId,
  status
}: {
  verificationId: string;
  status: "not_signed" | "pending" | "approved" | "rejected" | "invalid_signature";
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      const response = await fetch(`/api/admin/verification/${verificationId}/approve`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось подтвердить верификацию.");
      }
      router.refresh();
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Не удалось подтвердить верификацию."
      );
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError("Причина отклонения обязательна.");
      return;
    }

    setBusy("reject");
    setError(null);
    try {
      const response = await fetch(`/api/admin/verification/${verificationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: normalizedReason })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось отклонить верификацию.");
      }
      setRejectOpen(false);
      setReason("");
      router.refresh();
    } catch (rejectError) {
      setError(
        rejectError instanceof Error
          ? rejectError.message
          : "Не удалось отклонить верификацию."
      );
    } finally {
      setBusy(null);
    }
  }

  const canApprove = status === "pending";
  const canReject = status === "pending" || status === "approved";
  const rejectTitle = status === "approved" ? "Отменить договор" : "Отклонить верификацию";
  const rejectDescription =
    status === "approved"
      ? "Укажите причину отмены. Пользователь потеряет право выпускать релизы, пока не пройдет верификацию заново."
      : "Укажите причину. Она будет показана пользователю.";
  const rejectPlaceholder =
    status === "approved" ? "Причина отмены договора" : "Причина отклонения";
  const rejectButtonLabel = status === "approved" ? "Отменить договор" : "Отклонить";
  const rejectConfirmLabel =
    status === "approved" ? "Подтвердить отмену" : "Подтвердить отклонение";

  if (!canApprove && !canReject) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <Button
            type="button"
            onClick={() => void approve()}
            disabled={busy !== null}
            className="h-10 rounded-lg px-4"
          >
            {busy === "approve" ? "Подтверждаем..." : "Подтвердить"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRejectOpen(true);
            setError(null);
          }}
          disabled={busy !== null}
          className="h-10 rounded-lg border-rose-300/25 bg-rose-500/10 px-4 text-rose-100 hover:bg-rose-500/15 hover:text-white"
        >
          {rejectButtonLabel}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-300/30 bg-rose-500/12 px-3 py-2 text-[13px] text-rose-100">
          {error}
        </p>
      ) : null}

      {rejectOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11131b] p-5 shadow-2xl">
            <h3 className="text-[18px] font-semibold text-white">{rejectTitle}</h3>
            <p className="mt-2 text-[14px] text-white/65">{rejectDescription}</p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              className="mt-4 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none transition-colors focus:border-[#7b3df5]/50"
              placeholder={rejectPlaceholder}
            />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRejectOpen(false);
                  setReason("");
                  setError(null);
                }}
                className="h-10 rounded-lg px-4"
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => void reject()}
                disabled={busy !== null}
                className="h-10 rounded-lg bg-rose-500 px-4 text-white hover:bg-rose-400"
              >
                {busy === "reject" ? "Сохраняем..." : rejectConfirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
