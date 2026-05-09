import { PaymentProvider, PaymentStatus, Prisma, ReleaseStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReleaseCreationLimit } from "@/lib/subscription-limits";
import { createYooKassaPayment } from "@/lib/yookassa";

const RELEASE_PAYMENT_TARIFF_ID = "release_payg";
const FALLBACK_RELEASE_PRICE_RUB = 350;

function resolveReturnUrl(releaseId: string): string {
  const baseUrl = process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000";
  const cleanBase = baseUrl.replace(/\/$/u, "");
  return `${cleanBase}/dashboard/moderation?payment=return&releaseId=${encodeURIComponent(releaseId)}`;
}

function mapProviderStatus(status: "pending" | "waiting_for_capture" | "succeeded" | "canceled") {
  if (status === "waiting_for_capture") return PaymentStatus.WAITING_FOR_CAPTURE;
  if (status === "succeeded") return PaymentStatus.SUCCEEDED;
  if (status === "canceled") return PaymentStatus.CANCELED;
  return PaymentStatus.PENDING;
}

function getReleasePaymentAmountFromLimitDecision(decision: {
  payAsYouGoPricing?: { release: number };
}) {
  const amount = decision.payAsYouGoPricing?.release;
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return amount;
  return FALLBACK_RELEASE_PRICE_RUB;
}

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  const release = await prisma.release.findFirst({
    where: {
      id: releaseId,
      userId: session.user.id
    },
    select: {
      id: true,
      userId: true,
      status: true,
      title: true
    }
  });

  if (!release) {
    return NextResponse.json({ error: "Релиз не найден." }, { status: 404 });
  }

  if (release.status !== ReleaseStatus.MODERATION) {
    return NextResponse.json(
      { error: "Оплата доступна только для релиза в статусе модерации." },
      { status: 409 }
    );
  }

  const existingSucceededPayments = await prisma.subscriptionPayment.findMany({
    where: {
      userId: session.user.id,
      status: PaymentStatus.SUCCEEDED,
      metadata: {
        path: ["kind"],
        equals: "release"
      }
    },
    select: {
      id: true,
      metadata: true
    },
  });

  const alreadyPaid = existingSucceededPayments.some((payment) => {
    if (!payment.metadata || typeof payment.metadata !== "object" || Array.isArray(payment.metadata)) {
      return false;
    }
    return (payment.metadata as Record<string, unknown>).releaseId === releaseId;
  });

  if (alreadyPaid) {
    return NextResponse.json(
      { error: "Этот релиз уже оплачен." },
      { status: 409 }
    );
  }

  const limitDecision = await checkReleaseCreationLimit(prisma, session.user.id);
  const amountRub = getReleasePaymentAmountFromLimitDecision(limitDecision);

  const returnUrl = resolveReturnUrl(release.id);
  const idempotenceKey = randomUUID();

  const localPayment = await prisma.subscriptionPayment.create({
    data: {
      userId: session.user.id,
      tariffId: RELEASE_PAYMENT_TARIFF_ID,
      amount: new Prisma.Decimal(amountRub),
      currency: "RUB",
      provider: PaymentProvider.YOOKASSA,
      idempotenceKey,
      status: PaymentStatus.PENDING,
      returnUrl,
      description: `Оплата релиза: ${release.title}`,
      metadata: {
        kind: "release",
        releaseId: release.id
      }
    },
    select: {
      id: true
    }
  });

  try {
    const yookassaPayment = await createYooKassaPayment({
      amountRub,
      description: `Оплата релиза: ${release.title}`,
      returnUrl,
      idempotenceKey,
      metadata: {
        kind: "release",
        userId: session.user.id,
        releaseId: release.id,
        paymentId: localPayment.id
      }
    });

    if (!yookassaPayment.confirmationUrl) {
      await prisma.subscriptionPayment.update({
        where: { id: localPayment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: yookassaPayment.providerPaymentId,
          metadata: {
            kind: "release",
            releaseId: release.id,
            error: "No confirmation_url returned by YooKassa"
          }
        }
      });
      return NextResponse.json(
        { error: "YooKassa did not return confirmation URL" },
        { status: 502 }
      );
    }

    await prisma.subscriptionPayment.update({
      where: { id: localPayment.id },
      data: {
        providerPaymentId: yookassaPayment.providerPaymentId,
        status: mapProviderStatus(yookassaPayment.status),
        confirmationUrl: yookassaPayment.confirmationUrl,
        expiresAt: yookassaPayment.expiresAt ? new Date(yookassaPayment.expiresAt) : null,
        metadata: {
          kind: "release",
          releaseId: release.id,
          providerPaymentId: yookassaPayment.providerPaymentId
        }
      }
    });

    return NextResponse.json(
      {
        ok: true,
        paymentId: localPayment.id,
        providerPaymentId: yookassaPayment.providerPaymentId,
        confirmationUrl: yookassaPayment.confirmationUrl
      },
      { status: 201 }
    );
  } catch (error) {
    await prisma.subscriptionPayment.update({
      where: { id: localPayment.id },
      data: {
        status: PaymentStatus.FAILED,
        metadata: {
          kind: "release",
          releaseId: release.id,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      }
    });

    return NextResponse.json(
      {
        error:
          "Не удалось создать платеж в ЮKassa. Проверьте настройки YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY."
      },
      { status: 502 }
    );
  }
}
