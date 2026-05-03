import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "min-h-24 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 py-2.5 text-[15px] font-medium text-foreground placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
