import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getSmartLinkOwnerView } from "@/lib/smart-link-service";
import { SmartLinkSettingsClient } from "@/components/releases/smart-link-settings-client";

export const dynamic = "force-dynamic";

export default async function ReleaseSmartLinkPage({
  params
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const data = await getSmartLinkOwnerView({
    userId: session.user.id,
    releaseId: params.id
  });
  if (!data) {
    redirect("/dashboard/smart-links");
  }

  return (
    <div className="pb-10">
      <SmartLinkSettingsClient releaseId={params.id} initialData={data} />
    </div>
  );
}
