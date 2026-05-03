import { cn } from "@/lib/utils";

interface AvatarProps {
  fallback: string;
  className?: string;
}

export function Avatar({ fallback, className }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-violet-500/30 text-xs font-semibold text-foreground",
        className
      )}
    >
      {fallback}
    </div>
  );
}
