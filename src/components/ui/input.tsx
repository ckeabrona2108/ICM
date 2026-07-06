import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "block h-12 min-h-12 w-full appearance-none rounded-xl border border-white/[0.12] bg-black/25 px-4 py-0 text-[15px] font-medium leading-[1.2] text-foreground placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
