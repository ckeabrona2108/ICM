"use client";

import * as React from "react";

import { CabinetNoticeBanner } from "@/components/dashboard/cabinet-notice-banner";
import type { CabinetNotice, CabinetNoticeTone } from "@/lib/cabinet-notice";

const TONE_OPTIONS: Array<{ value: CabinetNoticeTone; label: string }> = [
  { value: "warning", label: "Важно (жёлтое)" },
  { value: "info", label: "Новость (фиолетовое)" },
  { value: "success", label: "Хорошая новость (зелёное)" }
];

const FIELD =
  "w-full rounded-xl border border-white/[0.12] bg-black/30 px-3 py-2.5 text-[14px] text-white placeholder:text-white/30 focus:border-[#a78bfa]/60 focus:outline-none";

export function AdminCabinetNoticeClient({ initialNotice }: { initialNotice: CabinetNotice }) {
  const [notice, setNotice] = React.useState(initialNotice);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const update = (patch: Partial<CabinetNotice>) => {
    setNotice((current) => ({ ...current, ...patch }));
    setSavedAt(null);
  };

  const save = async (next: CabinetNotice) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/cabinet-notice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      const data = (await response.json().catch(() => null)) as { notice?: CabinetNotice; error?: string } | null;
      if (!response.ok || !data?.notice) throw new Error(data?.error ?? `Ошибка ${response.status}`);
      setNotice(data.notice);
      setSavedAt(Date.now());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Нет связи с сервером");
    } finally {
      setSaving(false);
    }
  };

  const hasText = Boolean(notice.title.trim() || notice.message.trim());

  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <div className="grid gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.02] p-5">
        <label className="grid gap-1.5">
          <span className="text-[13px] text-white/60">Заголовок</span>
          <input
            value={notice.title}
            maxLength={120}
            onChange={(event) => update({ title: event.target.value })}
            placeholder="Отчёт за III квартал задерживается"
            className={FIELD}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] text-white/60">Текст</span>
          <textarea
            value={notice.message}
            maxLength={600}
            rows={3}
            onChange={(event) => update({ message: event.target.value })}
            placeholder="Площадки ещё не прислали данные. Как только отчёт придёт, он появится в разделе «Финансы»."
            className={FIELD}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[13px] text-white/60">Цвет</span>
            <select
              value={notice.tone}
              onChange={(event) => update({ tone: event.target.value as CabinetNoticeTone })}
              className={FIELD}
            >
              {TONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1.5">
            <span className="text-[13px] text-white/60">Кнопка (необязательно)</span>
            <div className="flex gap-2">
              <input
                value={notice.linkLabel}
                maxLength={40}
                onChange={(event) => update({ linkLabel: event.target.value })}
                placeholder="Подробнее"
                className={`${FIELD} w-2/5`}
              />
              <input
                value={notice.linkHref}
                onChange={(event) => update({ linkHref: event.target.value })}
                placeholder="/dashboard/finance"
                className={FIELD}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[13px] text-white/50">Так увидит артист:</p>
        {hasText ? (
          <CabinetNoticeBanner notice={notice} preview />
        ) : (
          <p className="text-[13px] text-white/35">Напишите заголовок или текст.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || !hasText}
          onClick={() => void save({ ...notice, enabled: true })}
          className="h-11 rounded-xl bg-[#7b61ff] px-5 text-[14px] font-semibold text-white transition hover:bg-[#6a4ff0] disabled:opacity-40"
        >
          {notice.enabled ? "Сохранить и показать снова" : "Показать артистам"}
        </button>
        {notice.enabled ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save({ ...notice, enabled: false })}
            className="h-11 rounded-xl border border-white/15 px-5 text-[14px] font-semibold text-white/80 transition hover:bg-white/[0.06] disabled:opacity-40"
          >
            Снять уведомление
          </button>
        ) : null}
        <span className="text-[13px] text-white/50">
          {saving
            ? "Сохраняем…"
            : savedAt
              ? notice.enabled
                ? "✓ Показывается артистам"
                : "✓ Снято"
              : notice.enabled
                ? "Сейчас показывается артистам"
                : "Сейчас не показывается"}
        </span>
      </div>
      {error ? <p className="text-[13px] text-rose-300">{error}</p> : null}
    </div>
  );
}
