"use client";

import * as React from "react";

import { IcmTariffCard } from "@/components/tariffs/icm-tariff-card";
import { ICM_TARIFFS } from "@/lib/icm-tariffs";
import type {
  SubscriptionCheckoutRequest,
  SubscriptionCheckoutResponse
} from "@/lib/api/contracts";

type TariffId = "standard" | "pro" | "enterprise";

function resolveCtaLabel(params: {
  hasActiveSubscription: boolean;
  currentTariffId: TariffId | null;
  targetTariffId: TariffId;
}): string {
  const { hasActiveSubscription, currentTariffId, targetTariffId } = params;

  if (!hasActiveSubscription || !currentTariffId) {
    return "Подключить";
  }

  if (targetTariffId === currentTariffId) {
    return "Продлить";
  }

  if (targetTariffId === "standard") return "Перейти на STANDARD";
  if (targetTariffId === "pro") return "Перейти на PRO";
  return "Перейти на ENTERPRISE";
}

export function SubscriptionTiersClient({
  hasActiveSubscription,
  currentTariffId
}: {
  hasActiveSubscription: boolean;
  currentTariffId: TariffId | null;
}) {
  const [pendingTariffId, setPendingTariffId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const startCheckout = React.useCallback(async (tariffId: string) => {
    setError(null);
    setPendingTariffId(tariffId);

    try {
      const payload: SubscriptionCheckoutRequest = {
        tariffId: tariffId as "standard" | "pro" | "enterprise"
      };

      const response = await fetch("/api/subscription/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(parsed?.error ?? "Не удалось создать платеж.");
        return;
      }

      const parsed = (await response.json()) as SubscriptionCheckoutResponse;
      window.location.href = parsed.confirmationUrl;
    } catch {
      setError("Сервис оплаты временно недоступен. Повторите позже.");
    } finally {
      setPendingTariffId(null);
    }
  }, []);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        {ICM_TARIFFS.map((tier) => {
          const tariffId = tier.id as TariffId;
          const isCurrent = hasActiveSubscription && tariffId === currentTariffId;
          const ctaLabel = resolveCtaLabel({
            hasActiveSubscription,
            currentTariffId,
            targetTariffId: tariffId
          });
          return (
            <IcmTariffCard
              key={tier.id}
              tier={tier}
              ctaMode="dashboard"
              ctaLabel={ctaLabel}
              showTierBadge={false}
              showCurrentPlanBadge={isCurrent}
              ctaLoading={pendingTariffId === tier.id}
              onCtaClick={() => {
                void startCheckout(tier.id);
              }}
            />
          );
        })}
      </div>

      {error ? <p className="mt-4 text-center text-[12.5px] text-rose-300">{error}</p> : null}
    </>
  );
}
