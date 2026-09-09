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
    <div className="relative isolate min-h-screen w-full overflow-x-hidden text-white">
      <AuthScrollUnlock />
      <AuthBackground />
      <div className="relative flex min-h-screen items-start justify-center px-4 py-10 sm:px-6 sm:py-12 md:items-center">
        {children}
      </div>
    </div>
  );
}
