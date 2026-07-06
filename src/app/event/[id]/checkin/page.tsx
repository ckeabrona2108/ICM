import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { EventCheckinClient } from "@/components/events/event-checkin-client";
import { authOptions } from "@/lib/auth";
import { getEventCheckinView } from "@/lib/event-ticketing";

export const dynamic = "force-dynamic";

export default async function EventCheckinPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { access?: string };
}) {
  const session = await getServerSession(authOptions);
  const data = await getEventCheckinView({
    eventId: params.id,
    organizerUserId: session?.user?.id ?? null,
    staffToken: searchParams.access ?? null
  }).catch(() => null);

  if (!data) notFound();

  return (
    <main className="min-h-screen bg-[#081018] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">
        <EventCheckinClient
          eventId={params.id}
          accessToken={searchParams.access}
          eventTitle={data.event.title}
          startsAt={data.event.startsAt}
          venueName={data.event.venueName}
          address={data.event.address}
          checkinMode={data.event.checkinMode}
          stats={data.stats}
          recent={data.recent}
          canManageLinks={data.accessType === "organizer"}
        />
      </div>
    </main>
  );
}
