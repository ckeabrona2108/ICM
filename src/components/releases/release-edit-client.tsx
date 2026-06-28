"use client";

import * as React from "react";
import Link from "next/link";

import type {
  CancelModerationFailureResponse,
  CancelModerationRequest,
  CancelModerationSuccessResponse
} from "@/lib/api/contracts";
import { ReleaseWizard } from "@/components/release-wizard/release-wizard";
import type { CabinetRelease } from "@/lib/cabinet-types";
import { mapCabinetReleaseToWizardSeed } from "@/lib/map-cabinet-to-wizard-seed";
import { canEditRelease } from "@/lib/release-policy";
import { shouldResubmitEditedRelease } from "@/lib/release-wizard-mode";

export function ReleaseEditClient({ release }: { release: CabinetRelease }) {
  const seed = React.useMemo(() => mapCabinetReleaseToWizardSeed(release), [release]);
  const [cancelledModeration, setCancelledModeration] = React.useState(false);
  const [cancellingModeration, setCancellingModeration] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const effectiveStatus =
    cancelledModeration && release.status === "moderation"
      ? "changes_required"
      : release.status;
  const isDraftRelease = effectiveStatus === "draft";
  const willResubmitToModeration = shouldResubmitEditedRelease(effectiveStatus);

  const editPermission = React.useMemo(
    () =>
      cancelledModeration
        ? { allowed: true }
        : canEditRelease({
            status: release.status,
            moderationStarted: release.moderationStarted
          }),
    [cancelledModeration, release.moderationStarted, release.status]
  );

  const cancelModeration = React.useCallback(async () => {
    setCancellingModeration(true);
    setCancelError(null);

    try {
      const payload: CancelModerationRequest = {
        releaseId: release.id,
        currentStatus: release.status,
        moderationStarted: release.moderationStarted
      };

      const response = await fetch("/api/releases/moderation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => null)) as
          | CancelModerationFailureResponse
          | { error?: string }
          | null;

        if (parsed && "errors" in parsed && Array.isArray(parsed.errors)) {
          setCancelError(parsed.errors[0]?.message ?? "Не удалось отменить модерацию.");
        } else {
          const fallbackMessage =
            parsed && "error" in parsed ? parsed.error : undefined;
          setCancelError(fallbackMessage ?? "Не удалось отменить модерацию.");
        }
        return;
      }

      const parsed = (await response.json()) as CancelModerationSuccessResponse;
      if (parsed.ok) {
        setCancelledModeration(true);
        window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
      }
    } catch {
      setCancelError("Сервис модерации временно недоступен. Повторите позже.");
    } finally {
      setCancellingModeration(false);
    }
  }, [release.id, release.moderationStarted, release.status]);

  if (!editPermission.allowed) {
    return (
      <div className="pb-12 space-y-3">
        <div className="mb-5 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-4 py-3 text-[12.5px] leading-relaxed text-rose-100/95">
          <p>
            {editPermission.message ??
              "Редактирование релиза сейчас недоступно. Дождитесь завершения модерации."}
          </p>
          {editPermission.requiresCancellation ? (
            <p className="mt-2 text-rose-100/75">
              По памятке сначала отмените заявку в разделе{" "}
              <Link href="/dashboard/moderation" className="font-semibold underline-offset-2 hover:underline">
                Модерация
              </Link>
              , затем внесите правки.
            </p>
          ) : (
            <p className="mt-2 text-rose-100/75">
              После решения модератора релиз появится в разделе{" "}
              <Link href="/dashboard/changes-required" className="font-semibold underline-offset-2 hover:underline">
                Требуются изменения
              </Link>{" "}
              или в общем списке релизов.
            </p>
          )}
        </div>

        {editPermission.requiresCancellation ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[12.5px] text-amber-100/90">
            <p>
              Заявка ещё не взята модератором. Нажмите кнопку ниже, чтобы отменить модерацию и перейти к исправлениям.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void cancelModeration();
                }}
                disabled={cancellingModeration}
                className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-[12px] font-medium text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {cancellingModeration ? "Отменяем..." : "Отменить модерацию и редактировать"}
              </button>
              {cancelError ? <span className="text-rose-300">{cancelError}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pb-12">
      {release.status === "rejected" ? (
        <div className="mb-5 rounded-xl border border-rose-500/25 bg-rose-500/[0.10] px-4 py-3 text-[12.5px] leading-relaxed text-rose-100/95">
          <p className="font-medium">Релиз отклонён</p>
          <p className="mt-1">
            Причина: {release.rejectionReason || "Причина не указана модератором."}
          </p>
        </div>
      ) : null}
      {release.status === "changes_required" && release.rejectionReason ? (
        <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-[12.5px] leading-relaxed text-amber-100/95">
          <p className="font-medium">Релиз требует изменений</p>
          <p className="mt-1">Причина: {release.rejectionReason}</p>
        </div>
      ) : null}

      {(release.status === "changes_required" || release.status === "rejected") &&
      release.moderationRemarks?.length ? (
        <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-[12.5px] leading-relaxed text-amber-100/95">
          <p className="font-medium">Замечания модератора</p>
          {release.moderationReturnedAt ? (
            <p className="mt-1 text-amber-100/75">Возврат: {release.moderationReturnedAt}</p>
          ) : null}
          <ul className="mt-2 space-y-1 text-amber-100/85">
            {release.moderationRemarks.map((remark, index) => (
              <li key={`${remark.field}-${index}`}>
                • {remark.section ? `${remark.section}: ` : ""}
                {remark.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isDraftRelease && willResubmitToModeration ? (
        <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[12.5px] leading-relaxed text-amber-100/90">
          <p>
            После редактирования релиз будет повторно отправлен на модерацию. Пока проверка не
            завершена, итоговые изменения в каталоге считаются черновыми.
          </p>
        </div>
      ) : null}

      <ReleaseWizard
        key={`release-wizard-edit-${release.id}`}
        seed={seed}
        submissionMode="edit"
        pageTitle={isDraftRelease ? "Новый релиз" : "Редактирование релиза"}
        sourceReleaseId={release.id}
        currentStatus={effectiveStatus}
        moderationStarted={cancelledModeration ? false : release.moderationStarted}
      />
    </div>
  );
}
