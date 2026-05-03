import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold tracking-wide",
  {
    variants: {
      variant: {
        default: "border-white/20 bg-white/10 text-foreground",
        success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
        warning: "border-amber-400/30 bg-amber-500/15 text-amber-200",
        danger: "border-red-400/30 bg-red-500/15 text-red-300",
        muted: "border-white/15 bg-white/5 text-white/70"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
