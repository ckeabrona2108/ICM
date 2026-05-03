"use client";

import Image from "next/image";
import * as React from "react";
import { UserRound } from "lucide-react";

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

  return (
    <span
      className={cn(
        "relative grid overflow-hidden rounded-full border border-white/[0.14] bg-white/[0.06] place-items-center",
        sizeClass,
        className
      )}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={name ? `Аватар ${name}` : "Аватар пользователя"}
          fill
          sizes="64px"
          className="object-cover"
        />
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
