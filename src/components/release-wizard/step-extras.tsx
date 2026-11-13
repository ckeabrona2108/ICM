"use client";

import * as React from "react";
import Image from "next/image";

import { getCachedRequest } from "@/lib/client-request-cache";
import { cn } from "@/lib/utils";
import {
  defaultPreSaveDate,
  latestPreSaveDate,
  resolveVkStartDate,
  validatePreSaveDate
} from "@/lib/release-presave";

import { useWizard } from "./wizard-context";
import { Checkbox, DateInput, FieldLabel, Select, TextArea, WizardCard } from "./wizard-ui";

function formatRuDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex shrink-0 items-center gap-2.5 rounded-full text-[13px] font-medium text-white/80"
    >
      {label}
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-[3px] transition-colors",
          checked ? "bg-[var(--ux-accent)]" : "bg-white/[0.12]"
        )}
      >
        <span
          className={cn(
            "block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

function PlatformLogo({ src, alt, padded }: { src: string; alt: string; padded?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-white/[0.08]",
        padded && "bg-black p-2"
      )}
    >
      <Image src={src} alt={alt} width={44} height={44} className="h-full w-full object-contain" />
    </span>
  );
}

/** The same pre-save block for every platform: date field and the rule below it. */
function PreSaveSection({
  enabled,
  date,
  startDate,
  platform,
  onChange
}: {
  enabled: boolean;
  date: string;
  startDate: string;
  platform: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      {enabled ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <PreSaveDateField date={date} startDate={startDate} platform={platform} onChange={onChange} />
        </div>
      ) : null}
      <p className="text-[12px] leading-5 text-white/45">{PRE_SAVE_HINT}</p>
    </div>
  );
}

/** One delivery platform: name, short note, pre-save switch on the right, fields below. */
function PlatformCard({
  anchor,
  mark,
  name,
  note,
  preSave,
  onPreSaveChange,
  children
}: {
  anchor: string;
  mark: React.ReactNode;
  name: string;
  note: string;
  preSave: boolean;
  onPreSaveChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div data-wizard-anchor={anchor}>
      <WizardCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {mark}
            <div className="min-w-0">
              <p className="text-[17px] font-semibold tracking-[-0.02em] text-white">{name}</p>
              <p className="mt-0.5 text-[12.5px] text-white/50">{note}</p>
            </div>
          </div>
          <Switch checked={preSave} onChange={onPreSaveChange} label="Pre-save" />
        </div>
        <div className="mt-5 border-t border-white/[0.06] pt-5">{children}</div>
      </WizardCard>
    </div>
  );
}

/** Pre-save date field: 7 days before the start by default, at the latest 2 days before. */
function PreSaveDateField({
  date,
  startDate,
  platform,
  onChange
}: {
  date: string;
  startDate: string;
  platform: string;
  onChange: (value: string) => void;
}) {
  if (!startDate) {
    return (
      <p className="text-[12.5px] leading-5 text-amber-100/80">
        Сначала укажите дату старта на шаге «Коды и даты релиза»: дата pre-save считается от неё.
      </p>
    );
  }
  const latest = latestPreSaveDate(startDate);
  const error = date ? validatePreSaveDate({ preSaveDate: date, startDate, platform }) : null;
  return (
    <div className="min-w-0">
      <FieldLabel>Дата pre-save</FieldLabel>
      <DateInput value={date} onChange={onChange} max={latest || undefined} className="justify-start" />
      {error ? (
        <p className="mt-2 text-[12px] text-rose-300">{error}</p>
      ) : (
        <p className="mt-2 text-[11.5px] leading-5 text-white/40">Не позднее {formatRuDate(latest)}</p>
      )}
    </div>
  );
}

const PRE_SAVE_HINT =
  "Pre-save: слушатели сохраняют релиз в коллекцию до выхода. Дата ставится за 7 дней до старта, её можно сдвинуть, но не позднее чем за 2 дня до старта. Если дата старта изменится, дата pre-save пересчитается.";

const VK_START_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);

export function StepExtras() {
  const { data, set } = useWizard();
  const vkStart = resolveVkStartDate(data);
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

      <PlatformCard
        anchor="extras-yandex"
        mark={<PlatformLogo src="/landing/platforms/yandex-music.png" alt="Яндекс Музыка" padded />}
        name="Яндекс Музыка"
        note="Старт вместе с релизом"
        preSave={Boolean(data.yandexPreReleaseDate)}
        // Without a start date the switch keeps a blank placeholder (trimmed away on save);
        // the date is filled in as soon as the start date is set.
        onPreSaveChange={(enabled) =>
          set("yandexPreReleaseDate", enabled ? defaultPreSaveDate(data.startDate) || " " : "")
        }
      >
        <PreSaveSection
          enabled={Boolean(data.yandexPreReleaseDate)}
          date={data.yandexPreReleaseDate.trim()}
          startDate={data.startDate}
          platform="Яндекс Музыки"
          onChange={(value) => set("yandexPreReleaseDate", value)}
        />
      </PlatformCard>

      <PlatformCard
        anchor="extras-vk"
        mark={<PlatformLogo src="/landing/platforms/vk-music.png" alt="VK Музыка" />}
        name="VK Музыка, Одноклассники"
        note="Своя дата и час старта на площадках VK"
        preSave={data.vkPreSave}
        onPreSaveChange={(enabled) => {
          set("vkPreSave", enabled);
          if (enabled && !data.vkPreSaveDate) set("vkPreSaveDate", defaultPreSaveDate(vkStart));
        }}
      >
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel>Дата старта</FieldLabel>
            <div className="grid h-[52px] grid-cols-2 gap-1 rounded-[18px] border border-white/[0.08] bg-black/25 p-1">
              {[
                { custom: false, label: data.startDate ? `Как у релиза · ${formatRuDate(data.startDate)}` : "Как у релиза" },
                { custom: true, label: "Своя дата" }
              ].map((option) => {
                const active = Boolean(data.vkStartDate) === option.custom;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      set("vkStartDate", option.custom ? data.vkStartDate || data.startDate || " " : "")
                    }
                    className={cn(
                      "truncate rounded-[14px] px-2 text-[12.5px] font-medium transition-colors",
                      active
                        ? "bg-[var(--ux-accent)] text-white shadow-sm"
                        : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {data.vkStartDate ? (
              <div className="mt-2">
                <DateInput
                  value={data.vkStartDate.trim()}
                  onChange={(value) => set("vkStartDate", value)}
                  className="justify-start"
                />
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            <FieldLabel>Час старта</FieldLabel>
            <Select
              value={data.vkStartTime || "00:00"}
              onChange={(value) => set("vkStartTime", value)}
              options={VK_START_HOURS}
            />
          </div>
        </div>
        <PreSaveSection
          enabled={data.vkPreSave}
          date={data.vkPreSaveDate}
          startDate={vkStart}
          platform="VK Музыки"
          onChange={(value) => set("vkPreSaveDate", value)}
        />
      </PlatformCard>

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
