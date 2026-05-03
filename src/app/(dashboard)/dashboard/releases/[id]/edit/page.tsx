import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getCabinetReleaseByIdForUser } from "@/lib/cabinet-release-queries";

const ReleaseEditClient = dynamic(
  () =>
    import("@/components/releases/release-edit-client").then((m) => ({
      default: m.ReleaseEditClient
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-[13px] text-white/50">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#7b3df5]"
          aria-hidden
        />
        <span>Загрузка редактора релиза…</span>
      </div>
    )
  }
);

export default async function EditReleasePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const release = await getCabinetReleaseByIdForUser(session.user.id, params.id);
  if (!release) {
    notFound();
  }

  if (release.status === "moderation") {
    redirect("/dashboard/releases");
  }

  return <ReleaseEditClient release={release} />;
}
