"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  promoSubmissionStatuses,
  type PromoSubmissionDetail,
  formatPromoSubmissionStatusLabel
} from "@/lib/promo-service";

const selectClassName =
  "block h-12 min-h-12 w-full appearance-none rounded-xl border border-white/[0.12] bg-black/25 px-4 py-0 text-[15px] font-medium leading-[1.2] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60";

export function AdminPromoSubmissionDetailClient({ initialItem }: { initialItem: PromoSubmissionDetail }) {
  const [status, setStatus] = React.useState(initialItem.status);
  const [comment, setComment] = React.useState(initialItem.adminComment ?? "");
  const [message, setMessage] = React.useState<string | null>(null);
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [savingComment, setSavingComment] = React.useState(false);

  const summaryText = React.useMemo(
    () =>
      [
        `Пользователь: ${initialItem.userName} <${initialItem.userEmail}>`,
        `Артист: ${initialItem.artistName}`,
        `Релиз: ${initialItem.releaseTitle}`,
        `Дата релиза: ${initialItem.releaseDate}`,
        `UPC: ${initialItem.upc}`,
        `Статус: ${formatPromoSubmissionStatusLabel(status)}`,
        `Партнёр: ${initialItem.partnerName}`,
        `Страна артиста: ${initialItem.artistCountry}`,
        `Жанр: ${initialItem.genre}`,
        `Формат: ${initialItem.releaseFormat}`,
        `Язык: ${initialItem.releaseLanguage}`,
        `Ключевой трек: ${initialItem.keyTrackTitle}`,
        `Лейбл: ${initialItem.label}`,
        `Клип: ${initialItem.hasMusicVideo ? "Да" : "Нет"}`,
        initialItem.videoPreviewUrl ? `Предпросмотр клипа: ${initialItem.videoPreviewUrl}` : null,
        `Фото артиста: ${initialItem.artistPhotoUrl}`,
        `Ссылка на прослушивание: ${initialItem.listeningLink}`,
        `Соцсети: ${initialItem.artistSocialLinks}`,
        `Описание: ${initialItem.releaseDescription}`,
        `Промо-план: ${initialItem.promotionPlan}`,
        `Комментарий админа: ${comment || "—"}`
      ]
        .filter(Boolean)
        .join("\n"),
    [comment, initialItem, status]
  );

  async function saveStatus() {
    setSavingStatus(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/promo/submissions/${initialItem.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Не удалось сохранить статус.");
      setMessage("Статус обновлён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить статус.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveComment() {
    setSavingComment(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/promo/submissions/${initialItem.id}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminComment: comment })
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Не удалось сохранить комментарий.");
      setMessage("Комментарий обновлён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить комментарий.");
    } finally {
      setSavingComment(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#11141d] p-5">
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div>
          <label className="mb-2 block text-sm font-semibold text-white">Статус заявки</label>
          <select className={selectClassName} value={status} onChange={(event) => setStatus(event.target.value as typeof initialItem.status)}>
            {promoSubmissionStatuses.map((item) => (
              <option key={item} value={item}>{formatPromoSubmissionStatusLabel(item)}</option>
            ))}
          </select>
          <Button type="button" className="mt-3 w-full" onClick={() => void saveStatus()} disabled={savingStatus}>
            {savingStatus ? "Сохраняем..." : "Сохранить статус"}
          </Button>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-white">Комментарий администратора</label>
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} className="min-h-[120px]" />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void saveComment()} disabled={savingComment}>
              {savingComment ? "Сохраняем..." : "Сохранить комментарий"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(summaryText);
                setMessage("Данные заявки скопированы.");
              }}
            >
              Копировать данные
            </Button>
          </div>
        </div>
      </div>
      {message ? <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white/76">{message}</div> : null}
    </div>
  );
}
