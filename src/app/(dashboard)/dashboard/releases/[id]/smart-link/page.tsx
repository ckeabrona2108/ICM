import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getSmartLinkOwnerView } from "@/lib/smart-link-service";
import { PageHeader } from "@/components/layout/page-header";
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
    notFound();
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Smart Link"
        description="Публичная страница релиза со ссылками на площадки, follow-блоком и базовой аналитикой переходов."
      />
      <SmartLinkSettingsClient releaseId={params.id} initialData={data} />
    </div>
  );
}
