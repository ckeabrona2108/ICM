import Link from "next/link";
import { Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export function DashboardSectionUnavailable({
  title
}: {
  title: string;
}) {
  return (
    <DashboardShell className="min-h-[calc(100vh-150px)]">
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
        <div className="w-full max-w-2xl rounded-2xl border border-white/[0.1] bg-[#13151d]/88 p-8 text-center shadow-[0_20px_65px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/55">{title}</p>
          <h1 className="mt-3 text-[30px] font-bold leading-tight text-white sm:text-[34px]">
            Раздел временно недоступен
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[16px] font-medium text-white/72">
            Мы работаем над этим разделом.
          </p>
          <div className="mt-7 flex justify-center">
            <Link href="/dashboard">
              <Button variant="outline" className="h-12 gap-2 px-6 text-[18px]">
                <Wrench className="h-4 w-4" />
                На главную
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export function PublicSectionUnavailable() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-24">
      <div className="rounded-2xl border border-white/[0.1] bg-[#13151d]/85 p-8 text-center backdrop-blur-xl">
        <h1 className="text-[30px] font-bold leading-tight text-white sm:text-[34px]">
          Раздел временно недоступен
        </h1>
        <p className="mt-3 text-[16px] font-medium text-white/72">
          Мы работаем над этим разделом.
        </p>
        <div className="mt-6">
          <Link href="/dashboard">
            <Button variant="outline">Назад</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
