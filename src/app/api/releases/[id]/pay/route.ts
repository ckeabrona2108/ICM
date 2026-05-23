import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createYooKassaPayment } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

const RELEASE_PAYMENT_AMOUNT_RUB = 350;

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const release = await prisma.release.findFirst({
    where: {
      id: releaseId,
      userId: session.user.id
    },
    select: { id: true, title: true }
  });

  if (!release) {
    return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
  }

  const orderId = randomUUID();
  const returnUrl = `${getAppBaseUrl(request)}/dashboard/releases/${releaseId}?pay_order=${orderId}`;
  let payment;
  try {
    payment = await createYooKassaPayment({
      amountRub: RELEASE_PAYMENT_AMOUNT_RUB,
      description: `Оплата релиза: ${release.title}`,
      returnUrl,
      customerEmail: session.user.email,
      idempotenceKey: orderId,
      metadata: {
        orderId,
        kind: "release",
        releaseId,
        userId: session.user.id
      }
    });
  } catch (error) {
    console.error("[release:pay] failed to create payment", error);
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
      type: "release",
      confirmed: false,
      metadata: {
        releaseId,
        providerPaymentId: payment.providerPaymentId,
        returnUrl
      }
    }
  });

  return NextResponse.json(
    {
      ok: true,
      orderId,
      providerPaymentId: payment.providerPaymentId,
      confirmationUrl: payment.confirmationUrl
    },
    { status: 200 }
  );
}
