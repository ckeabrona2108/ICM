"use client";

import * as React from "react";

import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { normalizeNextImageSrc } from "@/lib/image-src";
import { cn } from "@/lib/utils";

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

  const safeAvatarUrl = normalizeNextImageSrc(avatarUrl);
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFailedSrc(null);
  }, [safeAvatarUrl]);

  const displayAvatarUrl = safeAvatarUrl && failedSrc !== safeAvatarUrl
    ? safeAvatarUrl
    : DEFAULT_USER_AVATAR_URL;
  const isDefaultAvatar = displayAvatarUrl === DEFAULT_USER_AVATAR_URL;

  return (
    <span
      className={cn(
        "relative grid overflow-hidden rounded-full border border-white/[0.14] bg-white/[0.06] place-items-center",
        sizeClass,
        className
      )}
    >
      <img
        src={displayAvatarUrl}
        alt={name ? `Аватар ${name}` : "Аватар пользователя"}
        className={cn("h-full w-full object-cover", isDefaultAvatar && "scale-[1.18]")}
        onError={(event) => {
          if (displayAvatarUrl !== DEFAULT_USER_AVATAR_URL) {
            event.currentTarget.src = DEFAULT_USER_AVATAR_URL;
          }
          if (safeAvatarUrl) setFailedSrc(safeAvatarUrl);
        }}
      />
    </span>
  );
}
