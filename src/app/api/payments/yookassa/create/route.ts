import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RELEASE_BASE_PRICE_RUB } from "@/lib/release-pricing";
import {
  getSubscriptionTariffConfig,
  normalizeSubscriptionBillingPeriod
} from "@/lib/subscription-billing";
import { priceWithReferralDiscount } from "@/lib/referrals";
import { createYooKassaPayment } from "@/lib/yookassa";
import { enforceRateLimit } from "@/lib/rate-limit";
import { startReleasePayment } from "@/lib/release-payment-start";

export const dynamic = "force-dynamic";

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({
    key: `payment:create:${session.user.id}`,
    limit: 10,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

  const payload = (await request.json().catch(() => ({}))) as {
    kind?: "release" | "subscription";
    releaseId?: string;
    tariffId?: "standard" | "pro" | "enterprise";
    billingPeriod?: "monthly" | "yearly";
    returnUrl?: string;
  };

  const kind = payload.kind === "subscription" ? "subscription" : "release";
  const orderId = randomUUID();
  const baseUrl = getAppBaseUrl(request);

  if (kind === "release" && !payload.releaseId?.trim()) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const returnUrl =
    payload.returnUrl ??
    (kind === "subscription"
      ? `${baseUrl}/dashboard/subscription?pay_order=${orderId}`
      : `${baseUrl}/dashboard/releases${payload.releaseId ? `/${payload.releaseId}` : ""}?pay_order=${orderId}`);

  let amountRub = RELEASE_BASE_PRICE_RUB;
  let description = "Оплата релиза ICECREAMMUSIC";
  const extrasSupplement = false;
  const billingPeriod = normalizeSubscriptionBillingPeriod(payload.billingPeriod);
  const subscriptionTariff =
    kind === "subscription"
      ? getSubscriptionTariffConfig(payload.tariffId ?? "standard", billingPeriod)
      : null;

  if (kind === "subscription") {
    if (!subscriptionTariff) {
      return NextResponse.json({ error: "Unknown tariff" }, { status: 400 });
    }
    amountRub = subscriptionTariff.amountRub;
    description = `Подписка ICECREAMMUSIC ${subscriptionTariff.title}`;
  } else if (payload.releaseId) {
    // Releases are paid through the same guarded flow as "Оплатить": one live payment per release.
    const releaseId = payload.releaseId.trim();
    const result = await startReleasePayment({
      prisma,
      userId: session.user.id,
      email: session.user.email ?? null,
      releaseId,
      returnUrlFor: (releaseOrderId) =>
        payload.returnUrl ?? `${baseUrl}/dashboard/releases/${releaseId}?pay_order=${releaseOrderId}`
    });
    if (result.kind === "already_paid") return NextResponse.json({ ok: true, alreadyPaid: true }, { status: 200 });
    if (result.kind === "error") return NextResponse.json(result.body, { status: result.status });
    return NextResponse.json(
      {
        ok: true,
        paymentId: result.orderId,
        providerPaymentId: result.providerPaymentId,
        confirmationUrl: result.confirmationUrl,
        ...(result.reused ? { reused: true } : {})
      },
      { status: 200 }
    );
  }

  // A friend invited by a link pays 20% less for their first payment.
  const priced = await priceWithReferralDiscount(prisma, {
    userId: session.user.id,
    amountRub,
    supplement: extrasSupplement
  });
  amountRub = priced.amountRub;

  let payment;
  try {
    payment = await createYooKassaPayment({
      amountRub,
      description,
      returnUrl,
      customerEmail: session.user.email,
      idempotenceKey: orderId,
      metadata: {
        orderId,
        kind,
        releaseId: payload.releaseId ?? "",
        tariffId: payload.tariffId ?? "",
        billingPeriod,
        userId: session.user.id
      }
    });
  } catch (error) {
    console.error("[payments:yookassa:create] failed to create payment", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Не удалось создать платёж в YooKassa: ${error.message}`
            : "Не удалось создать платёж в YooKassa. Проверьте настройки платежного шлюза."
      },
      { status: 502 }
    );
  }

  if (!payment.confirmationUrl) {
    return NextResponse.json({ error: "Платёжный шлюз не вернул ссылку на оплату." }, { status: 502 });
  }

  await prisma.orders.create({
    data: {
      id: orderId,
      userId: session.user.id,
      type: kind,
      confirmed: false,
      metadata: {
        releaseId: payload.releaseId ?? null,
        tariffId: payload.tariffId ?? null,
        billingPeriod: kind === "subscription" ? billingPeriod : null,
        tariffTitle: subscriptionTariff?.title ?? null,
        amountRub,
        ...(priced.discount
          ? { referralDiscountPercent: priced.discount.percent, fullAmountRub: priced.discount.fullAmountRub }
          : {}),
        ...(extrasSupplement ? { extrasSupplement: true } : {}),
        providerPaymentId: payment.providerPaymentId,
        returnUrl
      }
    }
  });

  return NextResponse.json(
    {
      ok: true,
      paymentId: orderId,
      providerPaymentId: payment.providerPaymentId,
      confirmationUrl: payment.confirmationUrl
    },
    { status: 200 }
  );
}
