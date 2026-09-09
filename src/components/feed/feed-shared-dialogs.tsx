"use client";

import * as React from "react";

import { X } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import type { FeedReleaseOption } from "@/lib/feed-contract";

export const POST_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function hasPostEditWindowExpired(publishedAt: string, nowTs = Date.now()): boolean {
  const publishedTs = Date.parse(publishedAt);
  if (Number.isNaN(publishedTs)) return false;
  return nowTs - publishedTs > POST_EDIT_WINDOW_MS;
}

export function EditPostDialog({
  open,
  busy,
  expired,
  value,
  onChange,
  onClose,
  onConfirm
}: {
  open: boolean;
  busy: boolean;
  expired: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const busyRef = React.useRef(busy);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[176] flex items-center justify-center bg-[#040610]/78 p-4 backdrop-blur-md" onClick={busy ? undefined : onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-post-title"
        aria-describedby="edit-post-description"
        className="max-h-[calc(100vh-2rem)] w-full max-w-[620px] overflow-y-auto rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(22,25,40,0.98),rgba(10,12,22,0.98))] p-6 shadow-[0_40px_120px_-48px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9d8dff]">Редактирование публикации</p>
            <h2 id="edit-post-title" className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white">
              Изменить публикацию
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/62 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 rounded-[24px] border border-[#7b61ff]/18 bg-[#15182a] px-4 py-4">
          <p id="edit-post-description" className="text-sm leading-6 text-white/78">
            {expired
              ? "Прошло 24 часа, и, к сожалению, отредактировать данную публикацию нельзя."
              : "Публикацию можно редактировать только в течение 24 часов после публикации."}
          </p>
          {!expired ? (
            <Textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Обновите текст публикации"
              className="mt-4 min-h-[160px] rounded-[22px] border border-[#7b61ff]/18 bg-[#1a1d31] px-4 py-3 text-base leading-7 text-white placeholder:text-white/28 focus-visible:border-[#8f7cff]/60 focus-visible:ring-0"
            />
          ) : null}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-white/82 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {expired ? "Закрыть" : "Отмена"}
          </button>
          {!expired ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || !value.trim()}
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#7b61ff]/35 bg-[linear-gradient(135deg,#6f55ff,#9d8dff)] px-5 text-sm font-semibold text-white shadow-[0_20px_48px_-24px_rgba(123,97,255,0.75)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Сохраняем..." : "Сохранить изменения"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CollaborationResponseDialog({
  open,
  busy,
  error,
  releases,
  linkedReleaseId,
  message,
  summary,
  onReleaseChange,
  onMessageChange,
  onClose,
  onConfirm
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  releases: FeedReleaseOption[];
  linkedReleaseId: string;
  message: string;
  summary?: {
    intent: string;
    role: string;
    format: string;
  } | null;
  onReleaseChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const busyRef = React.useRef(busy);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[176] flex items-center justify-center bg-[#040610]/82 p-4 backdrop-blur-md" onClick={busy ? undefined : onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collaboration-response-title"
        aria-describedby="collaboration-response-description"
        className="max-h-[calc(100vh-2rem)] w-full max-w-[620px] overflow-y-auto rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(22,25,40,0.98),rgba(10,12,22,0.98))] p-6 shadow-[0_40px_120px_-48px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8f7cff]">Отклик на объявление</p>
            <h2 id="collaboration-response-title" className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white">
              Откликнуться на объявление
            </h2>
            <p id="collaboration-response-description" className="mt-3 text-sm leading-6 text-white/64">
              Коротко расскажите о себе и чем можете помочь.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/62 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          {summary ? (
            <div className="rounded-[22px] border border-[#7b61ff]/18 bg-[linear-gradient(180deg,rgba(123,97,255,0.12),rgba(17,20,34,0.88))] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Объявление</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex min-h-10 items-center rounded-full border border-[#7b61ff]/30 bg-[#7b61ff]/14 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#efe9ff]">
                  {summary.intent}
                </span>
                <span className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/74">
                  {summary.role}
                </span>
                <span className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/74">
                  {summary.format}
                </span>
              </div>
            </div>
          ) : null}

          <div className="rounded-[22px] border border-[#7b61ff]/18 bg-[#15182a] px-4 py-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42" htmlFor="collaboration-response-message">
              Расскажите немного о себе
            </label>
            <Textarea
              id="collaboration-response-message"
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Коротко расскажите о себе, опыте и чем можете помочь."
              className="mt-3 min-h-[160px] rounded-[22px] border border-[#7b61ff]/18 bg-[#1a1d31] px-4 py-3 text-base leading-7 text-white placeholder:text-white/28 focus-visible:border-[#8f7cff]/60 focus-visible:ring-0"
            />
          </div>

          <div className="rounded-[22px] border border-[#7b61ff]/18 bg-[#15182a] px-4 py-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42" htmlFor="collaboration-response-release">
              Прикрепить свой релиз
            </label>
            <select
              id="collaboration-response-release"
              value={linkedReleaseId}
              onChange={(event) => onReleaseChange(event.target.value)}
              className="mt-3 h-12 w-full rounded-[18px] border border-[#7b61ff]/18 bg-[#1a1d31] px-4 text-sm text-white outline-none transition focus:border-[#7b61ff]/50"
            >
              <option value="">Без релиза</option>
              {releases.map((release) => (
                <option key={release.id} value={release.id}>
                  {release.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-[#c9c0ff]">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-white/82 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !message.trim()}
            className="inline-flex h-12 items-center justify-center rounded-full border border-[#7b61ff]/30 bg-[linear-gradient(135deg,#7b61ff,#9d8dff)] px-5 text-sm font-semibold text-white shadow-[0_20px_48px_-24px_rgba(123,97,255,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Отправляем..." : "Отправить отклик"}
          </button>
        </div>
      </div>
    </div>
  );
}
