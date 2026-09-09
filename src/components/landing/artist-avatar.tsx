"use client";

import * as React from "react";
import Image from "next/image";

import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export function ArtistAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [failed, setFailed] = React.useState(false);

  const src = avatarUrl && !failed ? avatarUrl : DEFAULT_USER_AVATAR_URL;

  React.useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  return (
    <Image
      src={src}
      alt={name}
      fill
      priority
      sizes="220px"
      className={cn("object-cover", src === DEFAULT_USER_AVATAR_URL && "scale-[1.18]")}
      onError={() => {
        if (avatarUrl) setFailed(true);
      }}
    />
  );
}
