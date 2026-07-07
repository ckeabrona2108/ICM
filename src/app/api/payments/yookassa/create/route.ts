import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createYooKassaPayment } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

const RELEASE_PAYMENT_AMOUNT_RUB = 350;

const TARIFFS: Record<"standard" | "pro" | "enterprise", { title: string; amountRub: number }> = {
  standard: { title: "STANDARD", amountRub: 550 },
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

  const payload = (await request.json().catch(() => ({}))) as {
    kind?: "release" | "subscription";
    releaseId?: string;
    tariffId?: "standard" | "pro" | "enterprise";
    returnUrl?: string;
  };

  const kind = payload.kind === "subscription" ? "subscription" : "release";
  const orderId = randomUUID();
  const baseUrl = getAppBaseUrl(request);

  if (kind === "release" && !payload.releaseId?.trim()) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  if (kind === "subscription" && payload.tariffId && !(payload.tariffId in TARIFFS)) {
    return NextResponse.json({ error: "Unknown tariff" }, { status: 400 });
  }

  const returnUrl =
    payload.returnUrl ??
    (kind === "subscription"
      ? `${baseUrl}/dashboard/subscription?pay_order=${orderId}`
      : `${baseUrl}/dashboard/releases${payload.releaseId ? `/${payload.releaseId}` : ""}?pay_order=${orderId}`);

  let amountRub = RELEASE_PAYMENT_AMOUNT_RUB;
  let description = "Оплата релиза ICECREAMMUSIC";

  if (kind === "subscription") {
    const tariffId = payload.tariffId ?? "standard";
    const tariff = TARIFFS[tariffId];
    amountRub = tariff.amountRub;
    description = `Подписка ICECREAMMUSIC ${tariff.title}`;
  } else if (payload.releaseId) {
    const release = await prisma.release.findFirst({
      where: {
        id: payload.releaseId,
        userId: session.user.id
      },
      select: {
        title: true
      }
    });

    if (!release) {
      return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
    }

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
