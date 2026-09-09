"use client";

import * as React from "react";

import { InfoTooltip, RadioPill, WizardCard } from "./wizard-ui";
import { useWizard, type ReleaseKind, type ReleaseType } from "./wizard-context";

const TYPE_OPTIONS: Array<{ value: ReleaseType; label: string; tooltip: string }> = [
  {
    value: "single",
    label: "Single",
    tooltip: "Содержит от 1 до 3 треков, каждый продолжительностью менее 10 минут"
  },
  {
    value: "ep",
    label: "EP",
    tooltip:
      "Содержит от 1 до 3 треков, один из которых длится не менее 10 минут, а общая продолжительность составляет 30 минут или менее. Также релиз может содержать от 4 до 6 треков общей продолжительностью не более 30 минут"
  },
  {
    value: "album",
    label: "Album",
    tooltip: "Содержит 7 треков и/или более, общей продолжительностью более 30 минут"
  }
];

export function StepIntro() {
  const { data, set } = useWizard();

  React.useEffect(() => {
    if (data.releaseKind === "single_maxi") {
      set("releaseKind", "standard" as ReleaseKind);
    }
  }, [data.releaseKind, set]);

  return (
    <div className="space-y-5">
      <WizardCard className="overflow-hidden px-0 py-0">
        <div className="px-7 py-7 sm:px-9 sm:py-8">
          <section className="space-y-6">
            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/45">
                Шаг 1
              </p>
              <h2 className="text-[30px] font-black tracking-[-0.03em] text-white sm:text-[34px]">
                Что загружаем?
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {TYPE_OPTIONS.map((opt) => (
                <RadioPill
                  key={opt.value}
                  checked={data.type === opt.value}
                  onClick={() => {
                    set("type", opt.value);
                    set("releaseKind", "standard" as ReleaseKind);
                  }}
                  className="h-[88px] w-full px-5 py-3 text-[16px] font-semibold"
                  trailing={
                    <InfoTooltip
                      content={opt.tooltip}
                      ariaLabel={`Подробнее о формате ${opt.label}`}
                    />
                  }
                >
                  {opt.label}
                </RadioPill>
              ))}
            </div>

            <div className="rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.82),rgba(13,16,30,0.78))] p-5">
              <div className="space-y-0 divide-y divide-white/[0.06]">
                <div className="pb-4">
                  <h3 className="text-[18px] font-semibold text-white">Куда загружается релиз?</h3>
                  <p className="mt-2 max-w-3xl text-[13px] leading-6 text-white/72">
                    Apple Music, iTunes, Spotify, ВКонтакте, Boom, Яндекс Музыка, Tik-Tok,
                    YouTube, Content ID, Deezer, Shazam, СберЗвук и другие.
                  </p>
                </div>
                <div className="py-4">
                  <h3 className="text-[18px] font-semibold text-white">В каком виде статистика?</h3>
                  <p className="mt-2 max-w-3xl text-[13px] leading-6 text-white/72">
                    В личном кабинете доступна ежедневная статистика по самым популярным
                    площадкам и детализация аудитории.
                  </p>
                </div>
                <div className="pt-4">
                  <h3 className="text-[18px] font-semibold text-white">Какие финансовые условия?</h3>
                  <p className="mt-2 max-w-3xl text-[13px] leading-6 text-white/72">
                    Вы будете получать 90% прибыли. Вывод средств доступен при накоплении
                    минимального баланса в 2000 рублей.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </WizardCard>
    </div>
  );
}
