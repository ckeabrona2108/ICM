import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { SubscriptionCheckoutRequest, SubscriptionCheckoutResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createYooKassaPayment } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

const schema = z.object({
  tariffId: z.enum(["standard", "pro", "enterprise"]),
  returnUrl: z.string().url().optional()
});

const TARIFFS: Record<"standard" | "pro" | "enterprise", { title: string; amountRub: number }> = {
  standard: { title: "STANDART", amountRub: 350 },
  pro: { title: "PRO", amountRub: 990 },
  enterprise: { title: "ENTERPRISE", amountRub: 1990 }
};

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: SubscriptionCheckoutRequest;
  try {
    payload = (await request.json()) as SubscriptionCheckoutRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const orderId = randomUUID();
  const tariff = TARIFFS[parsed.data.tariffId];
  const returnUrl =
    parsed.data.returnUrl ?? `${getAppBaseUrl(request)}/dashboard/subscription?pay_order=${orderId}`;
  let payment;
  try {
    payment = await createYooKassaPayment({
      amountRub: tariff.amountRub,
      description: `Подписка ICECREAMMUSIC ${tariff.title}`,
      returnUrl,
      customerEmail: session.user.email,
      idempotenceKey: orderId,
      metadata: {
        orderId,
        kind: "subscription",
        tariffId: parsed.data.tariffId,
        userId: session.user.id
      }
    });
  } catch (error) {
    console.error("[subscription:upgrade] failed to create payment", error);
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
      type: "subscription",
      confirmed: false,
      metadata: {
        tariffId: parsed.data.tariffId,
        providerPaymentId: payment.providerPaymentId,
        returnUrl
      }
    }
  });

  const response: SubscriptionCheckoutResponse = {
    ok: true,
    paymentId: orderId,
    providerPaymentId: payment.providerPaymentId,
    confirmationUrl: payment.confirmationUrl
  };

  return NextResponse.json(response, { status: 200 });
}
