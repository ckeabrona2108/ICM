"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { useWizard } from "./wizard-context";
import { WizardCard } from "./wizard-ui";
import type { ReleaseSubmitSuccessResponse } from "@/lib/api/contracts";

export function StepUpload({
  submitResult,
  progress,
  submitPhase
}: {
  submitResult?: ReleaseSubmitSuccessResponse | null;
  progress: number;
  submitPhase: "idle" | "uploading" | "saving" | "submitting";
}) {
  const { data, reset, submissionMode } = useWizard();
  const done = Boolean(submitResult);

  const sentToModeration =
    submitResult?.nextStatus === "moderation" ||
    submitResult?.nextStatus === "pending_verification";
  const title =
    submitResult?.nextStatus === "pending_verification"
      ? "Релиз ожидает подтверждения верификации"
      : sentToModeration
        ? submissionMode === "edit"
          ? "Версия отправлена на модерацию"
          : "Релиз отправлен на модерацию"
        : "Изменения сохранены";
  const description = submitResult?.message ? (
    submitResult.message
  ) : sentToModeration && submissionMode === "edit" ? (
    <>
      Обновлённая копия «{data.title || "Без названия"}» ушла в очередь модерации. Черновик можно
      отслеживать в разделе «Черновики» до появления карточки в «Мои релизы».
    </>
  ) : submissionMode === "edit" ? (
    <>Изменения для «{data.title || "Без названия"}» сохранены.</>
  ) : (
    <>
      «{data.title || "Без названия"}» поставлен в очередь модерации. Среднее время проверки — до 12
      часов. Уведомление придёт в раздел Новости.
    </>
  );

  return (
    <WizardCard className="text-center">
      {done ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 py-10"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--ux-accent)]/15 text-[#cfc4ff]">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h3 className="text-[18px] font-semibold text-[#f8f4ee]">{title}</h3>
          <p className="max-w-md text-[13px] text-[#948575]">{description}</p>
          <div className="mt-2 flex items-center gap-2">
            <Link
              href={
                submitResult?.nextStatus === "pending_verification"
                  ? "/dashboard/moderation"
                  : "/dashboard/releases"
              }
              className="rounded-[16px] bg-[#221b17] px-5 py-3 text-[12.5px] text-[#f5eee5] transition-colors hover:bg-[#241d19] hover:text-[#f8f4ee]"
            >
              {submitResult?.nextStatus === "pending_verification"
                ? "К ожидающим релизам"
                : "К моим релизам"}
            </Link>
            <button
              type="button"
              onClick={reset}
              className="rounded-[16px] bg-[var(--ux-accent)] px-5 py-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--ux-accent-strong)]"
            >
              Создать ещё
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-10">
          <h3 className="text-[16px] font-semibold text-[#f8f4ee]">Загрузка релиза</h3>
          <p className="max-w-md text-[13px] text-[#948575]">
            {submitPhase === "uploading"
              ? "Загружаем аудио и обложку в хранилище. Не закрывайте страницу до окончания загрузки."
              : submitPhase === "saving"
                ? "Файлы уже загружены. Сохраняем подготовленный черновик релиза."
                : "Файлы загружены. Отправляем релиз на сервер и завершаем публикацию."}
          </p>

          <div className="relative h-2 w-full max-w-md overflow-hidden rounded-full bg-[#1f1815]">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--ux-accent)] to-[#9b8cff]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span className="text-[12px] tabular-nums text-[#948575]">
            {Math.floor(progress)}%
          </span>
        </div>
      )}
    </WizardCard>
  );
}
