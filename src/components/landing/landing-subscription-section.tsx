"use client";

import * as React from "react";

import { Reveal } from "@/components/landing/reveal";
import { IcmTariffCard } from "@/components/tariffs/icm-tariff-card";
import { SubscriptionPeriodToggle } from "@/components/tariffs/subscription-period-toggle";
import { getIcmTariffs } from "@/lib/icm-tariffs";
import type { SubscriptionBillingPeriod } from "@/lib/subscription-billing";

export function LandingSubscriptionSection() {
  const [billingPeriod, setBillingPeriod] =
    React.useState<SubscriptionBillingPeriod>("yearly");
  const tiers = React.useMemo(() => getIcmTariffs(billingPeriod), [billingPeriod]);

  return (
    <section
      id="subscriptions"
      className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24"
    >
      <Reveal className="text-center">
        <span className="inline-flex items-center rounded-full border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#c4b5fd]">
          Тарифы
        </span>
        <h2 className="mt-4 text-[34px] font-bold tracking-tight sm:text-[42px] lg:text-[54px]">
          Выберите тариф под свой ритм релизов
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-[15px] leading-relaxed text-white/64 sm:text-[16px]">
          Переключайтесь между помесячной и годовой оплатой. При оплате за год цены ниже,
          а кнопки и состав тарифов остаются на своих местах.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mt-10 flex justify-center">
        <SubscriptionPeriodToggle value={billingPeriod} onChange={setBillingPeriod} />
      </Reveal>

      <Reveal delay={0.08} className="mt-10">
        <div className="grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <IcmTariffCard
              key={`${billingPeriod}-${tier.id}`}
              tier={tier}
              showTierBadge={false}
            />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
