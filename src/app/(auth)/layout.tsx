import type { ReactNode } from "react";

import { AuthBackground } from "@/components/auth/auth-background";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen w-full overflow-hidden text-white">
      <AuthBackground />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
        {children}
      </div>
    </div>
  );
}
