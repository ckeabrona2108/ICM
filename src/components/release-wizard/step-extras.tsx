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
    <div className="space-y-5">
      <div data-wizard-anchor="extras-general">
      <WizardCard title="Важная информация">
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
            className={`rounded-[22px] p-3 ${
              canUsePriority
                ? "border border-emerald-400/30 bg-emerald-500/10"
                : "border border-[var(--ux-accent)]/18 bg-[var(--ux-accent)]/[0.08]"
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
                    canUsePriority ? "text-emerald-100" : "text-white"
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
                className={`rounded-[16px] px-5 py-3.5 text-[12px] font-semibold transition ${
                  canUsePriority
                    ? data.priorityRelease
                      ? "bg-emerald-500 text-[#f8f4ee]"
                      : "border border-emerald-300/40 bg-transparent text-emerald-100"
                    : "cursor-not-allowed border border-[var(--ux-accent)]/18 bg-[var(--ux-accent)]/[0.04] text-white/42"
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
      </div>

      <div data-wizard-anchor="extras-yandex">
      <WizardCard>
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[18px] font-semibold tracking-tight text-[#ffcc00]">
            Яндекс
          </span>
          <span className="text-[18px] font-semibold tracking-tight text-[#f8f4ee]">
            ✦ Музыка
          </span>
        </div>

        <FieldLabel>Скоро новый релиз</FieldLabel>
        <DateInput
          value={data.yandexPreReleaseDate}
          onChange={(value) => set("yandexPreReleaseDate", value)}
          className="w-full sm:max-w-[240px]"
        />
        <p className="mt-3 text-[12px] leading-relaxed text-[#7d7268]">
          Функция, с помощью которой слушатель сохраняет в свою коллекцию релиз до его открытия на
          Яндекс Музыке. Вы можете подготовить аудиторию к выходу сингла или альбома, а также
          привлечь новых поклонников. По памятке дата должна быть ровно за 7 дней до даты старта.
        </p>
      </WizardCard>
      </div>

      <div data-wizard-anchor="extras-comment">
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
    </div>
  );
}
