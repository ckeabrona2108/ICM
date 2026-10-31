import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthBackground } from "@/components/auth/auth-background";
import { AuthScrollUnlock } from "@/components/auth/auth-scroll-unlock";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate h-[100dvh] w-full overflow-hidden text-white">
      <AuthScrollUnlock />
      <AuthBackground />
      {/* The page itself is locked to the screen, so forms taller than it scroll here. */}
      <div className="relative h-full overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="flex min-h-full items-start justify-center px-4 py-10 sm:px-6 sm:py-12 md:items-center">
          {children}
        </div>
      </div>
    </div>
  );
}
