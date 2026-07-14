import * as React from "react";
import { cn } from "@/lib/utils";
import { IosInstallPrompt } from "@/components/pwa/ios-install-prompt";

interface PremiumShellProps {
  children: React.ReactNode;
  className?: string;
}

export function PremiumShell({ children, className }: PremiumShellProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen bg-[#090a10] bg-radial-premium text-foreground",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] before:bg-[size:40px_40px] before:opacity-20",
        className
      )}
    >
      <div className="relative z-10">{children}</div>
      <IosInstallPrompt />
    </div>
  );
}
