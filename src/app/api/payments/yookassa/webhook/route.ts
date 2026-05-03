import { PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  getSubscriptionTariffConfig,
  type SubscriptionTariffConfig
} from "@/lib/subscription-billing";
import { applySubscriptionUpgrade } from "@/lib/subscription-limits";
import {
  getWebhookMetadata,
  getWebhookPaymentId,
  getWebhookStatus,
  parseYooKassaWebhookPayload
} from "@/lib/yookassa";

function mapWebhookStatus(status: "pending" | "waiting_for_capture" | "succeeded" | "canceled") {
  if (status === "waiting_for_capture") return PaymentStatus.WAITING_FOR_CAPTURE;
  if (status === "succeeded") return PaymentStatus.SUCCEEDED;
  if (status === "canceled") return PaymentStatus.CANCELED;
  return PaymentStatus.PENDING;
}

function resolveTariffFromPayment(params: {
  tariffIdFromMetadata?: string;
  tariffIdFromPayment: string;
}): SubscriptionTariffConfig | null {
  return (
    (params.tariffIdFromMetadata
      ? getSubscriptionTariffConfig(params.tariffIdFromMetadata)
      : null) ?? getSubscriptionTariffConfig(params.tariffIdFromPayment)
  );
}

export async function POST(request: Request) {
  const configuredSecret = process.env.YOOKASSA_WEBHOOK_SECRET?.trim();
  if (configuredSecret) {
    const url = new URL(request.url);
    const providedSecret = url.searchParams.get("secret")?.trim();
    if (!providedSecret || providedSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = parseYooKassaWebhookPayload(payloadRaw);
  if (!payload) {
    return NextResponse.json({ error: "Unsupported payload" }, { status: 400 });
  }

  const providerPaymentId = getWebhookPaymentId(payload);
  if (!providerPaymentId) {
    return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  }

  const payment = await prisma.subscriptionPayment.findFirst({
    where: { providerPaymentId },
    include: {
      subscription: true
    }
  });

  if (!payment) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const status = getWebhookStatus(payload);
  const metadata = getWebhookMetadata(payload);
  const paymentStatus = mapWebhookStatus(status);

  if (paymentStatus !== PaymentStatus.SUCCEEDED) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        metadata: {
          ...metadata,
          providerPaymentId
        }
      }
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (payment.status === PaymentStatus.SUCCEEDED) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const tariff = resolveTariffFromPayment({
    tariffIdFromMetadata:
      typeof metadata.tariffId === "string" ? metadata.tariffId : undefined,
    tariffIdFromPayment: payment.tariffId
  });

  if (!tariff) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        metadata: {
          ...metadata,
          error: "Unknown tariff in payment webhook"
        }
      }
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const subscription = await applySubscriptionUpgrade({
      tx,
      userId: payment.userId,
      plan: tariff.plan
    });

    const updatedPayment = await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date(),
        subscriptionId: subscription.id,
        metadata: {
          ...metadata,
          providerPaymentId
        }
      },
      select: { id: true }
    });

    return updatedPayment;
  });

  return NextResponse.json({ ok: true, paymentId: updated.id }, { status: 200 });
}
