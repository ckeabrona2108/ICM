"use client";

import * as React from "react";
import Image from "next/image";
import { Heart, MessageCircle, MoreHorizontal, Reply } from "lucide-react";

import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { VerifiedBadge } from "@/components/uitripled/native-verified-badge-shadcnui";
import { cn } from "@/lib/utils";

type IdentityProps = {
  name: string;
  avatarUrl: string | null;
  verified?: boolean;
  meta?: string | null;
  compact?: boolean;
  secondarySlot?: React.ReactNode;
};

function IdentityAvatar({
  name,
  avatarUrl,
  compact = false,
  className
}: {
  name: string;
  avatarUrl: string | null;
  compact?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(!avatarUrl);

  React.useEffect(() => {
    setFailed(!avatarUrl);
  }, [avatarUrl]);

  const src = avatarUrl && !failed ? avatarUrl : DEFAULT_USER_AVATAR_URL;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_56%),linear-gradient(180deg,rgba(30,34,47,0.94),rgba(16,18,28,0.98))] ring-1 ring-white/6",
        compact ? "h-10 w-10 rounded-[14px]" : "h-12 w-12",
        className
      )}
    >
      <Image
        src={src}
        alt={name}
        fill
        unoptimized
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function TripledIdentity({
  name,
  avatarUrl,
  verified = false,
  meta,
  compact = false,
  secondarySlot
}: IdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IdentityAvatar name={name} avatarUrl={avatarUrl || DEFAULT_USER_AVATAR_URL} compact={compact} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold tracking-[-0.02em] text-white">{name}</span>
          {verified ? <VerifiedBadge variant="blue" size="sm" tooltip="Верифицированный профиль" className="shrink-0" /> : null}
          {secondarySlot}
        </div>
        {meta ? <p className="truncate text-[12px] font-medium text-white/44">{meta}</p> : null}
      </div>
    </div>
  );
}

type LikesUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type LikesCounterProps = {
  count: number;
  active?: boolean;
  users?: LikesUser[];
  onClick?: () => void;
  className?: string;
};

export function NativeLikesCounter({
  count,
  active = false,
  users = [],
  onClick,
  className
}: LikesCounterProps) {
  const previewUsers = users.slice(0, 3);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition duration-200",
        active
          ? "border-[#ff8fa8]/34 bg-[linear-gradient(180deg,rgba(255,87,121,0.18),rgba(255,87,121,0.10))] text-white shadow-[0_18px_36px_-24px_rgba(255,87,121,0.55)]"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] text-white/76 hover:border-white/18 hover:bg-white/[0.08]",
        className
      )}
    >
      <span className="flex -space-x-2">
        {previewUsers.length > 0 ? previewUsers.map((user, index) => (
          <span
            key={user.id}
            className={cn(
              "relative inline-flex h-5 w-5 overflow-hidden rounded-full border border-[#10131a] ring-1 ring-white/10",
              index === 0 ? "" : "shadow-[0_8px_18px_-12px_rgba(0,0,0,0.7)]"
            )}
          >
            <IdentityAvatar name={user.name} avatarUrl={user.avatarUrl || DEFAULT_USER_AVATAR_URL} compact className="h-full w-full rounded-full border-0 ring-0" />
          </span>
        )) : (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/12 bg-white/[0.06]">
            <Heart className={cn("h-3 w-3", active ? "fill-current" : "")} />
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Heart className={cn("h-3.5 w-3.5", active ? "fill-current text-[#ff9db2]" : "text-white/56")} />
        <span className="font-semibold">{count}</span>
      </span>
    </button>
  );
}

type CommentNodeProps = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorVerified?: boolean;
  timeLabel: string;
  body: React.ReactNode;
  media?: React.ReactNode;
  actions?: React.ReactNode;
  composer?: React.ReactNode;
  children?: React.ReactNode;
  nested?: boolean;
  repliesCount?: number;
};

export function TripledCommentNode({
  id,
  authorName,
  authorAvatarUrl,
  authorVerified = false,
  timeLabel,
  body,
  media,
  actions,
  composer,
  children,
  nested = false,
  repliesCount = 0
}: CommentNodeProps) {
  return (
    <article id={`comment-${id}`} className={cn("relative scroll-mt-24", nested ? "pl-8 sm:pl-10" : "")}>
      {nested ? <div className="absolute left-4 top-0 bottom-0 w-px bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.02))]" /> : null}
      <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.028))] p-4 shadow-[0_24px_60px_-46px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(203,170,255,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(122,211,255,0.08),transparent_26%)] opacity-80" />
        <div className="relative space-y-3">
          <div className="flex items-start gap-3">
            <TripledIdentity
              name={authorName}
              avatarUrl={authorAvatarUrl}
              verified={authorVerified}
              compact
              meta={timeLabel}
            />
            <span className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-white/40">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          </div>
          <div className="text-[14px] leading-6 text-white/78">{body}</div>
          {media}
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/48">
            {actions}
            {repliesCount > 0 ? <span>{repliesCount} ответов</span> : null}
          </div>
          {composer}
        </div>
      </div>
      {children ? <div className="mt-3 space-y-3">{children}</div> : null}
    </article>
  );
}

export function TripledCommentAction({
  icon,
  children,
  onClick,
  destructive = false
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition",
        destructive
          ? "border-rose-300/12 bg-rose-400/[0.05] text-rose-100/70 hover:border-rose-300/24 hover:text-rose-50"
          : "border-white/8 bg-white/[0.03] text-white/54 hover:border-white/14 hover:text-white"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function TripledComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
      className="rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={2}
          className="min-h-[52px] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/28"
        />
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-white text-[#0d1017] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Reply className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

export function TripledThreadHeader({ count, caption }: { count: number; caption: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">Comments</div>
        <div className="mt-1 flex items-center gap-2 text-white">
          <MessageCircle className="h-4 w-4 text-white/54" />
          <span className="text-[18px] font-semibold tracking-[-0.03em]">{count}</span>
        </div>
      </div>
      <p className="text-[12px] text-white/38">{caption}</p>
    </div>
  );
}

export function TripledProfileNotch({
  name,
  avatarUrl,
  eyebrow,
  meta,
  description,
  actions,
  stats
}: {
  name: string;
  avatarUrl: string | null;
  eyebrow: string;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.92),rgba(10,12,20,0.98))] p-6 shadow-[0_38px_120px_-56px_rgba(0,0,0,0.82)] sm:p-8">
      <div className="absolute left-1/2 top-0 h-12 w-[min(60vw,320px)] -translate-x-1/2 rounded-b-[28px] border-x border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] shadow-[0_18px_40px_-28px_rgba(195,168,255,0.55)] backdrop-blur-xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(194,160,255,0.18),transparent_26%),radial-gradient(circle_at_80%_20%,rgba(88,191,255,0.12),transparent_18%)]" />
      <div className="relative space-y-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-[24px] border border-white/12 bg-white/[0.06] ring-1 ring-white/8 sm:h-24 sm:w-24">
              <Image
                src={avatarUrl || DEFAULT_USER_AVATAR_URL}
                alt={name}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d8c5ff]">{eyebrow}</p>
              <h1 className="mt-2 text-balance text-[34px] font-semibold leading-[0.94] tracking-[-0.05em] text-white sm:text-[46px]">{name}</h1>
              {meta ? <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/54">{meta}</div> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {description ? <div className="max-w-3xl text-[15px] leading-7 text-white/68">{description}</div> : null}
        {stats ? <div className="grid gap-3 sm:grid-cols-3">{stats}</div> : null}
      </div>
    </section>
  );
}
