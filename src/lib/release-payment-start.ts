import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { priceWithReferralDiscount } from "@/lib/referrals";
import { resolveReleaseAmountDue } from "@/lib/release-extras-supplement";
import { settleOpenReleaseOrders } from "@/lib/release-payment-guard";
import { RELEASE_PRICING_TRACK_SELECT } from "@/lib/release-pricing";
import { createYooKassaPayment } from "@/lib/yookassa";

export type StartReleasePaymentResult =
  | { kind: "already_paid" }
  | { kind: "error"; status: number; body: Record<string, unknown> }
  | { kind: "invoice"; orderId: string; providerPaymentId: string; confirmationUrl: string; reused: boolean };

const PROCESSING_MESSAGE = "Предыдущий платёж ещё обрабатывается банком. Подождите пару минут — статус обновится сам.";

/**
 * Opens the payment of a release for the artist. One at a time per release (an advisory lock held
 * until the order is saved): two tabs or a double click never start two payments. A payment
 * YooKassa already took is applied first; an invoice for the same sum still waiting for the payer
 * is opened again instead of a new one, so a release never has two live payments.
 */
export async function startReleasePayment(params: {
  prisma: PrismaClient;
  userId: string;
  email: string | null;
  releaseId: string;
  returnUrlFor: (orderId: string) => string;
}): Promise<StartReleasePaymentResult> {
  const { prisma, userId, releaseId } = params;
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`release-pay:${releaseId}`}, 0))`;
      const release = await tx.release.findFirst({
        where: { id: releaseId, userId },
        select: { id: true, title: true, confirmed: true, roles: true, track: { select: RELEASE_PRICING_TRACK_SELECT } }
      });
      if (!release) return { kind: "error", status: 404, body: { error: "Релиз не найден" } } as const;
      // A paid release (including one sent back for changes or repeat moderation) is never charged again.
      if (release.confirmed) return { kind: "already_paid" } as const;

      const openPayment = await settleOpenReleaseOrders({ prisma, userId, releaseId });
      if (openPayment.state === "paid") return { kind: "already_paid" } as const;

      // A re-sent paid release only owes the extras added since its payment.
      const due = resolveReleaseAmountDue(release.roles, release.track);
      const fullAmountRub = due.price.totalRub;
      if (fullAmountRub <= 0) {
        return { kind: "error", status: 409, body: { error: "Сумма к оплате не найдена. Обновите страницу." } } as const;
      }
      // A friend invited by a link pays 20% less for their first payment.
      const { amountRub, discount } = await priceWithReferralDiscount(prisma, {
        userId,
        amountRub: fullAmountRub,
        supplement: due.supplement
      });

      const reusable = openPayment.reusable;
      if (reusable && reusable.amountRub === amountRub) {
        return {
          kind: "invoice",
          orderId: reusable.orderId,
          providerPaymentId: reusable.providerPaymentId,
          confirmationUrl: reusable.confirmationUrl,
          reused: true
        } as const;
      }
      if (openPayment.state === "processing") {
        return { kind: "error", status: 409, body: { processing: true, error: PROCESSING_MESSAGE } } as const;
      }

      const orderId = randomUUID();
      const returnUrl = params.returnUrlFor(orderId);
      let payment;
      try {
        payment = await createYooKassaPayment({
          amountRub,
          description: due.supplement ? `Доплата за дополнения: ${release.title}` : `Оплата релиза: ${release.title}`,
          returnUrl,
          customerEmail: params.email,
          idempotenceKey: orderId,
          metadata: {
            orderId,
            kind: "release",
            releaseId,
            ...(due.supplement ? { extrasSupplement: "1" } : {}),
            userId
          }
        });
      } catch (error) {
        console.error("[release:pay] failed to create payment", error);
        return {
          kind: "error",
          status: 502,
          body: {
            error:
              error instanceof Error
                ? `Не удалось создать платёж в YooKassa: ${error.message}`
                : "Не удалось создать платёж в YooKassa. Проверьте настройки платежного шлюза."
          }
        } as const;
      }
      if (!payment.confirmationUrl) {
        return { kind: "error", status: 502, body: { error: "Платёжный шлюз не вернул ссылку на оплату." } } as const;
      }

      await tx.orders.create({
        data: {
          id: orderId,
          userId,
          type: "release",
          confirmed: false,
          metadata: {
            releaseId,
            amountRub,
            ...(discount ? { referralDiscountPercent: discount.percent, fullAmountRub: discount.fullAmountRub } : {}),
            ...(due.supplement ? { extrasSupplement: true } : {}),
            providerPaymentId: payment.providerPaymentId,
            confirmationUrl: payment.confirmationUrl,
            returnUrl
          }
        }
      });
      return {
        kind: "invoice",
        orderId,
        providerPaymentId: payment.providerPaymentId,
        confirmationUrl: payment.confirmationUrl,
        reused: false
      } as const;
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
}
