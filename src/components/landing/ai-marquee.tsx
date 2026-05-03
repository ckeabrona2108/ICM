"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const MODELS = [
  "Kling 3.0",
  "Seedance 2.0",
  "Veo 3.1",
  "Veo 3.1 Fast",
  "Sora 2 Pro",
  "Wan 2.6",
  "Hailuo",
  "Flux 2 Pro",
  "Google Imagen 4",
  "Imagen 4 Ultra",
  "GPT Image 1.5",
  "Nano Banana 2",
  "Nano Banana PRO",
  "Seedream 4.5",
  "Grok Imagine",
  "Suno Music",
  "Qwen"
];

interface AiMarqueeProps {
  className?: string;
  reverse?: boolean;
  speed?: "slow" | "normal";
}

export function AiMarquee({ className, reverse, speed = "normal" }: AiMarqueeProps) {
  const items = [...MODELS, ...MODELS];

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className
      )}
    >
      <div
        className={cn(
          "flex w-max gap-3 whitespace-nowrap",
          reverse
            ? "animate-marqueeReverse"
            : speed === "slow"
              ? "animate-marqueeSlow"
              : "animate-marquee"
        )}
      >
        {items.map((m, i) => (
          <span
            key={`${m}-${i}`}
            className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-white/80 backdrop-blur-md transition hover:border-cyan-300/40 hover:text-white"
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
