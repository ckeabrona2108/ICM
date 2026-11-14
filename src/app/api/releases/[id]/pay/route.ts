import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { settleOpenReleaseOrders } from "@/lib/release-payment-guard";
import { resolveReleaseAmountDue } from "@/lib/release-extras-supplement";
import { RELEASE_PRICING_TRACK_SELECT } from "@/lib/release-pricing";
import { createYooKassaPayment } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({
    key: `payment:create:${session.user.id}`,
    limit: 10,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const release = await prisma.release.findFirst({
    where: {
      id: releaseId,
      userId: session.user.id
    },
    select: { id: true, title: true, confirmed: true, roles: true, track: { select: RELEASE_PRICING_TRACK_SELECT } }
  });

  if (!release) {
    return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
  }

  // A paid release (including one sent back for changes or repeat moderation) is never charged again.
  if (release.confirmed) {
    return NextResponse.json({ ok: true, alreadyPaid: true }, { status: 200 });
  }

  const openPayment = await settleOpenReleaseOrders({ prisma, userId: session.user.id, releaseId });
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

  // A re-sent paid release only owes the extras added since its payment.
  const due = resolveReleaseAmountDue(release.roles, release.track);
  const amountRub = due.price.totalRub;
  if (amountRub <= 0) {
    return NextResponse.json({ error: "Сумма к оплате не найдена. Обновите страницу." }, { status: 409 });
  }
  const orderId = randomUUID();
  const returnUrl = `${getAppBaseUrl(request)}/dashboard/releases/${releaseId}?pay_order=${orderId}`;
  let payment;
  try {
    payment = await createYooKassaPayment({
      amountRub,
      description: due.supplement ? `Доплата за дополнения: ${release.title}` : `Оплата релиза: ${release.title}`,
      returnUrl,
      customerEmail: session.user.email,
      idempotenceKey: orderId,
      metadata: {
        orderId,
        kind: "release",
        releaseId,
        ...(due.supplement ? { extrasSupplement: "1" } : {}),
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
        amountRub,
        ...(due.supplement ? { extrasSupplement: true } : {}),
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
