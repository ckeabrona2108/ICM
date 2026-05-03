"use client";

import * as React from "react";

import { getCachedRequest } from "@/lib/client-request-cache";
import { useWizard } from "./wizard-context";
import { Checkbox, DateInput, FieldLabel, TextArea, WizardCard } from "./wizard-ui";

export function StepExtras() {
  const { data, set } = useWizard();
  const [plan, setPlan] = React.useState<string>("STANDARD");

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await getCachedRequest(
          "subscription:overview",
          60_000,
          async () => {
            const response = await fetch("/api/subscription", { method: "GET" });
            const parsed = (await response.json().catch(() => null)) as
              | {
                  current_plan?: string | null;
                  plan?: string;
                  subscription?: { currentPlan?: string | null; plan?: string };
                }
              | null;
            if (!response.ok) {
              return null;
            }
            return parsed;
          }
        );
        const nextPlan =
          payload?.current_plan ??
          payload?.subscription?.currentPlan ??
          payload?.plan ??
          payload?.subscription?.plan;
        if (!nextPlan) return;
        if (!cancelled) setPlan(String(nextPlan).toUpperCase());
      } catch {
        // ignore and keep default
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const canUsePriority = plan === "PRO" || plan === "ENTERPRISE";

  return (
    <div className="space-y-4">
      <WizardCard title="Дополнительные настройки">
        <div className="space-y-4">
          <Checkbox
            checked={data.earlyRussiaStart}
            onChange={(v) => set("earlyRussiaStart", v)}
            label="Ранний старт в России"
            description="Релиз откроется в России на день раньше всех остальных стран. Это позволит избежать раннего открытия релиза на других территориях из-за разницы в часовых поясах."
          />

          <Checkbox
            checked={data.realTimeDelivery}
            onChange={(v) => set("realTimeDelivery", v)}
            label="Доставка в реальном времени"
            description="Релиз будет доставлен на площадки сразу после прохождения модерации."
          />

          <div
            className={`rounded-xl p-3 ${
              canUsePriority
                ? "border border-emerald-400/30 bg-emerald-500/10"
                : "border border-white/[0.10] bg-white/[0.03]"
            }`}
            title={
              canUsePriority
                ? "Ваш релиз будет обработан быстрее"
                : "Приоритетный релиз доступен на тарифе PRO и выше"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p
                  className={`text-[13px] font-semibold ${
                    canUsePriority ? "text-emerald-100" : "text-white/85"
                  }`}
                >
                  Приоритетный релиз
                </p>
                <p
                  className={`mt-1 text-[12px] ${
                    canUsePriority ? "text-emerald-100/80" : "text-white/60"
                  }`}
                >
                  {canUsePriority
                    ? "Ваш релиз будет обработан быстрее."
                    : "Приоритетный релиз доступен на тарифе PRO и выше"}
                </p>
              </div>
              <button
                type="button"
                disabled={!canUsePriority}
                onClick={() => {
                  if (!canUsePriority) return;
                  set("priorityRelease", !data.priorityRelease);
                }}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                  canUsePriority
                    ? data.priorityRelease
                      ? "bg-emerald-500 text-white"
                      : "border border-emerald-300/40 bg-transparent text-emerald-100"
                    : "cursor-not-allowed border border-white/[0.12] bg-white/[0.03] text-white/45"
                }`}
                title={
                  canUsePriority
                    ? "Ваш релиз будет обработан быстрее"
                    : "Приоритетный релиз доступен на тарифе PRO и выше"
                }
              >
                {data.priorityRelease ? "Включено" : "Включить"}
              </button>
            </div>
          </div>
        </div>
      </WizardCard>

      <WizardCard>
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[18px] font-semibold tracking-tight text-[#ffcc00]">
            Яндекс
          </span>
          <span className="text-[18px] font-semibold tracking-tight text-white">
            ✦ Музыка
          </span>
        </div>

        <FieldLabel>Скоро новый релиз</FieldLabel>
        <DateInput
          value={data.yandexPreReleaseDate}
          onChange={(value) => set("yandexPreReleaseDate", value)}
          className="max-w-xs"
        />
        <p className="mt-3 text-[12px] leading-relaxed text-white/45">
          Функция, с помощью которой слушатель сохраняет в свою коллекцию релиз до его открытия на
          Яндекс Музыке. Вы можете подготовить аудиторию к выходу сингла или альбома, а также
          привлечь новых поклонников. По памятке дата должна быть ровно за 7 дней до даты старта.
        </p>
      </WizardCard>

      <WizardCard title="Комментарий для модератора">
        <FieldLabel>Комментарий</FieldLabel>
        <TextArea
          value={data.moderatorComment}
          onChange={(e) => set("moderatorComment", e.target.value)}
          placeholder="Оставьте свой комментарий для модератора"
          className="min-h-[110px]"
        />
      </WizardCard>
    </div>
  );
}
