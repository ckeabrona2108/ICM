"use client";

import * as React from "react";
import { createPortal } from "react-dom";

const COVER_RULES = [
  "На обложке только нужная информация: имя артиста, название трека или альбома.",
  "Вы не используете изображения, права на которые принадлежат другим людям, без их письменного разрешения.",
  "На обложке нет интернет-адресов, почты, штрихкодов, цены, упоминаний поддержки, а также запрещённого: наркотиков, обмана и оскорблений."
];

/** Shown after a cover passes the size checks: the artist confirms it meets the platform rules. */
export function CoverConfirmModal({
  src,
  onReplace,
  onSave,
  onClose
}: {
  src: string;
  onReplace: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-confirm-title"
        onClick={(event) => event.stopPropagation()}
        className="grid max-h-full w-full max-w-[860px] gap-6 overflow-y-auto rounded-[28px] border border-white/10 bg-[#14151f] p-6 text-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] sm:grid-cols-[1fr_260px] sm:p-8"
      >
        <div className="order-2 min-w-0 sm:order-1">
          <h3 id="cover-confirm-title" className="text-[26px] font-black tracking-[-0.03em]">
            Убедитесь:
          </h3>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-[14px] leading-6 text-white/75">
            {COVER_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] leading-5 text-white/45">
            Обложку с нарушениями площадки не пропустят, и релиз вернётся на исправление.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onReplace}
              className="h-12 rounded-2xl border border-white/20 text-[14px] font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.04]"
            >
              Заменить файл
            </button>
            <button
              type="button"
              onClick={onSave}
              className="h-12 rounded-2xl bg-[var(--ux-accent,#7b61ff)] text-[14px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(123,97,255,0.8)] transition hover:brightness-110"
            >
              Сохранить
            </button>
          </div>
        </div>
        <div className="order-1 sm:order-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
          <img src={src} alt="Выбранная обложка" className="aspect-square w-full rounded-[20px] object-cover" />
        </div>
      </div>
    </div>,
    document.body
  );
}
