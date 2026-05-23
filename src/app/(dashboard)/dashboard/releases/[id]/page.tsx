import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import * as React from "react";

import { authOptions } from "@/lib/auth";
import { getCabinetReleaseByIdForUser } from "@/lib/cabinet-release-queries";
import { StatusBadge } from "@/components/releases/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ReleaseModerationStepper } from "@/components/dashboard/release-moderation-stepper";
import { confirmYooKassaOrderAfterReturn } from "@/lib/payment-order-service";
import { prisma } from "@/lib/prisma";
import { getReleaseTimelineState } from "@/lib/release-timeline-state";

export const dynamic = "force-dynamic";

export default async function ReleaseDetailsPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { pay_order?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const payOrderId = searchParams?.pay_order?.trim();
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

  const release = await getCabinetReleaseByIdForUser(session.user.id, params.id);

  if (!release) {
    notFound();
  }
  const timeline = getReleaseTimelineState(release.status, release.paid);

  return (
    <div className="pb-8">
      <PageHeader
        title={release.title?.trim() || "Релиз"}
        description={`${release.artist?.trim() || "Исполнитель не указан"} · ${release.genre || "Жанр не указан"}`}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Информация о релизе</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row label="Status" value={<StatusBadge status={release.status} />} />
            <Row label="Оплата" value={release.paymentLabel || (release.paid ? "Оплачен" : "Не оплачен")} />
            {paymentResult?.applied ? (
              <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                Оплата подтверждена. Релиз отправлен на модерацию.
              </p>
            ) : paymentResult && paymentResult.status !== "already_confirmed" ? (
              <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-amber-100">
                Платёж ещё не подтверждён YooKassa. Если деньги списались, обновите страницу через несколько секунд.
              </p>
            ) : null}
            <div className="pt-2">
              <ReleaseModerationStepper steps={timeline.steps} activeIndex={timeline.activeIndex} />
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
