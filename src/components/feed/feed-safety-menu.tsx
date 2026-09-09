"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Ban, Copy, EyeOff, Flag, MoreHorizontal, Share2, VolumeX, X } from "lucide-react";

export type FeedSafetyTargetType = "post" | "release" | "post_comment" | "release_comment";
export type FeedSafetyReportReason = "spam" | "harassment" | "hate" | "impersonation" | "privacy" | "illegal" | "other";
export type FeedSafetyAppliedAction =
  | { kind: "hide"; targetType: "post" | "release"; targetId: string }
  | { kind: "mute"; authorId: string }
  | { kind: "block"; authorId: string }
  | { kind: "report"; targetType: FeedSafetyTargetType | "user"; targetId: string; reason?: FeedSafetyReportReason; details?: string };

const REPORT_REASONS: Array<{ value: FeedSafetyReportReason; label: string }> = [
  { value: "spam", label: "Спам или реклама" },
  { value: "harassment", label: "Оскорбления или травля" },
  { value: "hate", label: "Ненависть или дискриминация" },
  { value: "impersonation", label: "Выдаёт себя за другого" },
  { value: "privacy", label: "Личные данные" },
  { value: "illegal", label: "Незаконный контент" },
  { value: "other", label: "Другое" }
];

export function buildFeedSafetyRequest(action: FeedSafetyAppliedAction) {
  if (action.kind === "report") {
	    return {
	      url: "/api/social/reports",
	      method: "POST",
	      body: { targetType: action.targetType, targetId: action.targetId, reason: action.reason ?? "other", details: action.details?.trim() ?? "" }
	    } as const;
	  }
  if (action.kind === "block") {
    return { url: `/api/social/blocks/${encodeURIComponent(action.authorId)}`, method: "POST", body: undefined } as const;
  }
  if (action.kind === "mute") {
    return {
      url: "/api/social/feed-preferences",
      method: "POST",
      body: { action: "mute", targetType: "user", targetId: action.authorId }
    } as const;
  }
  return {
    url: "/api/social/feed-preferences",
    method: "POST",
    body: { action: "hide", targetType: action.targetType, targetId: action.targetId }
  } as const;
}

