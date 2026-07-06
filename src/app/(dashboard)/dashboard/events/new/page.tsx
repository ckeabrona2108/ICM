import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { authOptions } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { EventEditorClient } from "@/components/events/event-editor-client";

export const dynamic = "force-dynamic";

const EVENTS_DASHBOARD_ACCESS_ENABLED = false;

export default async function NewEventPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!EVENTS_DASHBOARD_ACCESS_ENABLED) redirect("/dashboard");

  return (
    <div className="pb-10">
      <PageHeader
        title="Новое событие"
        description="Соберите публичную страницу концерта или вечеринки, задайте площадку, артистов, билеты и подготовьте всё к публикации."
        actions={
          <Link
            href="/dashboard/events"
            aria-label="Назад к списку событий"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/62 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ChevronLeft className="h-7 w-7" />
          </Link>
        }
      />

      <EventEditorClient mode="create" />
    </div>
  );
}
