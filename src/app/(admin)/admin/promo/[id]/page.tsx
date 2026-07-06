import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";

import { AdminPromoSubmissionDetailClient } from "@/components/admin/admin-promo-submission-detail-client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminPromoSubmissionById, formatPromoSubmissionStatusLabel } from "@/lib/promo-service";

function DetailRow({ label, value }: { label: string; value: string | null | boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="mt-2 whitespace-pre-wrap text-sm font-medium text-white">{typeof value === "boolean" ? (value ? "Да" : "Нет") : value || "—"}</div>
    </div>
  );
}

export default async function AdminPromoSubmissionDetailsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const item = await getAdminPromoSubmissionById(prisma, params.id);
  if (!item) notFound();

  return (
    <div className="pb-10">
      <Link href="/admin/promo" className="text-sm font-semibold text-white/58 transition hover:text-white">← Назад к списку заявок</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">{item.releaseTitle}</h1>
          <p className="mt-2 text-[14px] text-white/65">{item.artistName} · UPC {item.upc} · {formatPromoSubmissionStatusLabel(item.status)}</p>
        </div>
      </div>

      <div className="mt-6">
        <AdminPromoSubmissionDetailClient initialItem={item} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <DetailRow label="Пользователь" value={`${item.userName} <${item.userEmail}>`} />
        <DetailRow label="Email заявки" value={item.email} />
        <DetailRow label="Партнёр" value={item.partnerName} />
        <DetailRow label="Артист" value={item.artistName} />
        <DetailRow label="Страна артиста" value={item.artistCountry} />
        <DetailRow label="Дата релиза" value={item.releaseDate} />
        <DetailRow label="Жанр" value={item.genre} />
        <DetailRow label="Формат" value={item.releaseFormat} />
        <DetailRow label="Язык релиза" value={item.releaseLanguage} />
        <DetailRow label="UPC" value={item.upc} />
        <DetailRow label="Ключевой трек" value={item.keyTrackTitle} />
        <DetailRow label="Лейбл" value={item.label} />
        <DetailRow label="Релиз выходит с клипом" value={item.hasMusicVideo} />
        <DetailRow label="Предпросмотр клипа" value={item.videoPreviewUrl} />
        <DetailRow label="Фото артиста" value={item.artistPhotoUrl} />
        <DetailRow label="Ссылка на прослушивание" value={item.listeningLink} />
        <DetailRow label="Соцсети артиста" value={item.artistSocialLinks} />
        <DetailRow label="Подтверждение" value={item.confirmationAccepted} />
        <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 xl:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Описание релиза и артиста</div>
          <div className="mt-2 whitespace-pre-wrap text-sm font-medium text-white">{item.releaseDescription}</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 xl:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">План продвижения</div>
          <div className="mt-2 whitespace-pre-wrap text-sm font-medium text-white">{item.promotionPlan}</div>
        </div>
      </div>
    </div>
  );
}