export function FeedSafetyMenu({
  authenticated,
  ownedByViewer,
  authorId,
  targetType,
  targetId,
  compact = false,
  variant = "default",
  onShare,
  permalink,
  extraActions = [],
  onApplied
}: {
  authenticated: boolean;
  ownedByViewer: boolean;
  authorId: string;
  targetType: FeedSafetyTargetType;
  targetId: string;
  compact?: boolean;
  variant?: "default" | "collaboration";
  onShare?: () => void;
  permalink?: string;
  extraActions?: Array<{
    label: React.ReactNode;
    icon?: React.ReactNode;
    danger?: boolean;
    onClick: () => void;
  }>;
  onApplied: (action: FeedSafetyAppliedAction) => void;
}) {
	  const [open, setOpen] = React.useState(false);
	  const [busy, setBusy] = React.useState(false);
	  const [mounted, setMounted] = React.useState(false);
	  const [error, setError] = React.useState<string | null>(null);
	  const [reportDialog, setReportDialog] = React.useState<{
	    title: string;
	    description: string;
	    action: Extract<FeedSafetyAppliedAction, { kind: "report" }>;
	  } | null>(null);
	  const [reportReason, setReportReason] = React.useState<FeedSafetyReportReason>("other");
	  const [reportDetails, setReportDetails] = React.useState("");
	  const [position, setPosition] = React.useState<{ left: number; top: number; placement: "top" | "bottom"; width: number } | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = React.useCallback(() => {
    const button = buttonRef.current;
    if (!button || typeof window === "undefined") return;
    const rect = button.getBoundingClientRect();
    const padding = 12;
    const width = Math.min(300, Math.max(240, variant === "collaboration" ? 272 : 250));
    const left = Math.min(Math.max(padding, rect.right - width), Math.max(padding, window.innerWidth - width - padding));
    const estimatedHeight = variant === "collaboration" ? (ownedByViewer ? 160 : 156) : 280;
    const hasBottomSpace = window.innerHeight - rect.bottom >= estimatedHeight + padding;
    setPosition({
      left,
      top: hasBottomSpace ? rect.bottom + 8 : Math.max(padding, rect.top - 8),
      placement: hasBottomSpace ? "bottom" : "top",
      width
    });
  }, [ownedByViewer, variant]);

	  React.useEffect(() => {
	    if (!open) return;
    updatePosition();
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => updatePosition();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
	    };
	  }, [open, updatePosition]);

	  React.useEffect(() => {
	    if (!reportDialog) return;
	    const closeOnEscape = (event: KeyboardEvent) => {
	      if (event.key === "Escape" && !busy) setReportDialog(null);
	    };
	    window.addEventListener("keydown", closeOnEscape);
	    return () => window.removeEventListener("keydown", closeOnEscape);
	  }, [busy, reportDialog]);

  const isCollaborationMenu = variant === "collaboration";
  if (!authenticated && !onShare && !permalink && !extraActions.length) return null;

	  async function execute(action: FeedSafetyAppliedAction) {
	    setBusy(true);
	    setError(null);
	    try {
	      const request = buildFeedSafetyRequest(action);
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.body ? { "Content-Type": "application/json" } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Не удалось выполнить действие");
      }
	      setOpen(false);
	      setReportDialog(null);
	      setReportDetails("");
	      setReportReason("other");
	      onApplied(action);
	    } catch (error) {
	      setError(error instanceof Error ? error.message : "Не удалось выполнить действие");
	    } finally {
	      setBusy(false);
	    }
	  }

	  async function apply(action: FeedSafetyAppliedAction, confirmation: string) {
	    if (!window.confirm(confirmation)) return;
	    await execute(action);
	  }

	  function openReportDialog(action: Extract<FeedSafetyAppliedAction, { kind: "report" }>, title: string, description: string) {
	    setOpen(false);
	    setError(null);
	    setReportReason("other");
	    setReportDetails("");
	    setReportDialog({ action, title, description });
	  }

  const contentLabel = targetType.includes("comment") ? "комментарий" : "публикацию";
  const menu = open && mounted && position ? createPortal(
    <div
      ref={menuRef}
      className="fixed z-[190] h-auto min-h-0 max-w-[300px] rounded-[16px] border border-white/[0.10] bg-[#101522] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.50)] ring-1 ring-white/[0.035]"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        transform: position.placement === "top" ? "translateY(-100%)" : undefined
      }}
      role="menu"
    >
      {isCollaborationMenu ? (
        ownedByViewer ? (
          extraActions.map((action, index) => (
            <SafetyAction
              key={`extra-${index}`}
              icon={action.icon}
              danger={action.danger}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </SafetyAction>
          ))
        ) : (
          <>
            {permalink ? <SafetyAction icon={<Copy className="size-4" />} onClick={() => {
              setOpen(false);
              const url = typeof window === "undefined" ? permalink : `${window.location.origin}${permalink}`;
              void navigator.clipboard.writeText(url).catch(() => null);
            }}>Копировать ссылку</SafetyAction> : null}
            {authenticated ? (
              <>
	                <SafetyAction icon={<Flag className="size-4" />} onClick={() => openReportDialog(
	                  { kind: "report", targetType, targetId },
	                  "Пожаловаться на публикацию",
	                  "Опишите, что именно не так с этой публикацией. Жалоба попадёт в админ-панель."
	                )}>Пожаловаться на публикацию</SafetyAction>
	                <SafetyAction icon={<Flag className="size-4" />} onClick={() => openReportDialog(
	                  { kind: "report", targetType: "user", targetId: authorId },
	                  "Пожаловаться на пользователя",
	                  "Опишите проблему с пользователем. Жалоба попадёт в админ-панель."
	                )}>Пожаловаться на пользователя</SafetyAction>
              </>
            ) : null}
          </>
        )
      ) : (
        <>
          {extraActions.map((action, index) => (
            <SafetyAction
              key={`extra-${index}`}
              icon={action.icon}
              danger={action.danger}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </SafetyAction>
          ))}
          {extraActions.length ? <div className="my-1 border-t border-white/8" /> : null}
          {onShare ? <SafetyAction icon={<Share2 className="size-4" />} onClick={() => { setOpen(false); onShare(); }}>Поделиться</SafetyAction> : null}
          {permalink ? <SafetyAction icon={<Copy className="size-4" />} onClick={() => {
            setOpen(false);
            const url = typeof window === "undefined" ? permalink : `${window.location.origin}${permalink}`;
            void navigator.clipboard.writeText(url).catch(() => null);
          }}>Скопировать ссылку</SafetyAction> : null}
          {authenticated ? <>
          {!ownedByViewer ? (
            <>
	              <SafetyAction icon={<Flag className="size-4" />} onClick={() => openReportDialog(
	                { kind: "report", targetType, targetId },
	                `Пожаловаться на ${contentLabel}`,
	                `Опишите, что именно не так. Жалоба попадёт в админ-панель.`
	              )}>Пожаловаться на {contentLabel}</SafetyAction>
	              <SafetyAction icon={<Flag className="size-4" />} onClick={() => openReportDialog(
	                { kind: "report", targetType: "user", targetId: authorId },
	                "Пожаловаться на автора",
	                "Опишите проблему с автором. Жалоба попадёт в админ-панель."
	              )}>Пожаловаться на автора</SafetyAction>
            </>
          ) : null}
          {(targetType === "post" || targetType === "release") ? (
            <SafetyAction icon={<EyeOff className="size-4" />} onClick={() => void apply(
              { kind: "hide", targetType, targetId },
              "Скрыть эту публикацию из вашей ленты?"
            )}>Скрыть публикацию</SafetyAction>
          ) : null}
          {!ownedByViewer ? (
            <>
              <SafetyAction icon={<VolumeX className="size-4" />} onClick={() => void apply(
                { kind: "mute", authorId },
                "Не показывать публикации этого автора в вашей ленте?"
              )}>Не показывать автора</SafetyAction>
              <SafetyAction danger icon={<Ban className="size-4" />} onClick={() => void apply(
                { kind: "block", authorId },
                "Заблокировать автора? Подписки между вами будут удалены."
              )}>Заблокировать автора</SafetyAction>
            </>
          ) : null}
          </> : null}
        </>
      )}
    </div>,
    document.body
  ) : null;

	  const reportModal = reportDialog && mounted ? createPortal(
	    <div
	      className="fixed inset-0 z-[220] flex items-center justify-center bg-[#03050d]/78 p-4 backdrop-blur-[10px]"
	      role="dialog"
	      aria-modal="true"
	      onMouseDown={(event) => {
	        if (event.target === event.currentTarget && !busy) setReportDialog(null);
	      }}
	    >
	      <div className="w-full max-w-[520px] rounded-[28px] border border-white/10 bg-[#101522] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.62)]">
	        <div className="flex items-start justify-between gap-4">
	          <div>
	            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#a78bfa]">Жалоба</p>
	            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-white">{reportDialog.title}</h2>
	            <p className="mt-2 text-[13px] leading-5 text-white/62">{reportDialog.description}</p>
	          </div>
	          <button
	            type="button"
	            disabled={busy}
	            onClick={() => setReportDialog(null)}
	            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
	            aria-label="Закрыть"
	          >
	            <X className="size-4" />
	          </button>
	        </div>

	        <label className="mt-5 block text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
	          Причина
	        </label>
	        <select
	          value={reportReason}
	          disabled={busy}
	          onChange={(event) => setReportReason(event.target.value as FeedSafetyReportReason)}
	          className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.055] px-4 text-[14px] font-semibold text-white outline-none transition focus:border-[#8b5cf6]/60 disabled:opacity-50"
	        >
	          {REPORT_REASONS.map((reason) => (
	            <option key={reason.value} value={reason.value} className="bg-[#101522] text-white">
	              {reason.label}
	            </option>
	          ))}
	        </select>

	        <label className="mt-4 block text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
	          Описание
	        </label>
	        <textarea
	          value={reportDetails}
	          disabled={busy}
	          maxLength={1000}
	          onChange={(event) => setReportDetails(event.target.value)}
	          placeholder="Напишите, что произошло. Это увидит только модерация."
	          className="mt-2 min-h-[132px] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3 text-[14px] leading-6 text-white outline-none transition placeholder:text-white/32 focus:border-[#8b5cf6]/60 disabled:opacity-50"
	        />
	        <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-white/42">
	          <span>{error}</span>
	          <span>{reportDetails.length}/1000</span>
	        </div>

	        <div className="mt-5 flex flex-wrap justify-end gap-3">
	          <button
	            type="button"
	            disabled={busy}
	            onClick={() => setReportDialog(null)}
	            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-[14px] font-semibold text-white/72 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
	          >
	            Отмена
	          </button>
	          <button
	            type="button"
	            disabled={busy}
	            onClick={() => void execute({ ...reportDialog.action, reason: reportReason, details: reportDetails })}
	            className="rounded-2xl bg-[#8b5cf6] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_16px_42px_rgba(139,92,246,0.34)] transition hover:bg-[#9f73ff] disabled:opacity-50"
	          >
	            {busy ? "Отправляем..." : "Отправить жалобу"}
	          </button>
	        </div>
	      </div>
	    </div>,
	    document.body
	  ) : null;

	  return (
	    <div className="relative z-50">
      <button
        ref={buttonRef}
        type="button"
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
        className={`${compact ? "h-7 w-7" : "h-8 w-8"} inline-flex items-center justify-center rounded-full text-white/36 transition hover:bg-white/10 hover:text-white/72 disabled:opacity-50`}
        aria-label="Действия безопасности"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
	      </button>
	      {menu}
	      {reportModal}
	    </div>
	  );
	}

function SafetyAction({
  children,
  icon,
  danger = false,
  onClick
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white/[0.05] ${danger ? "text-[#d8d0ff] hover:text-white" : "text-white/85 hover:text-white"}`}
      role="menuitem"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 whitespace-normal break-words leading-5">{children}</span>
    </button>
  );
}
