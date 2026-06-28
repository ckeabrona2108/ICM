import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  aiTokenPurchaseRequestSchema,
  listAiTokenPackages
} from "@/lib/ai-token-service";
import { prisma } from "@/lib/prisma";
import { createYooKassaPayment } from "@/lib/yookassa";

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
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

  const parsed = aiTokenPurchaseRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
  }

  const packages = await listAiTokenPackages(prisma);
  const selectedPackage = packages.find((item) => item.code === parsed.data.packageCode);
  if (!selectedPackage) {
    return NextResponse.json({ error: "Пакет токенов не найден." }, { status: 404 });
  }

  const orderId = randomUUID();
  const baseUrl = getAppBaseUrl(request);
  const safeReturnPath =
    parsed.data.returnPath && /^\/dashboard\/ai-studio(?:\/[a-z-]+)?(?:\?.*)?$/u.test(parsed.data.returnPath)
      ? parsed.data.returnPath
      : "/dashboard/ai-studio/image";
  const returnUrl = `${baseUrl}${safeReturnPath}${safeReturnPath.includes("?") ? "&" : "?"}pay_order=${orderId}`;

  let payment;
  try {
    payment = await createYooKassaPayment({
      amountRub: selectedPackage.priceRub,
      description: `Пополнение AI-токенов: ${selectedPackage.name}`,
      returnUrl,
      customerEmail: session.user.email,
      idempotenceKey: orderId,
      metadata: {
        orderId,
        purpose: "ai_tokens",
        packageCode: selectedPackage.code,
        userId: session.user.id
      }
    });
  } catch (error) {
    console.error("[ai-tokens:buy] failed to create payment", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Не удалось создать платёж в YooKassa: ${error.message}`
            : "Не удалось создать платёж в YooKassa. Проверьте настройки платёжного шлюза."
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
        purpose: "ai_tokens",
        packageCode: selectedPackage.code,
        packageName: selectedPackage.name,
        tokenAmount: selectedPackage.tokenAmount,
        bonusTokens: selectedPackage.bonusTokens,
        amountRub: selectedPackage.priceRub,
        providerPaymentId: payment.providerPaymentId,
        returnUrl
      }
    }
  });

  return NextResponse.json({
    ok: true,
    paymentId: orderId,
    providerPaymentId: payment.providerPaymentId,
    confirmationUrl: payment.confirmationUrl
  });
}
