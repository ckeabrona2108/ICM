import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import * as React from "react";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { ServiceWorkStatus } from "@/components/layout/service-work-status";
import { authOptions } from "@/lib/auth";

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
      <main className="h-screen min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
        <ServiceWorkStatus className="mb-6 flex min-w-0 items-center gap-2.5" />
        {children}
      </main>
    </div>
  );
}
