import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import * as React from "react";
import { PanelLeft } from "lucide-react";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { ServiceWorkStatus } from "@/components/layout/service-work-status";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("admin:toggle-mobile-sidebar"));
              }
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] text-white/82 transition-colors hover:bg-white/[0.08] lg:hidden"
            aria-label="Открыть меню администратора"
          >
            <PanelLeft className="h-4.5 w-4.5" />
          </button>
          <ServiceWorkStatus className="flex min-w-0 items-center gap-2.5" />
        </div>
        {children}
      </main>
    </div>
  );
}
