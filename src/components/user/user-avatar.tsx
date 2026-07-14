"use client";

import Image from "next/image";
import * as React from "react";
import { UserRound } from "lucide-react";

import { normalizeNextImageSrc } from "@/lib/image-src";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/user-profile-policy";

export function UserAvatar({
  name,
  avatarUrl,
  size = "md",
  className
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "sm"
      ? "h-8 w-8"
      : size === "lg"
        ? "h-12 w-12"
        : "h-10 w-10";

  const initials = getInitials(name ?? "");
  const safeAvatarUrl = normalizeNextImageSrc(avatarUrl);
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const isInlineAvatarSrc = Boolean(
    safeAvatarUrl?.startsWith("data:image/") || safeAvatarUrl?.startsWith("blob:")
  );

  React.useEffect(() => {
    setFailedSrc(null);
  }, [safeAvatarUrl]);

  const shouldShowImage = Boolean(safeAvatarUrl && failedSrc !== safeAvatarUrl);

  return (
    <span
      className={cn(
        "relative grid overflow-hidden rounded-full border border-white/[0.14] bg-white/[0.06] place-items-center",
        sizeClass,
        className
      )}
    >
      {shouldShowImage && safeAvatarUrl ? (
        isInlineAvatarSrc ? (
          <img
            src={safeAvatarUrl}
            alt={name ? `Аватар ${name}` : "Аватар пользователя"}
            className="h-full w-full object-cover"
            onError={() => setFailedSrc(safeAvatarUrl)}
          />
        ) : (
          <Image
            src={safeAvatarUrl}
            alt={name ? `Аватар ${name}` : "Аватар пользователя"}
            fill
            sizes="64px"
            className="object-cover"
            onError={() => setFailedSrc(safeAvatarUrl)}
          />
        )
      ) : name ? (
        <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-white/86">
          {initials}
        </span>
      ) : (
        <UserRound className="h-4 w-4 text-white/70" />
      )}
    </span>
  );
}
