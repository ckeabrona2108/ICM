import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

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
    redirect("/dashboard/smart-links");
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Редактирование"
        caption={<>UPC: {data.upc || "—"}</>}
        description="Управление Smart Link релиза: настройки страницы, ссылки на площадки, соцсети и подготовленные секции для дальнейшего продвижения."
        actions={
          <Link
            href="/dashboard/smart-links"
            aria-label="Выйти из редактирования"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/62 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ChevronLeft className="h-7 w-7" />
          </Link>
        }
      />
      <SmartLinkSettingsClient releaseId={params.id} initialData={data} />
    </div>
  );
}
