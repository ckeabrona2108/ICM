import { PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionTariffConfig } from "@/lib/subscription-billing";
import { createYooKassaPayment } from "@/lib/yookassa";

const schema = z.object({
  tariffId: z.enum(["standard", "pro", "enterprise"]),
  returnUrl: z.string().trim().url().optional()
});

function resolveReturnUrl(input?: string): string {
  if (input) return input;
  const baseUrl = process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000";
  return `${baseUrl.replace(/\/$/u, "")}/dashboard/subscription?payment=return`;
}

function mapProviderStatus(status: "pending" | "waiting_for_capture" | "succeeded" | "canceled") {
  if (status === "waiting_for_capture") return PaymentStatus.WAITING_FOR_CAPTURE;
  if (status === "succeeded") return PaymentStatus.SUCCEEDED;
  if (status === "canceled") return PaymentStatus.CANCELED;
  return PaymentStatus.PENDING;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const tariff = getSubscriptionTariffConfig(parsed.data.tariffId);
  if (!tariff) {
    return NextResponse.json({ error: "Unknown tariff" }, { status: 422 });
  }

  const returnUrl = resolveReturnUrl(parsed.data.returnUrl);
  const idempotenceKey = randomUUID();

  const localPayment = await prisma.subscriptionPayment.create({
    data: {
      userId: session.user.id,
      tariffId: tariff.id,
      amount: new Prisma.Decimal(tariff.amountRub),
      currency: "RUB",
      provider: PaymentProvider.YOOKASSA,
      idempotenceKey,
      status: PaymentStatus.PENDING,
      returnUrl,
      description: `Подписка ICM: ${tariff.title}`,
      metadata: {
        tariffId: tariff.id
      }
    },
    select: {
      id: true
    }
  });

  try {
    const yookassaPayment = await createYooKassaPayment({
      amountRub: tariff.amountRub,
      description: `Подписка ICM: ${tariff.title}`,
      returnUrl,
      idempotenceKey,
      metadata: {
        userId: session.user.id,
        paymentId: localPayment.id,
        tariffId: tariff.id
      }
    });

    if (!yookassaPayment.confirmationUrl) {
      await prisma.subscriptionPayment.update({
        where: { id: localPayment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: yookassaPayment.providerPaymentId,
          metadata: {
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
          tariffId: tariff.id,
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
          tariffId: tariff.id,
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
