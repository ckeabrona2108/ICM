import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
}

export function BrandLogo({ className, compact }: BrandLogoProps) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-blue-400/30 bg-gradient-to-br from-blue-500/30 via-cyan-500/10 to-violet-500/20">
        <div className="absolute inset-0 animate-pulseSoft bg-radial-premium opacity-60" />
        <span className="relative font-display text-sm font-bold tracking-wide text-white">IC</span>
      </div>
      {!compact ? (
        <div className="leading-none">
          <p className="font-display text-base font-semibold tracking-tight text-white">ICM</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/80">Music Cloud</p>
        </div>
      ) : null}
    </Link>
  );
}
