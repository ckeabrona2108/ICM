"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { UserProvider } from "@/components/user/user-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <UserProvider>{children}</UserProvider>
    </SessionProvider>
  );
}
