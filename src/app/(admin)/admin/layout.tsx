import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import * as React from "react";

import { AdminMobileSidebarToggle } from "@/components/layout/admin-mobile-sidebar-toggle";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { ServiceWorkStatus } from "@/components/layout/service-work-status";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex h-screen max-w-[1920px] overflow-hidden">
      <AdminSidebar />
      <main className="h-screen min-w-0 flex-1 overflow-y-auto px-5 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-8 lg:px-10 lg:py-6">
        <div className="mb-6 flex min-w-0 items-center gap-3">
          <AdminMobileSidebarToggle />
          <ServiceWorkStatus className="flex min-w-0 items-center gap-2.5" />
        </div>
        {children}
      </main>
    </div>
  );
}
