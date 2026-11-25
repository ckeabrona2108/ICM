import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import * as React from "react";

import { authOptions } from "@/lib/auth";
import { getCabinetReleaseByIdForUser } from "@/lib/cabinet-release-queries";
import { ReleaseShareBadge } from "@/components/releases/release-share-badge";
import { ReferralDiscountNotice } from "@/components/referrals/referral-discount-notice";
import { getReferralDiscountPercent } from "@/lib/referrals";
import { StatusBadge } from "@/components/releases/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ModerationTimingNotice } from "@/components/dashboard/moderation-timing-notice";
import { ReleaseModerationStepper } from "@/components/dashboard/release-moderation-stepper";
import { confirmYooKassaOrderAfterReturn } from "@/lib/payment-order-service";
import { settleOpenReleaseOrders } from "@/lib/release-payment-guard";
import { prisma } from "@/lib/prisma";
import { resolveReleaseAmountDue } from "@/lib/release-extras-supplement";
import { RELEASE_PRICING_TRACK_SELECT } from "@/lib/release-pricing";
import { getReleaseTimelineState } from "@/lib/release-timeline-state";
import Link from "next/link";
import { ReleasePaymentPanel } from "@/components/releases/release-payment-panel";
import { describeYooKassaCancellation } from "@/lib/release-payment-followup";

export const dynamic = "force-dynamic";

export default async function ReleaseDetailsPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { pay_order?: string; submitted?: string; pay?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const payOrderId = searchParams?.pay_order?.trim();
  const wasJustSubmitted = searchParams?.submitted === "1";
  const paymentResult = payOrderId
    ? await confirmYooKassaOrderAfterReturn({
        prisma,
        userId: session.user.id,
        orderId: payOrderId
      }).catch((error) => {
        console.error("[releases:return] failed to confirm payment", error);
        return null;
      })
    : null;

  let release = await getCabinetReleaseByIdForUser(session.user.id, params.id);

  if (!release) {
    notFound();
  }
  // The artist may come back without the return link (closed tab, bank app) while the webhook is late:
  // settle a payment YooKassa already took before offering to pay again.
  if (!release.paid && release.status === "moderation" && !paymentResult?.applied) {
    const openPayment = await settleOpenReleaseOrders({
      prisma,
      userId: session.user.id,
      releaseId: params.id
    }).catch((error) => {
      console.error("[releases:return] failed to check open payments", error);
      return null;
    });
    if (openPayment?.state === "paid") {
      release = (await getCabinetReleaseByIdForUser(session.user.id, params.id)) ?? release;
    }
  }
  const timeline = getReleaseTimelineState(release.status, release.paid);
  const awaitingPayment = !release.paid && release.status === "moderation";
  // A re-sent paid release only owes the extras added since its payment.
  const amountDue = awaitingPayment
    ? await prisma.release
        .findFirst({
          where: { id: release.id, userId: session.user.id },
          select: { roles: true, track: { select: RELEASE_PRICING_TRACK_SELECT } }
        })
        .then((stored) => (stored ? resolveReleaseAmountDue(stored.roles, stored.track) : null))
    : null;
  const releasePrice = amountDue?.price ?? null;
  const referralDiscount =
    awaitingPayment && !amountDue?.supplement
      ? await getReferralDiscountPercent(prisma, session.user.id).catch(() => 0)
      : 0;
  const paymentReturnState =
    paymentResult?.status === "canceled"
      ? { kind: "failed" as const, message: describeYooKassaCancellation(paymentResult.cancellationReason) }
      : paymentResult && !paymentResult.applied && paymentResult.status !== "already_confirmed"
        ? { kind: "pending" as const }
        : { kind: "none" as const };

  return (
    <div className="pb-8">
      <PageHeader
        title={release.title?.trim() || "Релиз"}
        description={`${release.artist?.trim() || "Исполнитель не указан"} · ${release.genre || "Жанр не указан"}`}
        actions={
          <>
            <Link
              href={`/dashboard/releases/${params.id}/smart-link`}
              className="inline-flex h-10 items-center rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-medium text-white/82 transition hover:bg-white/[0.07]"
            >
              Smart Link
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Информация о релизе</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row label="Status" value={<StatusBadge status={release.status} paid={release.paid} />} />
            <Row label="Оплата" value={release.paymentLabel || (release.paid ? "Оплачен" : "Не оплачен")} />
            {release.status !== "draft" && release.share ? (
              <div className="rounded-xl border border-[#7b61ff]/45 bg-[#7b61ff]/10 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/80">Ваша доля дохода</span>
                  <ReleaseShareBadge share={release.share} short />
                </div>
                <p className="mt-1.5 text-[12.5px] leading-[1.5] text-white/55">
                  {release.share.hint}
                  {release.share.upsell ? (
                    <>
                      {" "}
                      <Link href="/dashboard/subscription" className="text-[#c4b5fd] hover:underline">
                        {release.share.upsell}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
            {paymentResult?.applied ? (
              <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                Оплата подтверждена. Релиз отправлен на модерацию.
              </p>
            ) : awaitingPayment ? (
              <>
              <ReferralDiscountNotice percent={referralDiscount} fullRub={releasePrice?.totalRub} what="первую оплату" />
              <ReleasePaymentPanel
                releaseId={release.id}
                price={releasePrice}
                supplement={Boolean(amountDue?.supplement)}
                autoStart={searchParams?.pay === "1" && !payOrderId}
                returnState={paymentReturnState}
              />
              </>
            ) : wasJustSubmitted ? (
              <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                Релиз отправлен на модерацию. Повторная отправка не требуется.
              </p>
            ) : null}
            <div className="pt-2">
              <ReleaseModerationStepper steps={timeline.steps} activeIndex={timeline.activeIndex} />
              {release.status === "moderation" && release.moderationStarted ? (
                <ModerationTimingNotice sentAt={release.moderationSentAt} />
              ) : null}
            </div>
            <Row label="Дата релиза" value={release.releaseDate} />
            <Row label="UPC" value={release.upc || "—"} />
            <Row label="Лейбл" value={release.label || "—"} />
            <Row label="Жанр" value={release.genre || "—"} />
            <Row label="Треков" value={String(release.tracks.length)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Дистрибуция</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Площадки" value={release.platforms || "—"} />
            <Row label="Территории" value={release.territories || "—"} />
            <Row label="Старт продаж" value={release.startDate || "—"} />
            <Row label="Pre-order" value={release.preorderDate || "—"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
