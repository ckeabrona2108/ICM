import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateReleasePrice, RELEASE_BASE_PRICE_RUB, RELEASE_PRICING_TRACK_SELECT } from "@/lib/release-pricing";
import {
  getSubscriptionTariffConfig,
  normalizeSubscriptionBillingPeriod
} from "@/lib/subscription-billing";
import { createYooKassaPayment } from "@/lib/yookassa";
import { enforceRateLimit } from "@/lib/rate-limit";
import { settleOpenReleaseOrders } from "@/lib/release-payment-guard";

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
    const release = await prisma.release.findFirst({
      where: {
        id: payload.releaseId,
        userId: session.user.id
      },
      select: {
        title: true,
        confirmed: true,
        track: { select: RELEASE_PRICING_TRACK_SELECT }
      }
    });

    if (!release) {
      return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
    }

    if (release.confirmed) {
      return NextResponse.json({ ok: true, alreadyPaid: true }, { status: 200 });
    }
    const openPayment = await settleOpenReleaseOrders({
      prisma,
      userId: session.user.id,
      releaseId: payload.releaseId
    });
    if (openPayment === "paid") {
      return NextResponse.json({ ok: true, alreadyPaid: true }, { status: 200 });
    }
    if (openPayment === "processing") {
      return NextResponse.json(
        {
          processing: true,
          error: "Предыдущий платёж ещё обрабатывается банком. Подождите пару минут — статус обновится сам."
        },
        { status: 409 }
      );
    }

    amountRub = calculateReleasePrice(release.track).totalRub;
    description = `Оплата релиза: ${release.title}`;
  }

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
