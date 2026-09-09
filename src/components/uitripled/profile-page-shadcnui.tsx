"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import {
  Calendar,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  MapPin,
  MoreHorizontal,
  Share2,
  UserPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { VerifiedBadge } from "@/components/uitripled/native-verified-badge-shadcnui";
import { Button } from "@/components/ui/button";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type ProfileLink = {
  href: string;
  label: string;
  icon: "site" | "external" | "telegram";
};

type ProfileStat = {
  label: string;
  value: string | number;
};

type MoreAction = {
  label: string;
  onClick: () => void;
  icon: "share" | "copy" | "open";
};

export function TripledProfilePageHero({
  name,
  isVerified = false,
  handle,
  avatarUrl,
  backgroundUrl,
  bio,
  location,
  joinedAt,
  links,
  stats,
  following,
  showActions,
  onFollow,
  followLabel,
  onMessage,
  messageLabel = "Сообщение",
  moreActions = [],
}: {
  name: string;
  isVerified?: boolean;
  handle: string;
  avatarUrl: string | null;
  backgroundUrl?: string | null;
  bio: string;
  location?: string | null;
  joinedAt?: string | null;
  links: ProfileLink[];
  stats: ProfileStat[];
  following: boolean;
  showActions: boolean;
  onFollow?: () => void;
  followLabel: string;
  onMessage?: () => void;
  messageLabel?: string;
  moreActions?: MoreAction[];
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const primaryLink = links[0] ?? null;
  const avatarSrc = avatarUrl && !avatarFailed ? avatarUrl : DEFAULT_USER_AVATAR_URL;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  return (
    <div className="rounded-[32px]">
      <div
        className="relative h-48 w-full overflow-hidden rounded-t-[32px] md:h-64"
        role="img"
        aria-label="Profile cover background"
      >
        {backgroundUrl ? (
          <Image
            src={backgroundUrl}
            alt={`${name} profile background`}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <motion.div
            className="absolute inset-0"
            animate={{
              background: [
                "linear-gradient(45deg, #667eea 0%, #764ba2 100%)",
                "linear-gradient(45deg, #f093fb 0%, #f5576c 100%)",
                "linear-gradient(45deg, #4facfe 0%, #00f2fe 100%)",
                "linear-gradient(45deg, #43e97b 0%, #38f9d7 100%)",
                "linear-gradient(45deg, #667eea 0%, #764ba2 100%)",
              ],
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        )}
        <div className="absolute inset-0 bg-black/10" />
      </div>

      <div className="container mx-auto max-w-4xl px-4 pb-6 sm:px-6">
        <div className="relative mb-6 -mt-8 flex flex-col items-start gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-4 sm:gap-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="relative"
            >
              <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-background bg-background shadow-xl sm:h-32 sm:w-32">
                <div className="relative h-full w-full">
                  <Image
                    src={avatarSrc}
                    alt={`${name} profile picture`}
                    fill
                    unoptimized
                    className={cn("object-cover", avatarSrc === DEFAULT_USER_AVATAR_URL && "scale-[1.08]")}
                    onError={() => {
                      if (avatarUrl) setAvatarFailed(true);
                    }}
                  />
                </div>
              </div>
            </motion.div>

            <div className="mb-1 space-y-0.5 sm:mb-2 sm:space-y-1">
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground md:text-3xl sm:text-2xl">
                  {name}
                </h1>
                {isVerified ? <VerifiedBadge variant="blue" size="md" tooltip="Верифицированный профиль" className="shrink-0" /> : null}
              </div>
              <p className="text-sm text-muted-foreground sm:text-base">{handle}</p>
            </div>
          </div>

          {showActions ? (
            <div className="flex w-full gap-2 sm:gap-3 md:mb-2 md:w-auto">
              <Button
                variant={following ? "destructive" : "default"}
                style={following ? { backgroundColor: "#dc2626", color: "#ffffff" } : undefined}
                className={cn(
                  "flex-1 gap-2 border-0 text-white transition-all md:flex-none",
                  following
                    ? "!bg-red-600 !text-white hover:!bg-red-500"
                    : "bg-[linear-gradient(180deg,#8c6dff,#6f4cff)] shadow-[0_18px_36px_-22px_rgba(123,97,255,0.9)] hover:brightness-110"
                )}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onFollow?.();
                }}
                aria-label={followLabel}
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {followLabel}
              </Button>
              <Button
                variant="outline"
                className="flex-1 md:flex-none"
                aria-label={messageLabel}
                onClick={onMessage}
              >
                {messageLabel}
              </Button>
              <div ref={menuRef} className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="border border-border/40"
                  aria-label="More profile options"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
                {menuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-56 rounded-2xl border border-white/10 bg-[#101118]/96 p-2 shadow-2xl backdrop-blur-xl">
                    {moreActions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          action.onClick();
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/78 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        <ActionIcon icon={action.icon} />
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div
          aria-label="User bio and statistics"
          className="grid gap-8"
        >
          <div className="space-y-6">
            <div className="space-y-4">
              {bio ? (
                <p className="text-sm leading-relaxed text-foreground/90 sm:text-base">
                  {bio}
                </p>
              ) : null}

              <div
                className="relative isolate w-full overflow-hidden rounded-[22px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(35,38,53,0.96),rgba(30,33,47,0.96))] px-5 py-5 sm:rounded-[26px] sm:px-7 sm:py-6 lg:rounded-[30px] lg:px-8 lg:py-6"
                style={{ clipPath: "inset(0 round 30px)" }}
              >
                <div className="relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground sm:gap-x-6 sm:text-sm lg:flex-nowrap">
                  {location ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                      <span>{location}</span>
                    </div>
                  ) : null}
                  {primaryLink ? (
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#05a6e8]/28 bg-[#05a6e8]/10 px-3 py-1.5 text-[#7fd6ff] shadow-[0_10px_28px_-20px_rgba(5,166,232,0.9)]">
                      <LinkIcon className="h-3.5 w-3.5 text-[#05a6e8] sm:h-4 sm:w-4" aria-hidden="true" />
                      <a
                        href={primaryLink.href}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#7fd6ff] transition hover:text-[#b8ebff] hover:underline"
                        aria-label={`Visit ${name} website`}
                      >
                        {primaryLink.label}
                      </a>
                    </div>
                  ) : null}
                  {joinedAt ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                      <span>{formatJoinedAt(joinedAt)}</span>
                    </div>
                  ) : null}
                </div>

                <div
                  className="relative z-10 mt-5 w-full rounded-full border border-white/[0.1] bg-[rgba(39,42,58,0.96)] px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:mt-6 sm:px-7 sm:py-3.5 lg:px-8 lg:py-4"
                  style={{ clipPath: "inset(0 round 9999px)" }}
                >
                  <div className="grid min-h-[72px] grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3 sm:text-base lg:grid-cols-[1fr_0.9fr_0.8fr_1.35fr_0.75fr] lg:gap-x-6">
                    {stats.map((stat) => (
                      <div key={stat.label} className="flex min-w-0 items-center gap-1.5 lg:justify-center">
                        <span className="font-semibold text-foreground">{stat.value}</span>
                        <span className="text-muted-foreground lg:whitespace-nowrap">{stat.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionIcon({ icon }: { icon: MoreAction["icon"] }) {
  if (icon === "copy") return <Copy className="h-4 w-4" aria-hidden="true" />;
  if (icon === "open") return <ExternalLink className="h-4 w-4" aria-hidden="true" />;
  return <Share2 className="h-4 w-4" aria-hidden="true" />;
}

function formatJoinedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(date);
  const year = new Intl.DateTimeFormat("ru-RU", { year: "numeric" }).format(date);
  const inflectedMonth = toGenitiveRussianMonth(month);
  return `На платформе с ${inflectedMonth} ${year} г.`;
}

function toGenitiveRussianMonth(month: string) {
  if (month.endsWith("ь")) return `${month.slice(0, -1)}я`;
  if (month.endsWith("т")) return `${month}а`;
  return month;
}
