import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, ScanLine, Sheet } from "lucide-react";

import { authOptions } from "@/lib/auth";
import { getEventOwnerView } from "@/lib/events-service";
import { PageHeader } from "@/components/layout/page-header";
import { EventEditorClient } from "@/components/events/event-editor-client";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const EVENTS_DASHBOARD_ACCESS_ENABLED = false;

export default async function EventDetailsPage({
  params
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!EVENTS_DASHBOARD_ACCESS_ENABLED) redirect("/dashboard");

  const event = await getEventOwnerView(params.id, session.user.id);
  if (!event) redirect("/dashboard/events");

  return (
    <div className="pb-10">
      <PageHeader
        title={event.title}
        caption={`Статус: ${event.statusLabel}`}
        description="Редактируйте публичную карточку события, билетные типы, checkout и staff check-in без отдельного сервиса."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/events/${event.slug}`} target="_blank" rel="noreferrer">
              <Button variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Публичная страница
              </Button>
            </a>
            <a href={`/event/${params.id}/checkin`} target="_blank" rel="noreferrer">
              <Button variant="outline" className="gap-2">
                <ScanLine className="h-4 w-4" />
                Check-in
              </Button>
            </a>
            <a href={`/api/events/${params.id}/guest-list.xlsx`}>
              <Button variant="outline" className="gap-2">
                <Sheet className="h-4 w-4" />
                Excel guest list
              </Button>
            </a>
            <Link
              href="/dashboard/events"
              aria-label="Назад к списку событий"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/62 transition hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronLeft className="h-7 w-7" />
            </Link>
          </div>
        }
      />

      <EventEditorClient mode="edit" eventId={params.id} initialData={event} />
    </div>
  );
}
