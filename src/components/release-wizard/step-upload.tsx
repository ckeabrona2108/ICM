"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { useWizard } from "./wizard-context";
import { WizardCard } from "./wizard-ui";
import type { ReleaseSubmitSuccessResponse } from "@/lib/api/contracts";

export function StepUpload({
  submitResult
}: {
  submitResult?: ReleaseSubmitSuccessResponse | null;
}) {
  const { data, reset, submissionMode } = useWizard();
  const [progress, setProgress] = React.useState(0);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (done) return;
    if (progress >= 100) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => {
      setProgress((p) => Math.min(100, p + Math.random() * 18 + 6));
    }, 380);
    return () => clearTimeout(t);
  }, [progress, done]);

  return (
    <WizardCard className="text-center">
      {done ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 py-10"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h3 className="text-[18px] font-semibold text-white">
            {submitResult?.nextStatus === "pending_verification"
              ? "Релиз ожидает подтверждения верификации"
              : submissionMode === "edit"
                ? "Версия отправлена на модерацию"
                : "Релиз отправлен на модерацию"}
          </h3>
          <p className="max-w-md text-[13px] text-white/55">
            {submitResult?.message ? (
              submitResult.message
            ) : submissionMode === "edit" ? (
              <>
                Обновлённая копия «{data.title || "Без названия"}» ушла в очередь модерации. Черновик
                можно отслеживать в разделе «Черновики» до появления карточки в «Мои релизы».
              </>
            ) : (
              <>
                «{data.title || "Без названия"}» поставлен в очередь модерации. Среднее время проверки —
                до 12 часов. Уведомление придёт в раздел Новости.
              </>
            )}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Link
              href={
                submitResult?.nextStatus === "pending_verification"
                  ? "/dashboard/moderation"
                  : "/dashboard/releases"
              }
              className="rounded-lg bg-white/[0.06] px-4 py-2 text-[12.5px] text-white/85 transition-colors hover:bg-white/[0.10] hover:text-white"
            >
              {submitResult?.nextStatus === "pending_verification"
                ? "К ожидающим релизам"
                : "К моим релизам"}
            </Link>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-[#7b3df5] px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-[#8b4ff7]"
            >
              Создать ещё
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-10">
          <h3 className="text-[16px] font-semibold text-white">Загрузка релиза</h3>
          <p className="max-w-md text-[13px] text-white/55">
            Передаём данные релиза на наш сервер. Не закрывайте страницу до окончания загрузки.
          </p>

          <div className="relative h-2 w-full max-w-md overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#7b3df5] to-[#a78bfa]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span className="text-[12px] tabular-nums text-white/55">
            {Math.floor(progress)}%
          </span>
        </div>
      )}
    </WizardCard>
  );
}
