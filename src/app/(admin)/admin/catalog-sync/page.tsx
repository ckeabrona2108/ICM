import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AdminCatalogSyncClient } from "@/components/admin/admin-catalog-sync-client";
import { authOptions } from "@/lib/auth";

export default async function AdminCatalogSyncPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">
        Smart Catalog Sync
      </h1>
      <p className="mt-2 max-w-4xl text-[14px] text-white/65">
        Импорт каталога и финансовых отчётов из CSV, TSV и XLSX с авто-определением колонок,
        предпросмотром совпадений, применением и откатом.
      </p>

      <div className="mt-6">
        <AdminCatalogSyncClient />
      </div>
    </div>
  );
}
